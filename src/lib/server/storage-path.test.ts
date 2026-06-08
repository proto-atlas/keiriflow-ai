import { describe, expect, it } from "vitest";
import { createStorageObjectKey, getStorageExtension } from "./storage-path";

describe("createStorageObjectKey", () => {
  it("MIME typeから拡張子を決めてUUIDだけのkeyを返す", () => {
    expect(createStorageObjectKey("../invoice.pdf", "application/pdf", "object-001")).toBe("object-001.pdf");
  });
});
describe("getStorageExtension", () => {
  it("jpegのMIME typeならjpgを返す", () => {
    expect(getStorageExtension("receipt.jpeg", "image/jpeg")).toBe("jpg");
  });

  it("MIME typeが未対応でも安全な拡張子なら小文字で返す", () => {
    expect(getStorageExtension("receipt.CSV", "text/csv")).toBe("csv");
  });

  it("拡張子が安全でなければbinを返す", () => {
    expect(getStorageExtension("receipt.", "application/octet-stream")).toBe("bin");
  });
});
