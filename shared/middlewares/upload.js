import multer from "multer";

// Every multer instance in this codebase used multer.memoryStorage()
// with no `limits` and no `fileFilter` — no cap on upload size (the
// whole file buffers into server RAM before anything else runs) and
// no check on file type before the buffer gets forwarded to
// Cloudinary. This factory is the shared fix; each route picks the
// size cap and allowed MIME types that make sense for what it accepts.
export const IMAGE_MIME_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/heic",
  "image/heif",
];

export const DOCUMENT_MIME_TYPES = [...IMAGE_MIME_TYPES, "application/pdf"];

// DICOM files often arrive with no reliable MIME type (browsers/OS
// commonly report them as application/octet-stream or leave the type
// blank), so this list is deliberately permissive on type and instead
// leans on the size cap. Tune maxSizeMB per real study sizes seen in
// practice — a single slice is usually well under this, but multi-frame
// studies can run larger.
export const RADIOLOGY_MIME_TYPES = [
  ...IMAGE_MIME_TYPES,
  "application/pdf",
  "application/dicom",
  "application/octet-stream",
];

export const createUpload = ({ maxSizeMB = 10, allowedMimeTypes = null, maxFiles = 10 } = {}) =>
  multer({
    storage: multer.memoryStorage(),
    limits: {
      fileSize: maxSizeMB * 1024 * 1024,
      files: maxFiles,
    },
    fileFilter: (req, file, cb) => {
      if (!allowedMimeTypes || allowedMimeTypes.includes(file.mimetype)) {
        return cb(null, true);
      }
      const error = new Error(`Unsupported file type: ${file.mimetype}`);
      error.code = "UPLOAD_REJECTED";
      cb(error);
    },
  });
