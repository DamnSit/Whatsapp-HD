import { stat } from "node:fs/promises";
import path from "node:path";
import { Jimp, ResizeStrategy } from "jimp";

const IMAGE_EXTENSIONS = new Set([".jpg", ".jpeg", ".png", ".webp"]);
const VIDEO_EXTENSIONS = new Set([".mp4", ".m4v"]);
const NATIVE_EXTENSIONS = new Set([...IMAGE_EXTENSIONS, ...VIDEO_EXTENSIONS, ".3gp"]);

export function formatBytes(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

export async function inspectMedia(inputPath, { native = false } = {}) {
  if (!inputPath) {
    throw new Error("--upload membutuhkan path file.");
  }

  const file = path.resolve(inputPath);
  const info = await stat(file);
  if (!info.isFile() || info.size === 0) {
    throw new Error("File tidak ditemukan, bukan file biasa, atau berukuran 0 byte.");
  }

  const extension = path.extname(file).toLowerCase();
  const supported = native
    ? NATIVE_EXTENSIONS.has(extension)
    : IMAGE_EXTENSIONS.has(extension) || VIDEO_EXTENSIONS.has(extension);

  if (!supported) {
    throw new Error(
      native
        ? "Format yang didukung: JPG, JPEG, PNG, WebP, MP4, M4V, dan 3GP."
        : "Format yang didukung Baileys: JPG, JPEG, PNG, WebP, MP4, dan M4V."
    );
  }

  const kind = IMAGE_EXTENSIONS.has(extension) ? "image" : "video";
  const mimeType = extension === ".jpg" || extension === ".jpeg"
    ? "image/jpeg"
    : extension === ".png"
      ? "image/png"
      : extension === ".webp"
        ? "image/webp"
        : extension === ".3gp"
          ? "video/3gpp"
          : "video/mp4";

  return {
    file,
    filename: path.basename(file),
    extension,
    size: info.size,
    kind,
    mimeType
  };
}

export async function prepareStatusPayload(media, caption = "") {
  if (media.kind === "image") {
    // Thumbnail is metadata only. The original file path is passed to Baileys;
    // the source image is never resized or re-encoded for the upload itself.
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
