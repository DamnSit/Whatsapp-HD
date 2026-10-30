import makeWASocket, {
  DisconnectReason,
  useMultiFileAuthState
} from '@whiskeysockets/baileys';
import pino from 'pino';
import readline from 'node:readline/promises';
import { stdin, stdout } from 'node:process';
import { stat } from 'node:fs/promises';
import path from 'node:path';

const AUTH_DIR = process.env.WA_AUTH_DIR || './auth_info';
const args = process.argv.slice(2);
const verbose = args.includes('--trace');
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
      throw new Error(`Invalid recipient number: ${value}`);
    }
    return `${digits}@s.whatsapp.net`;
  });

const logger = pino({ level: verbose ? 'trace' : 'warn' });
const rl = readline.createInterface({ input: stdin, output: stdout });

let stopped = false;
let starting = false;
let reconnectTimer;
let uploadStarted = false;
let sock;

function normalizeNumber(input) {
  let number = input.replace(/\D/g, '');
  if (number.startsWith('0')) number = '62' + number.slice(1);
  if (!/^\d{8,15}$/.test(number)) {
    throw new Error('Invalid phone number. Use international digits, e.g. 62812xxxxxxx.');
  }
  return number;
}

function usage() {
  console.log(`
WhatsApp HD — local Termux CLI

Login / keep connection:
  npm start

Upload an image:
  node index.js --upload "/storage/emulated/0/Pictures/status.jpg" --to 62812xxxxxxx

Upload a video with caption:
  node index.js --upload "/storage/emulated/0/Download/video.mp4" --to 62812xxxxxxx,62813xxxxxxx --caption "Hello"

Options:
  --upload PATH    Image/video file to send as a Status
  --to NUMBERS     Recipients needed by Baileys for Status device fan-out
  --caption TEXT   Optional caption
  --trace          Verbose Baileys protocol logs (may include sensitive metadata)
  --help           Show this help

Notes:
  - Set your audience in WhatsApp Status Privacy first (for example, "Only share with").
  - Baileys also requires those same recipient JIDs in statusJidList for encryption and fan-out.
    The current Baileys API does not expose the exact contacts selected in WhatsApp's custom audience.
  - --to does not change your WhatsApp privacy settings; it supplies the transport recipient list.
  - Keep auth_info private; it contains login credentials.
  - This tool does not re-encode media. WhatsApp may still compress uploads.
  - A returned message ID is not proof that a Status was published. Check the trace ACK and
    recipient receipts; do not assume sendMessage() success means upload success.
`);
}

async function uploadStatus(socket) {
  if (!uploadPath || uploadStarted) return;
  if (recipients.length === 0) {
    console.error('Upload not started: Baileys needs --to so it can build the Status recipient device list.');
    console.error('Use the same contacts selected in WhatsApp Status Privacy. Example: --to 62812xxxxxxx');
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
      content = { image: { url: file }, ...(caption ? { caption } : {}) };
    } else if (['.mp4', '.m4v'].includes(ext)) {
      content = { video: { url: file }, mimetype: 'video/mp4', ...(caption ? { caption } : {}) };
    } else {
      throw new Error('Supported formats: JPG, JPEG, PNG, WebP, MP4, M4V.');
    }

    console.log(`File: ${file}`);
    console.log(`Size: ${(info.size / 1024 / 1024).toFixed(2)} MB`);
    console.log(`Baileys recipient JIDs supplied: ${recipients.length}`);
    console.log('WhatsApp Status Privacy is not modified by this tool.');
    console.log('Sending Status request...');

    const result = await socket.sendMessage('status@broadcast', content, {
      broadcast: true,
      statusJidList: recipients,
      mediaUploadTimeoutMs: 180000
    });

    console.log('Baileys returned message ID:', result?.key?.id ?? '(none)');
    console.log('The message ID alone does not prove publication.');
    console.log('If the Status is missing, rerun with --trace and inspect ACK errors and recipient receipts.');
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
    sock.ev.on('connection.update', async ({ connection, lastDisconnect }) => {
      if (connection === 'connecting') console.log('Connecting to WhatsApp...');
      if (connection === 'open') {
        console.log('WhatsApp connected.');
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

start().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
