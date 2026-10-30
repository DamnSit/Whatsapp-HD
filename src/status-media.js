import { stat } from "node:fs/promises";
import path from "node:path";
import { Jimp, ResizeStrategy } from "jimp";

const IMAGE_EXTENSIONS = new Set([".jpg", ".jpeg", ".png", ".webp"]);
const VIDEO_EXTENSIONS = new Set([".mp4", ".m4v"]);

export function formatBytes(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

export async function inspectMedia(inputPath) {
  if (!inputPath) throw new Error("--upload membutuhkan path file.");

  const file = path.resolve(inputPath);
  const info = await stat(file);
  if (!info.isFile() || info.size === 0) {
    throw new Error("File tidak ditemukan, bukan file biasa, atau berukuran 0 byte.");
  }

  const extension = path.extname(file).toLowerCase();
  const kind = IMAGE_EXTENSIONS.has(extension) ? "image" : VIDEO_EXTENSIONS.has(extension) ? "video" : null;
  if (!kind) throw new Error("Format didukung: JPG, JPEG, PNG, WebP, MP4, dan M4V.");

  return {
    file,
    filename: path.basename(file),
    extension,
    size: info.size,
    kind
  };
}

export async function prepareStatusPayload(media, caption = "") {
  if (media.kind === "image") {
    // Preview metadata only; the original source path is uploaded unchanged.
    const image = await Jimp.read(media.file);
    const thumbnail = await image.clone()
      .resize({ w: 32, mode: ResizeStrategy.BILINEAR })
      .getBuffer("image/jpeg", { quality: 50 });

    return {
      content: {
        image: { url: media.file },
        jpegThumbnail: thumbnail.toString("base64"),
        width: image.width,
        height: image.height,
        ...(caption ? { caption } : {})
      },
      dimensions: `${image.width}×${image.height}`
    };
  }

  return {
    content: {
      video: { url: media.file },
      mimetype: "video/mp4",
      ...(caption ? { caption } : {})
    },
    dimensions: null
  };
}
