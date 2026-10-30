import makeWASocket, {
  DisconnectReason,
  useMultiFileAuthState
} from '@whiskeysockets/baileys';
import pino from 'pino';
import readline from 'node:readline/promises';
import { stdin, stdout } from 'node:process';
import { stat, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { Jimp, ResizeStrategy } from 'jimp';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

// libsignal writes Signal session objects straight to console methods.
// Suppress only known sensitive session dumps; they can include private ratchet keys.
const sensitiveSignalPrefixes = [
  'Closing session:',
  'Closing stale open session',
  'Closing open session',
  'Removing old closed session:',
  'Opening session:'
];
const isSensitiveSignalLog = (values) => values.some((value) => {
  if (typeof value === 'string') {
    return sensitiveSignalPrefixes.some((prefix) => value.startsWith(prefix));
  }
  return value !== null &&
    typeof value === 'object' &&
    value.constructor?.name === 'SessionEntry';
});
for (const level of ['log', 'info', 'warn', 'error', 'debug']) {
  const original = console[level].bind(console);
  console[level] = (...values) => {
    if (isSensitiveSignalLog(values)) return;
    original(...values);
  };
}

const AUTH_DIR = process.env.WA_AUTH_DIR || './auth_info';
const AUDIENCE_FILE = process.env.WA_AUDIENCE_FILE || './status-audience.json';
const args = process.argv.slice(2);
const verbose = args.includes('--trace');
const syncAudienceOnly = args.includes('--sync-audience');
const nativeStatusOnly = args.includes('--native-status');
const getOption = (name) => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : undefined;
};
const uploadPath = getOption('--upload');
const caption = getOption('--caption') || '';
const recipientInput = getOption('--to') || '';
const recipients = recipientInput
  .split(',')
  .map((value) => value.trim())
  .filter(Boolean)
  .map((value) => {
    const digits = value.replace(/\D/g, '');
    if (!/^\d{8,15}$/.test(digits)) {
      throw new Error('Invalid recipient number: ' + value);
    }
    return digits + '@s.whatsapp.net';
  });

const STATUS_MODES = {
  0: 'ALLOW_LIST (Only share with)',
  1: 'DENY_LIST (My contacts except)',
  2: 'CONTACTS (My contacts)',
  3: 'CLOSE_FRIENDS'
};

const logger = pino({ level: verbose ? 'trace' : 'warn' });
const rl = readline.createInterface({ input: stdin, output: stdout });

let stopped = false;
let starting = false;
let reconnectTimer;
let uploadStarted = false;
let sock;
let statusPrivacy;
let audienceWritePromise = Promise.resolve();

function normalizeNumber(input) {
  let number = input.replace(/\D/g, '');
  if (number.startsWith('0')) number = '62' + number.slice(1);
  if (!/^\d{8,15}$/.test(number)) {
    throw new Error('Invalid phone number. Use international digits, e.g. 62812xxxxxxx.');
  }
  return number;
}

function normalizeSyncedJid(value) {
  const jid = String(value ?? '').trim();
  return /^\d{5,25}@(s\.whatsapp\.net|lid)$/.test(jid) ? jid : null;
}

async function loadStatusAudience() {
  try {
    const parsed = JSON.parse(await readFile(AUDIENCE_FILE, 'utf8'));
    const mode = Number(parsed.mode);
    const userJid = Array.isArray(parsed.userJid)
      ? [...new Set(parsed.userJid.map(normalizeSyncedJid).filter(Boolean))]
      : [];

    if (Number.isInteger(mode) && Object.hasOwn(STATUS_MODES, mode)) {
      statusPrivacy = { mode, userJid };
      console.log('Loaded locally cached Status audience: ' + STATUS_MODES[mode]);
    }
  } catch (error) {
    if (error?.code !== 'ENOENT') {
      console.warn('Could not read cached Status audience:', error?.message ?? error);
    }
  }
}

function rememberStatusPrivacy(value) {
  const mode = Number(value?.mode);
  if (!Number.isInteger(mode) || !Object.hasOwn(STATUS_MODES, mode)) {
    console.warn('Received an unknown Status privacy mode; automatic audience will not use it.');
    return;
  }

  const rawJids = Array.isArray(value?.userJid) ? value.userJid : [];
  const normalized = rawJids.map(normalizeSyncedJid);
  const invalidCount = normalized.filter((jid) => !jid).length;
  const userJid = [...new Set(normalized.filter(Boolean))];

  statusPrivacy = { mode, userJid };
  audienceWritePromise = writeFile(
    AUDIENCE_FILE,
    JSON.stringify({
      mode,
      userJid,
      updatedAt: new Date().toISOString()
    }, null, 2),
    { mode: 0o600 }
  ).catch((error) => {
    console.error('Could not save Status audience cache:', error?.message ?? error);
  });

  console.log(
    'WhatsApp Status audience synced: ' +
    STATUS_MODES[mode] +
    '; ' + userJid.length + ' recipient JID(s) received.'
  );
  if (invalidCount) {
    console.warn(invalidCount + ' unrecognized JID(s) were ignored.');
  }
}

function resolveStatusRecipients() {
  if (recipientInput) return recipients;

  if (!statusPrivacy) {
    throw new Error(
      'No Status audience has been synced yet. Run node index.js --sync-audience while connected, ' +
      'then change Status Privacy in the official app and sync again if no audience is found.'
    );
  }

  if (statusPrivacy.mode !== 0) {
    throw new Error(
      'Automatic sending currently supports only WhatsApp Status Privacy mode ' +
      '"Only share with..." (ALLOW_LIST). Current mode: ' + STATUS_MODES[statusPrivacy.mode] +
      '. No upload was attempted. Use --to as a manual override or select "Only share with..." in WhatsApp.'
    );
  }

  if (statusPrivacy.userJid.length === 0) {
    throw new Error(
      'WhatsApp synced ALLOW_LIST mode, but no recipient JIDs were present. No upload was attempted. ' +
      'Recheck the selected contacts in WhatsApp Status Privacy and sync again.'
    );
  }

  return statusPrivacy.userJid;
}

async function openNativeStatus() {
  if (!uploadPath) {
    throw new Error('--native-status requires --upload PATH.');
  }

  const file = path.resolve(uploadPath);
  const info = await stat(file);
  if (!info.isFile() || info.size === 0) {
    throw new Error('File is empty or not a regular file.');
  }

  const ext = path.extname(file).toLowerCase();
  if (!['.jpg', '.jpeg', '.png', '.webp', '.mp4', '.m4v', '.3gp'].includes(ext)) {
    throw new Error('Supported native Status formats: JPG, JPEG, PNG, WebP, MP4, M4V, 3GP.');
  }

  // Use Termux's termux-open integration to launch our exported deep link.
  // Calling /system/bin/am directly from an app UID can fail on Android 15+
  // because ActivityManager rejects the forged com.android.shell package identity.
  const bridgeUri = 'whatsapp-hd://status?' + new URLSearchParams({ media_path: file }).toString();

  let launch;
  try {
    launch = await execFileAsync('termux-open', [bridgeUri], { timeout: 30000 });
  } catch (error) {
    if (error?.code === 'ENOENT') {
      throw new Error('termux-open is unavailable. Update termux-tools in Termux, then retry: pkg install termux-tools');
    }
    throw error;
  }
  console.log('Whatsapp-HD Status Bridge launched.');
  console.log('File: ' + path.basename(file));
  console.log('Size: ' + (info.size / 1024 / 1024).toFixed(2) + ' MB');
  console.log('Review the preview and audience in WhatsApp, then tap Send.');
  if (caption) {
    console.log('Caption is not prefilled by the native bridge; add it in the WhatsApp editor.');
  }
  if (launch.stdout?.trim()) console.log(launch.stdout.trim());
  if (launch.stderr?.trim()) console.warn(launch.stderr.trim());
}

function usage() {
  console.log([
    '',
    'WhatsApp HD — local Termux CLI',
    '',
    'Login / keep connection:',
    '  npm start',
    '',
    'Sync the current WhatsApp Status audience:',
    '  node index.js --sync-audience',
    '',
    'Upload using the synced "Only share with..." audience:',
    '  node index.js --upload "/storage/emulated/0/Pictures/status.jpg"',
    '',
    'Manual recipient override:',
    '  node index.js --upload "/storage/emulated/0/Download/video.mp4" --to 62812xxxxxxx',
    '',
    'Options:',
    '  --upload PATH    Image/video file to send as a Status',
    '  --to NUMBERS     Optional manual recipient override (comma-separated)',
    '  --caption TEXT   Optional caption',
    '  --sync-audience  Sync Status privacy App State and exit',
    '  --native-status  Launch the Android Status Bridge for --upload media',
    '  --trace          Verbose Baileys protocol logs (may include sensitive metadata)',
    '  --help           Show this help',
    '',
    'Notes:',
    '  - Automatic recipient detection currently supports "Only share with..." (ALLOW_LIST).',
    '  - Baileys emits statusPrivacy App State updates as settings.update events.',
    '  - Other audience modes and newer custom/close-friends lists are not guessed or expanded.',
    '  - --to overrides the synced audience and should be used only when you intend to do so.',
    '  - Keep auth_info and status-audience.json private; both contain account-related data.',
    '  - --native-status requires the Whatsapp-HD Status Bridge APK to be installed.\n  - A returned message ID is not proof that a Status was published.'
  ].join('\n'));
}

async function syncStatusAudience(socket) {
  if (typeof socket.resyncAppState !== 'function') {
    console.warn('This Baileys build does not expose resyncAppState; cannot refresh Status privacy.');
    return;
  }

  console.log('Syncing WhatsApp Status privacy from App State (regular_high)...');
  try {
    await socket.resyncAppState(['regular_high'], false);
    await audienceWritePromise;
  } catch (error) {
    console.error('Status audience sync failed:', error?.message ?? error);
  }

  if (statusPrivacy) {
    console.log(
      'Status audience available: ' +
      STATUS_MODES[statusPrivacy.mode] +
      '; ' + statusPrivacy.userJid.length + ' recipient JID(s).'
    );
  } else {
    console.warn(
      'No Status privacy record was received. Do not upload yet. ' +
      'Change Status Privacy in the official WhatsApp app, then run --sync-audience again.'
    );
  }
}

async function uploadStatus(socket) {
  if (!uploadPath || uploadStarted) return;

  let statusRecipients;
  try {
    statusRecipients = resolveStatusRecipients();
  } catch (error) {
    console.error('Upload not started:', error.message);
    return;
  }

  uploadStarted = true;
  try {
    const file = path.resolve(uploadPath);
    const info = await stat(file);
    if (!info.isFile() || info.size === 0) throw new Error('File is empty or not a regular file.');

    const ext = path.extname(file).toLowerCase();
    let content;
    if (['.jpg', '.jpeg', '.png', '.webp'].includes(ext)) {
      // Supply the JPEG thumbnail ourselves. This avoids Baileys' optional
      // thumbnail-library lookup, which is unavailable in a fresh Termux install.
      const image = await Jimp.read(file);
      const thumbnail = await image.clone()
        .resize({ w: 32, mode: ResizeStrategy.BILINEAR })
        .getBuffer('image/jpeg', { quality: 50 });
      content = {
        image: { url: file },
        jpegThumbnail: thumbnail.toString('base64'),
        width: image.width,
        height: image.height,
        ...(caption ? { caption } : {})
      };
    } else if (['.mp4', '.m4v'].includes(ext)) {
      content = { video: { url: file }, mimetype: 'video/mp4', ...(caption ? { caption } : {}) };
    } else {
      throw new Error('Supported formats: JPG, JPEG, PNG, WebP, MP4, M4V.');
    }

    const senderJid = socket.user?.id;
    if (!senderJid || typeof senderJid !== 'string') {
      throw new Error('Baileys did not expose the connected sender JID; refusing to publish without self fan-out.');
    }

    // Include the account itself so the primary WhatsApp account can receive
    // its own Status update, alongside the audience selected in WhatsApp.
    const fanoutRecipients = [...new Set([senderJid, ...statusRecipients])];

    console.log('File: ' + file);
    console.log('Size: ' + (info.size / 1024 / 1024).toFixed(2) + ' MB');
    console.log('Status audience JIDs: ' + statusRecipients.length);
    console.log('Sender self JID included in device fan-out: yes');
    console.log('Total statusJidList entries: ' + fanoutRecipients.length);
    console.log('WhatsApp Status Privacy is not modified by this tool.');
    console.log('Sending Status request...');

    const result = await socket.sendMessage('status@broadcast', content, {
      broadcast: true,
      statusJidList: fanoutRecipients,
      mediaUploadTimeoutMs: 180000
    });

    console.log('Baileys returned message ID:', result?.key?.id ?? '(none)');
    console.log('The message ID alone does not prove publication.');
    console.log('Check the WhatsApp sender UI and recipient visibility before treating this as successful.');
  } catch (error) {
    uploadStarted = false;
    console.error('Status upload failed:', error?.message ?? error);
  }
}

async function start() {
  if (starting || stopped) return;
  starting = true;
  try {
    const { state, saveCreds } = await useMultiFileAuthState(AUTH_DIR);
    sock = makeWASocket({
      auth: state,
      logger,
      markOnlineOnConnect: false,
      connectTimeoutMs: 60000,
      defaultQueryTimeoutMs: 60000
    });

    sock.ev.on('creds.update', saveCreds);
    sock.ev.on('settings.update', (update) => {
      if (update?.setting === 'statusPrivacy') {
        rememberStatusPrivacy(update.value);
      }
    });

    sock.ev.on('connection.update', async ({ connection, lastDisconnect }) => {
      if (connection === 'connecting') console.log('Connecting to WhatsApp...');
      if (connection === 'open') {
        console.log('WhatsApp connected.');
        await syncStatusAudience(sock);

        if (syncAudienceOnly) {
          console.log('Audience sync check complete.');
          stopped = true;
          rl.close();
          process.exit(0);
        }

        await uploadStatus(sock);
      }
      if (connection !== 'close') return;

      const status = lastDisconnect?.error?.output?.statusCode;
      const message = lastDisconnect?.error?.message;
      console.log('Connection closed:', status ?? 'unknown', message ?? '');

      if (status === DisconnectReason.loggedOut) {
        console.error('Session logged out. Back up auth_info before relinking.');
        stopped = true;
        rl.close();
        return;
      }
      if (!stopped && !reconnectTimer) {
        reconnectTimer = setTimeout(() => {
          reconnectTimer = undefined;
          start().catch((error) => console.error('Reconnect failed:', error));
        }, 3000);
      }
    });

    if (!state.creds.registered) {
      const input = await rl.question('WhatsApp phone number (e.g. 08123456789): ');
      const number = normalizeNumber(input);
      try {
        await new Promise((resolve) => setTimeout(resolve, 1000));
        const code = await sock.requestPairingCode(number);
        console.log('\nPAIRING CODE:', code);
        console.log('Enter it in WhatsApp > Linked devices > Link with phone number.');
      } catch (error) {
        console.error('Could not request pairing code:', error?.message ?? error);
      }
    } else {
      console.log('Saved session found; connecting...');
    }
  } finally {
    starting = false;
  }
}

if (args.includes('--help') || args.includes('-h')) {
  usage();
  process.exit(0);
}

process.on('SIGINT', () => {
  stopped = true;
  if (reconnectTimer) clearTimeout(reconnectTimer);
  rl.close();
  process.exit(0);
});

if (nativeStatusOnly) {
  openNativeStatus().catch((error) => {
    console.error('Native Status handoff failed:', error?.message ?? error);
    process.exitCode = 1;
  }).finally(() => rl.close());
} else {
  await loadStatusAudience();
  start().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}
