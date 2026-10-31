import makeWASocket, { DisconnectReason, useMultiFileAuthState } from "@whiskeysockets/baileys";
import pino from "pino";
import path from "node:path";
import { log, errorMessage } from "./logger.js";
import { loadStatusAudience, parseStatusPrivacy, resolveStatusRecipients, saveStatusAudience } from "./status-audience.js";
import { normalizePhoneNumber } from "./cli-options.js";
import { publishStatus } from "./status-publisher.js";
import { exists, initializeStorage, privateDirectory } from "./storage/paths.js";
import { logoutAccount } from "./account/logout.js";

export async function createWhatsAppClient({ paths, options = {}, question,
  onState = () => {}, report = log, dependencies = {} } = {}) {
  paths ||= await initializeStorage();
  const makeSocket = dependencies.makeWASocket || makeWASocket;
  const authState = dependencies.useMultiFileAuthState || useMultiFileAuthState;
  const publish = dependencies.publishStatus || publishStatus;
  const logger = dependencies.logger || pino({ level: options.trace ? "trace" : "silent" });
  let socket, handlers, reconnectTimer, starting, connecting, resolveConnection, rejectConnection, connectTimer;
  let stopped = false, intentionalLogout = false, remoteLoggedOut = false, logoutPromise, syncPromise, uploadPromise;
  let generation = 0, privacyRevision = 0;
  let writes = Promise.resolve();
  let logoutEvent;
  let logoutCompleted = false;
  const state = { connection: "Disconnected", session: await exists(path.join(paths.authDir, "creds.json")) ? "Saved session" : "Pairing required", account: null, privacy: null, fresh: false, sync: "Not synchronized", warning: "" };
  try { state.privacy = await loadStatusAudience(paths.audienceFile); }
  catch (error) { state.warning = "Cache unavailable: " + errorMessage(error); }
  if (state.privacy) state.sync = "Cached — refresh required";
  function emit(patch = {}) { Object.assign(state, patch); onState({ ...state }); }
  function failConnection(error) {
    clearTimeout(connectTimer);
    rejectConnection?.(error);
    connecting = resolveConnection = rejectConnection = undefined;
  }
  function enqueueWrite(operation) {
    writes = writes.then(operation).catch((error) => {
      emit({ warning: "Cannot save application data: " + errorMessage(error) });
      report.error(state.warning);
    });
    return writes;
  }
  function detach() {
    if (socket && handlers) for (const [event, handler] of Object.entries(handlers)) socket.ev.off(event, handler);
    handlers = undefined;
  }
  async function closeLocal() {
    clearTimeout(reconnectTimer);
    reconnectTimer = undefined;
    generation++;
    detach();
    try { socket?.end?.(new Error("Local application stopped")); } catch { /* best effort */ }
    socket = undefined;
    failConnection(new Error("Connection closed."));
    await writes;
  }
  async function startSocket() {
    if (starting || stopped || intentionalLogout) return;
    starting = (async () => {
      detach();
      const current = ++generation;
      await privateDirectory(paths.authDir);
      const { state: auth, saveCreds } = await authState(paths.authDir);
      if (stopped || intentionalLogout || current !== generation) return;
      const writeKeys = auth.keys?.set?.bind(auth.keys);
      if (writeKeys) auth.keys.set = (data) => {
        if (stopped || intentionalLogout || current !== generation) return Promise.resolve();
        return enqueueWrite(() => writeKeys(data));
      };
      const active = makeSocket({ auth, logger, markOnlineOnConnect: false, connectTimeoutMs: 60000, defaultQueryTimeoutMs: 60000 });
      socket = active;
      const live = () => !stopped && current === generation;
      handlers = {
        "creds.update": () => { if (live() && !intentionalLogout) void enqueueWrite(saveCreds); },
        "settings.update": (update) => {
          if (!live() || intentionalLogout || update?.setting !== "statusPrivacy") return;
          const parsed = parseStatusPrivacy(update.value);
          if (!parsed) {
            emit({ privacy: null, fresh: false, sync: "Sync required", warning: "Unrecognized privacy mode; previous cache is not used." });
            return;
          }
          const privacy = { ...parsed.privacy, invalidCount: parsed.invalidCount, updatedAt: new Date().toISOString() };
          privacyRevision++;
          emit({ privacy, fresh: true, sync: "Synchronized", warning: "" });
          void enqueueWrite(() => saveStatusAudience(paths.audienceFile, privacy));
          report.info(`Status audience synchronized: ${privacy.userJid.length} unique recipient JIDs; ${privacy.invalidCount} invalid ignored.`);
        },
        "connection.update": ({ connection, lastDisconnect }) => {
          if (!live()) return;
          if (connection === "connecting") emit({ connection: "Connecting" });
          if (connection === "open") {
            emit({ connection: "Connected", session: "Linked", account: active.user?.id || null });
            clearTimeout(connectTimer);
            resolveConnection?.();
            connecting = resolveConnection = rejectConnection = undefined;
            report.success("WhatsApp terhubung.");
          }
          if (connection !== "close") return;
          const status = lastDisconnect?.error?.output?.statusCode;
          emit({ connection: "Disconnected", fresh: false, sync: state.privacy ? "Cached — connection closed" : "Not synchronized" });
          if (status === DisconnectReason.loggedOut) {
            remoteLoggedOut = true;
            emit({ session: "Logged out remotely" });
            logoutEvent?.();
            failConnection(new Error("WhatsApp session is logged out. Pair again through Linked devices."));
            return;
          }
          if (!intentionalLogout && !stopped && !reconnectTimer) {
            report.warn("Koneksi terputus: " + errorMessage(lastDisconnect?.error || "Reconnecting…"));
            reconnectTimer = setTimeout(() => {
              reconnectTimer = undefined;
              void startSocket().catch((error) => { failConnection(error); report.error(errorMessage(error)); });
            }, dependencies.reconnectDelay ?? 3000);
          }
        }
      };
      for (const [event, handler] of Object.entries(handlers)) active.ev.on(event, handler);
      if (!auth.creds.registered) {
        if (!question) throw new Error("Pairing requires an interactive phone-number prompt.");
        const number = normalizePhoneNumber(await question("WhatsApp number (international format / 0812…):"));
        await new Promise((resolve) => setTimeout(resolve, dependencies.pairingDelay ?? 1000));
        if (!live() || intentionalLogout) return;
        const code = await active.requestPairingCode(number);
        if (live()) report.success("Pairing code: " + code + " — WhatsApp → Linked devices → Link with phone number");
      } else report.info("Sesi tersimpan ditemukan.");
    })();
    try { await starting; } finally { starting = undefined; }
  }
  function connect() {
    if (stopped) return Promise.reject(new Error("Application has stopped."));
    if (intentionalLogout) return Promise.reject(new Error("Logout is in progress."));
    if (state.connection === "Connected") return Promise.resolve();
    if (connecting) return connecting;
    if (remoteLoggedOut) return Promise.reject(new Error("Session logged out. Use Account Management → Logout to clear this confirmed logged-out session, then pair again."));
    logoutCompleted = false;
    connecting = new Promise((resolve, reject) => { resolveConnection = resolve; rejectConnection = reject; });
    const result = connecting;
    clearTimeout(reconnectTimer);
    reconnectTimer = undefined;
    connectTimer = setTimeout(() => {
      failConnection(new Error("Connection timed out. Check your network and retry Connect."));
      void closeLocal().then(() => emit({ connection: "Disconnected" }));
    }, dependencies.connectTimeout ?? 180000);
    emit({ connection: "Connecting" });
    void startSocket().catch(async (error) => { failConnection(error); await closeLocal(); emit({ connection: "Disconnected" }); });
    return result;
  }
  function syncAudience() {
    if (syncPromise) return syncPromise;
    syncPromise = (async () => {
      await connect();
      const revision = privacyRevision;
      const active = socket;
      emit({ sync: "Synchronizing…", fresh: false, warning: "" });
      try {
        if (typeof active.resyncAppState !== "function") throw new Error("Baileys does not provide resyncAppState.");
        await active.resyncAppState(["regular_high"], false);
        await writes;
        if (active !== socket || intentionalLogout || stopped) throw new Error("Connection changed during synchronization.");
        if (privacyRevision === revision) emit({ fresh: false, sync: "No new privacy record", warning: 'No fresh Status privacy record received. Save "Only share with…" in WhatsApp and sync again.' });
        return state.privacy;
      } catch (error) {
        emit({ fresh: false, sync: "Synchronization failed", warning: errorMessage(error) });
        throw error;
      }
    })().finally(() => { syncPromise = undefined; });
    return syncPromise;
  }
  function upload(options) {
    if (uploadPromise) return Promise.reject(new Error("An upload is already in progress."));
    uploadPromise = (async () => {
      await connect();
      const recipients = resolveStatusRecipients({ manualRecipients: options.recipients, statusPrivacy: state.privacy });
      return publish(socket, { uploadPath: options.uploadPath, caption: options.caption, statusRecipients: recipients });
    })().finally(() => { uploadPromise = undefined; });
    return uploadPromise;
  }
  function logout() {
    if (logoutPromise) return logoutPromise;
    if (logoutCompleted) return Promise.resolve();
    if (uploadPromise) return Promise.reject(new Error("Wait for the upload before logging out."));
    logoutPromise = (async () => {
      if (!remoteLoggedOut) await connect();
      intentionalLogout = true;
      clearTimeout(reconnectTimer);
      reconnectTimer = undefined;
      emit({ connection: "Logging out…" });
      try {
        await logoutAccount({ paths, remoteLogout: async () => {
          if (remoteLoggedOut) return;
          const confirmed = new Promise((resolve) => { logoutEvent = resolve; });
          try { await Promise.race([socket.logout(), confirmed]); }
          catch (error) { if (!remoteLoggedOut) throw error; }
          remoteLoggedOut = true;
        }, quiesce: closeLocal });
        remoteLoggedOut = false;
        logoutCompleted = true;
        emit({ connection: "Disconnected", session: "Pairing required", account: null, privacy: null, fresh: false, sync: "Not synchronized", warning: "" });
      } catch (error) {
        await closeLocal();
        emit({ connection: "Disconnected", fresh: false, warning: "Logout incomplete. Local data was preserved unless remote logout succeeded: " + errorMessage(error) });
        throw error;
      } finally { intentionalLogout = false; logoutEvent = undefined; }
    })().finally(() => { logoutPromise = undefined; });
    return logoutPromise;
  }
  async function stop() {
    stopped = true;
    await closeLocal();
    if (uploadPromise) await uploadPromise.catch(() => {});
    emit({ connection: "Disconnected", fresh: false });
  }
  emit();
  return { paths, getState: () => ({ ...state }), connect, syncAudience, upload, logout, stop };
}

export async function runWhatsAppClient({ options, readline, onClient = () => {} }) {
  const client = await createWhatsAppClient({ options, question: (prompt) => readline.question(prompt + " ") });
  onClient(client);
  try {
    await client.connect();
    await client.syncAudience();
    const state = client.getState();
    log.info(`Audience: ${state.sync}`);
    if (state.warning) log.warn(state.warning);
    if (options.uploadPath) await client.upload(options);
    if (options.syncAudienceOnly || options.uploadPath) { await client.stop(); readline.close(); }
  } catch (error) { await client.stop(); readline.close(); throw error; }
  return () => client.stop();
}
