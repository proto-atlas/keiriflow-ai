import { describe, expect, it } from "vitest";
import { validateUploadFile } from "./upload-validation";

describe("validateUploadFile", () => {
  it("PDFを渡したらnullを返す", () => {
    const file = new File(["invoice"], "invoice.pdf", { type: "application/pdf" });

    expect(validateUploadFile(file)).toBeNull();
  });

  it("大文字拡張子のJPEGを渡したらnullを返す", () => {
    const file = new File(["receipt"], "receipt.JPEG", { type: "image/jpeg" });

    expect(validateUploadFile(file)).toBeNull();
  });

  it("未対応MIMEを渡したらunsupported_file_typeを返す", () => {
    const file = new File(["script"], "script.exe", { type: "application/x-msdownload" });

    expect(validateUploadFile(file)).toBe("unsupported_file_type");
  });

  it("MIME typeと拡張子が一致しないファイルならunsupported_file_typeを返す", () => {
    const file = new File(["invoice"], "invoice.jpg", { type: "application/pdf" });

    expect(validateUploadFile(file)).toBe("unsupported_file_type");
  });

  it("拡張子がないファイルならunsupported_file_typeを返す", () => {
    const file = new File(["invoice"], "invoice", { type: "application/pdf" });

    expect(validateUploadFile(file)).toBe("unsupported_file_type");
  });

  it("10MBを超えるファイルを渡したらfile_too_largeを返す", () => {
    const file = new File([new Uint8Array(10 * 1024 * 1024 + 1)], "large.pdf", { type: "application/pdf" });

    expect(validateUploadFile(file)).toBe("file_too_large");
  });
});
