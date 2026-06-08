import { afterEach, describe, expect, it } from "vitest";
import {
  buildDemoAccessHeaders,
  DEMO_ACCESS_KEY_HEADER,
  DEMO_ACCESS_KEY_STORAGE_KEY,
  readDemoAccessKey,
  writeDemoAccessKey,
} from "./demo-access-key";

afterEach(() => {
  Reflect.deleteProperty(globalThis, "window");
});

describe("確認用キーのclient helper", () => {
  it("windowがない環境では空文字を返す", () => {
    const value = readDemoAccessKey();

    expect(value).toBe("");
  });

  it("sessionStorageに保存したkeyをheaderへ付与する", () => {
    installWindowWithSessionStorage();

    writeDemoAccessKey(" demo-secret ");
    const headers = buildDemoAccessHeaders();

    expect(readDemoAccessKey()).toBe("demo-secret");
    expect(headers.get(DEMO_ACCESS_KEY_HEADER)).toBe("demo-secret");
  });

  it("空文字を書き込むとsessionStorageからkeyを削除する", () => {
    const sessionStorage = installWindowWithSessionStorage();

    writeDemoAccessKey("demo-secret");
    writeDemoAccessKey("");

    expect(sessionStorage.getItem(DEMO_ACCESS_KEY_STORAGE_KEY)).toBeNull();
    expect(readDemoAccessKey()).toBe("");
  });
});

function installWindowWithSessionStorage(): Storage {
  const store = new Map<string, string>();
  const sessionStorage: Storage = {
    get length() {
      return store.size;
    },
    clear() {
      store.clear();
    },
    getItem(key: string) {
      return store.get(key) ?? null;
    },
    key(index: number) {
      return Array.from(store.keys())[index] ?? null;
    },
    removeItem(key: string) {
      store.delete(key);
    },
    setItem(key: string, value: string) {
      store.set(key, value);
    },
  };

  Object.defineProperty(globalThis, "window", {
    configurable: true,
    value: { sessionStorage },
  });

  return sessionStorage;
}
