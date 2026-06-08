const extensionByMimeType: Record<string, string> = {
  "application/pdf": "pdf",
  "image/png": "png",
  "image/jpeg": "jpg",
};

export function createStorageObjectKey(fileName: string, mimeType: string, objectId = crypto.randomUUID()): string {
  return `${objectId}.${getStorageExtension(fileName, mimeType)}`;
}

export function getStorageExtension(fileName: string, mimeType: string): string {
  const extensionFromMime = extensionByMimeType[mimeType];

  if (extensionFromMime) {
    return extensionFromMime;
  }

  const dotIndex = fileName.lastIndexOf(".");
  const rawExtension = dotIndex >= 0 ? fileName.slice(dotIndex + 1).toLowerCase() : "";

  return /^[a-z0-9]{1,10}$/.test(rawExtension) ? rawExtension : "bin";
}
