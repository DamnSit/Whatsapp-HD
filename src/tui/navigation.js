import { StringDecoder } from "node:string_decoder";
import { stripVTControlCharacters } from "node:util";

export function cleanText(text) {
  return stripVTControlCharacters(String(text)).replace(/\r\n?/g, "\n").replace(/[\x00-\x08\x0b-\x1f\x7f-\x9f]/g, "");
}

export function navigate(index, key, length) {
  if (!length) return 0;
  if (key === "up") return (index + length - 1) % length;
  if (key === "down") return (index + 1) % length;
  if (key === "home") return 0;
  if (key === "end") return length - 1;
  return index;
}

const escapes = { "\x1b[A": "up", "\x1b[B": "down", "\x1b[C": "right", "\x1b[D": "left", "\x1b[H": "home", "\x1b[F": "end", "\x1bOH": "home", "\x1bOF": "end", "\x1b[1~": "home", "\x1b[4~": "end", "\x1b[3~": "delete", "\x1b[5~": "pageup", "\x1b[6~": "pagedown" };

export class InputDecoder {
  constructor(emit) { this.emit = emit; this.decoder = new StringDecoder("utf8"); this.buffer = ""; this.paste = false; this.timer = undefined; }
  feed(chunk) {
    clearTimeout(this.timer);
    this.buffer += Buffer.isBuffer(chunk) ? this.decoder.write(chunk) : chunk;
    while (this.buffer) {
      if (this.paste) {
        const end = this.buffer.indexOf("\x1b[201~");
        if (end < 0) return;
        this.emit({ name: "text", text: cleanText(this.buffer.slice(0, end)), paste: true });
        this.buffer = this.buffer.slice(end + 6); this.paste = false; continue;
      }
      if (this.buffer.startsWith("\x1b[200~")) { this.buffer = this.buffer.slice(6); this.paste = true; continue; }
      if (this.buffer[0] === "\x1b") {
        const sequence = /^(\x1b\[[0-?]*[ -/]*[@-~]|\x1bO[A-Za-z]|\x1b\][^\x07]*(?:\x07|\x1b\\))/.exec(this.buffer)?.[0];
        if (sequence) { this.buffer = this.buffer.slice(sequence.length); if (escapes[sequence]) this.emit({ name: escapes[sequence] }); continue; }
        if (this.buffer.length === 1 || /^\x1b[\[O\]]/.test(this.buffer)) {
          this.timer = setTimeout(() => { const alone = this.buffer === "\x1b"; this.buffer = ""; if (alone) this.emit({ name: "escape" }); }, 60);
          return;
        }
        // Ignore unsupported Alt/escape commands, never store them as captions.
        this.buffer = this.buffer.slice(2); continue;
      }
      const character = String.fromCodePoint(this.buffer.codePointAt(0));
      this.buffer = this.buffer.slice(character.length);
      const controls = { "\x03": "interrupt", "\x15": "clear", "\r": "enter", "\n": "newline", "\x7f": "backspace", "\b": "backspace", "\x01": "home", "\x05": "end", "\x04": "delete", "\t": "tab" };
      if (controls[character]) this.emit({ name: controls[character] });
      else if (character >= " " && !/[\x7f-\x9f]/.test(character)) this.emit({ name: "text", text: character });
    }
  }
  close() { clearTimeout(this.timer); this.buffer = ""; }
}
