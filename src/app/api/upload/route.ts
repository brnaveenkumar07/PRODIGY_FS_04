import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

import { errorResponse, successResponse } from "@/lib/api-response";
import { getAuthPayloadFromRequest } from "@/lib/auth";
import { enforceRateLimit } from "@/lib/rate-limit";

export const runtime = "nodejs";

const MAX_UPLOAD_SIZE_BYTES = 25 * 1024 * 1024;

const ALLOWED_EXTENSIONS = new Set([
  "7z",
  "avi",
  "avif",
  "bmp",
  "csv",
  "doc",
  "docx",
  "gif",
  "heic",
  "heif",
  "jpg",
  "jpeg",
  "json",
  "m4a",
  "mkv",
  "mov",
  "mp3",
  "mp4",
  "ogg",
  "pdf",
  "png",
  "ppt",
  "pptx",
  "rar",
  "rtf",
  "txt",
  "wav",
  "webm",
  "webp",
  "xls",
  "xlsx",
  "zip",
]);

const ALLOWED_MIME_TYPES = new Set([
  "application/json",
  "application/msword",
  "application/pdf",
  "application/rtf",
  "application/vnd.ms-excel",
  "application/vnd.ms-powerpoint",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/x-rar-compressed",
  "application/x-zip-compressed",
  "application/zip",
  "audio/mpeg",
  "audio/mp4",
  "audio/ogg",
  "audio/wave",
  "audio/wav",
  "audio/x-wav",
  "image/avif",
  "image/bmp",
  "image/gif",
  "image/heic",
  "image/heif",
  "image/jpeg",
  "image/png",
  "image/webp",
  "text/csv",
  "text/plain",
  "video/ogg",
  "video/quicktime",
  "video/webm",
  "video/x-msvideo",
  "video/x-matroska",
  "video/mp4",
]);

const MIME_EXTENSION_FALLBACK: Record<string, string> = {
  "application/json": "json",
  "application/msword": "doc",
  "application/pdf": "pdf",
  "application/rtf": "rtf",
  "application/vnd.ms-excel": "xls",
  "application/vnd.ms-powerpoint": "ppt",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation": "pptx",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": "xlsx",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "docx",
  "application/x-rar-compressed": "rar",
  "application/x-zip-compressed": "zip",
  "application/zip": "zip",
  "audio/mpeg": "mp3",
  "audio/mp4": "m4a",
  "audio/ogg": "ogg",
  "audio/wave": "wav",
  "audio/wav": "wav",
  "audio/x-wav": "wav",
  "image/avif": "avif",
  "image/bmp": "bmp",
  "image/gif": "gif",
  "image/heic": "heic",
  "image/heif": "heif",
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "text/csv": "csv",
  "text/plain": "txt",
  "video/mp4": "mp4",
  "video/ogg": "ogg",
  "video/quicktime": "mov",
  "video/webm": "webm",
  "video/x-matroska": "mkv",
  "video/x-msvideo": "avi",
};

function resolveSafeExtension(
  fileName: string,
  mimeType: string | undefined
): string {
  const extension = fileName.split(".").pop()?.toLowerCase();
  if (extension && /^[a-z0-9]{1,10}$/.test(extension) && ALLOWED_EXTENSIONS.has(extension)) {
    return extension;
  }

  if (mimeType && ALLOWED_MIME_TYPES.has(mimeType)) {
    const fallback = MIME_EXTENSION_FALLBACK[mimeType];
    if (fallback) {
      return fallback;
    }
  }

  return "bin";
}

function isAllowedUpload(file: File): boolean {
  const extension = file.name.split(".").pop()?.toLowerCase() ?? "";
  const hasAllowedExtension = ALLOWED_EXTENSIONS.has(extension);
  const hasAllowedMimeType = Boolean(file.type && ALLOWED_MIME_TYPES.has(file.type));

  return hasAllowedExtension || hasAllowedMimeType;
}

export async function POST(req: Request) {
  const rateLimitResponse = enforceRateLimit(req, "upload:file", {
    max: 40,
    windowMs: 60_000,
  });
  if (rateLimitResponse) {
    return rateLimitResponse;
  }

  const authPayload = await getAuthPayloadFromRequest(req);
  if (!authPayload) {
    return errorResponse("Unauthorized.", 401);
  }

  const formData = await req.formData();
  const fileEntry = formData.get("file");

  if (!(fileEntry instanceof File)) {
    return errorResponse("A file is required.");
  }

  if (!isAllowedUpload(fileEntry)) {
    return errorResponse("Unsupported file type.", 415);
  }

  if (fileEntry.size > MAX_UPLOAD_SIZE_BYTES) {
    return errorResponse("File size exceeds 25 MB limit.", 413);
  }

  const uploadsDirectory = path.join(process.cwd(), "public", "uploads");
  await mkdir(uploadsDirectory, { recursive: true });

  const extension = resolveSafeExtension(fileEntry.name, fileEntry.type);
  const fileName = `${Date.now()}-${crypto.randomUUID()}.${extension}`;
  const fileBuffer = Buffer.from(await fileEntry.arrayBuffer());

  await writeFile(path.join(uploadsDirectory, fileName), fileBuffer);

  return successResponse(
    {
      url: `/uploads/${fileName}`,
      name: fileEntry.name,
      size: fileEntry.size,
      mimeType: fileEntry.type || null,
    },
    201
  );
}
