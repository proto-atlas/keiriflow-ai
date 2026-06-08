const MAX_UPLOAD_SIZE_BYTES = 10 * 1024 * 1024;

const allowedUploadTypes = new Set(["application/pdf", "image/png", "image/jpeg"]);
const allowedUploadExtensionsByMimeType: Record<string, string[]> = {
  "application/pdf": ["pdf"],
  "image/png": ["png"],
  "image/jpeg": ["jpg", "jpeg"],
};

export type UploadFileValidationError = "unsupported_file_type" | "file_too_large";

export function validateUploadFile(file: File): UploadFileValidationError | null {
  if (!allowedUploadTypes.has(file.type)) {
    return "unsupported_file_type";
  }

  if (!isAllowedUploadExtension(file.name, file.type)) {
    return "unsupported_file_type";
  }

  if (file.size > MAX_UPLOAD_SIZE_BYTES) {
    return "file_too_large";
  }

  return null;
}

function isAllowedUploadExtension(fileName: string, mimeType: string) {
  const allowedExtensions = allowedUploadExtensionsByMimeType[mimeType] ?? [];
  const dotIndex = fileName.lastIndexOf(".");
  const extension = dotIndex >= 0 ? fileName.slice(dotIndex + 1).toLowerCase() : "";

  return allowedExtensions.includes(extension);
}
