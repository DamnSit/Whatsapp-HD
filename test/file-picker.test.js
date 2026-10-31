import test from "node:test";
import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import { copyFile, readFile, readdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { checkApiCompanion, launchPicker, waitForPickedFile, withPickedMedia } from "../src/android/file-picker.js";
import { imageFile, temporary } from "./helpers.js";

test("detects a missing Android companion when host package queries work", async () => {
  await assert.rejects(checkApiCompanion({ android: true, run: async (_command, args) => ({ stdout: args[1] === "com.termux" ? "package:host.apk" : "" }) }), /companion is missing/);
  await assert.rejects(checkApiCompanion({ android: true, run: async (_command, args) => {
    if (args[1] === "com.termux.api") throw Object.assign(new Error("Command failed"), { code: 1, stdout: "", stderr: "" });
    return { stdout: "package:host.apk" };
  } }), /companion is missing/);
  await checkApiCompanion({ android: true, run: async () => ({ stdout: "package:api.apk" }) });
  await checkApiCompanion({ android: true, run: async () => { throw new Error("package visibility denied"); } });
});

test("aborted picker waits for its process to close before temporary cleanup", async (t) => {
  const root = await temporary(t), controller = new AbortController();
  let child, destination, settled = false;
  const pending = withPickedMedia("image", () => assert.fail("cancelled picker must not upload"), {
    temporaryRoot: root, signal: controller.signal,
    pick: (file, options) => {
      destination = file;
      return launchPicker(file, { ...options, checkCompanion: async () => {}, spawnProcess: () => {
        child = new EventEmitter(); child.stderr = new EventEmitter(); child.kill = () => {};
        setImmediate(() => {
          controller.abort();
          child.emit("error", Object.assign(new Error("cancelled"), { name: "AbortError" }));
        });
        return child;
      } });
    }
  });
  const result = pending.then(() => { settled = true; }, (error) => { settled = true; return error; });
  while (!controller.signal.aborted) await new Promise(setImmediate);
  await new Promise((resolve) => setTimeout(resolve, 50));
  assert.equal(settled, false);
  await writeFile(destination, "partial copy still being written");
  child.emit("close", null, "SIGTERM");
  assert.equal((await result).name, "AbortError");
  assert.deepEqual(await readdir(root), []);
});

test("picker uses spawn argument array with a unique destination and no shell", async () => {
  let invocation;
  const spawnProcess = (...args) => { invocation = args; const child = new EventEmitter(); child.stderr = new EventEmitter(); setImmediate(() => child.emit("close", 0)); return child; };
  assert.equal(await launchPicker("a path/selection;not-a-command", { spawnProcess, checkCompanion: async () => {}, waitForFile: async () => true }), true);
  assert.deepEqual(invocation[1], ["a path/selection;not-a-command"]); assert.equal(invocation[2].shell, false);
});

test("early command exit waits for the delayed Android copy before validation", async (t) => {
  const root = await temporary(t), original = await imageFile(root);
  let child, destination, used = false;
  const pending = withPickedMedia("image", async (media) => {
    used = true;
    assert.deepEqual(await readFile(media.file), await readFile(original));
  }, { temporaryRoot: root, pick: (file, options) => {
    destination = file;
    return launchPicker(file, { ...options, checkCompanion: async () => {},
      waitForFile: (file, options) => waitForPickedFile(file, { ...options, interval: 10, settle: 100, timeout: 2000 }),
      spawnProcess: () => {
        child = new EventEmitter(); child.stderr = new EventEmitter();
        setImmediate(() => child.emit("close", 0));
        return child;
      }
    });
  } });
  while (!child) await new Promise(setImmediate);
  await new Promise((resolve) => setTimeout(resolve, 40));
  assert.equal(used, false);
  await writeFile(destination, "partial");
  await new Promise((resolve) => setTimeout(resolve, 40));
  assert.equal(used, false);
  await copyFile(original, destination);
  await pending;
  assert.equal(used, true);
  assert.deepEqual(await readdir(root), [path.basename(original)]);
});

test("cancelling after early exit stops waiting and removes temporary files", async (t) => {
  const root = await temporary(t), controller = new AbortController();
  let waiting;
  const pending = withPickedMedia("image", () => assert.fail("cancelled selection must not upload"), {
    temporaryRoot: root, signal: controller.signal, pick: (file, options) => launchPicker(file, {
      ...options, checkCompanion: async () => {},
      waitForFile: (file, options) => { waiting = true; return waitForPickedFile(file, options); },
      spawnProcess: () => { const child = new EventEmitter(); setImmediate(() => child.emit("close", 0)); return child; }
    })
  });
  const rejected = assert.rejects(pending, { name: "AbortError" });
  while (!waiting) await new Promise(setImmediate);
  controller.abort();
  await rejected;
  assert.deepEqual(await readdir(root), []);
  await assert.rejects(waitForPickedFile(path.join(root, "absent"), { timeout: 20, interval: 10 }), /No file received/);
});

test("API errors on stdout are reported even with a zero exit code", async () => {
  await assert.rejects(launchPicker("selection", { checkCompanion: async () => {}, waitForFile: () => assert.fail("API error must not wait"),
    spawnProcess: () => { const child = new EventEmitter(); child.stdout = new EventEmitter(); setImmediate(() => {
      child.stdout.emit("data", "ERROR: Permission denied"); child.emit("close", 0);
    }); return child; }
  }), /Permission denied/);
});

test("missing API, process errors and cancellation are handled", async () => {
  const spawnProcess = () => { const child = new EventEmitter(); child.stderr = new EventEmitter(); setImmediate(() => child.emit("error", Object.assign(new Error("missing"), { code: "ENOENT" }))); return child; };
  await assert.rejects(launchPicker("selection", { spawnProcess, checkCompanion: async () => {} }), /companion app/);
  const cancelled = () => { const child = new EventEmitter(); child.stderr = new EventEmitter(); setImmediate(() => { child.stderr.emit("data", "cancelled"); child.emit("close", 1); }); return child; };
  assert.equal(await launchPicker("selection", { spawnProcess: cancelled, checkCompanion: async () => {} }), false);
});

test("picker preserves source bytes and cleans only its temporary copy on success/error/cancel", async (t) => {
  const root = await temporary(t), original = await imageFile(root); const bytes = await readFile(original);
  const destinations = new Set();
  const pick = async (destination) => { destinations.add(destination); await copyFile(original, destination); return true; };
  await withPickedMedia("image", async (media) => { assert.equal(media.format, "PNG"); assert.deepEqual(await readFile(media.file), bytes); assert.equal(media.originalNameAvailable, false); }, { temporaryRoot: root, pick });
  await assert.rejects(withPickedMedia("image", async () => { throw new Error("upload failed"); }, { temporaryRoot: root, pick }), /upload failed/);
  await withPickedMedia("image", () => assert.fail("must not upload"), { temporaryRoot: root, pick: async (destination) => { await writeFile(destination, "partial"); return false; } });
  await withPickedMedia("image", () => assert.fail("must not upload"), { temporaryRoot: root, pick: async () => true });
  assert.equal(destinations.size, 2); assert.deepEqual(await readdir(root), [path.basename(original)]); assert.deepEqual(await readFile(original), bytes);
});
