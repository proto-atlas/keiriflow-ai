export const DEMO_ACCESS_KEY_HEADER = "x-keiriflow-demo-key";
export const DEMO_ACCESS_KEY_STORAGE_KEY = "keiriflow.demoAccessKey";

export function readDemoAccessKey(): string {
  if (typeof window === "undefined") {
    return "";
  }

  return window.sessionStorage.getItem(DEMO_ACCESS_KEY_STORAGE_KEY)?.trim() ?? "";
}

export function writeDemoAccessKey(value: string): void {
  if (typeof window === "undefined") {
    return;
  }

  const trimmedValue = value.trim();

  if (!trimmedValue) {
    window.sessionStorage.removeItem(DEMO_ACCESS_KEY_STORAGE_KEY);
    return;
  }

  window.sessionStorage.setItem(DEMO_ACCESS_KEY_STORAGE_KEY, trimmedValue);
}

export function buildDemoAccessHeaders(headers?: HeadersInit): Headers {
  const nextHeaders = new Headers(headers);
  const accessKey = readDemoAccessKey();

  if (accessKey) {
    nextHeaders.set(DEMO_ACCESS_KEY_HEADER, accessKey);
  }

  return nextHeaders;
}
