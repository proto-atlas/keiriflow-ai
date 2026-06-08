import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { resetMockUploadedDocumentsForTesting } from "@/lib/server/document-repository";
import { DEMO_ACCESS_KEY_HEADER } from "@/lib/server/demo-access";
import { POST } from "./route";

const TOO_LARGE_FILE_BYTES = 10 * 1024 * 1024 + 1;

beforeEach(() => {
  resetMockUploadedDocumentsForTesting();
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "");
  vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "");
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("POST /api/documents/upload", () => {
  it("fileがない場合は400 file_requiredを返す", async () => {
    const formData = new FormData();
    formData.set("documentType", "invoice");

    const response = await POST(createFormRequest(formData));
    const body = (await response.json()) as { error: string };

    expect(response.status).toBe(400);
    expect(body.error).toBe("file_required");
  });

  it("未対応MIMEのファイルなら400 unsupported_file_typeを返す", async () => {
    const formData = createValidFormData(new File(["text"], "memo.txt", { type: "text/plain" }));

    const response = await POST(createFormRequest(formData));
    const body = (await response.json()) as { error: string };

    expect(response.status).toBe(400);
    expect(body.error).toBe("unsupported_file_type");
  });

  it("10MB超のファイルなら400 file_too_largeを返す", async () => {
    const formData = createValidFormData(
      new File([new Uint8Array(TOO_LARGE_FILE_BYTES)], "large.pdf", { type: "application/pdf" }),
    );

    const response = await POST(createFormRequest(formData));
    const body = (await response.json()) as { error: string };

    expect(response.status).toBe(400);
    expect(body.error).toBe("file_too_large");
  });

  it("PDFと有効なformDataなら200とdocumentIdを返す", async () => {
    const formData = createValidFormData(new File(["pdf"], "invoice.pdf", { type: "application/pdf" }));

    const response = await POST(createFormRequest(formData));
    const body = (await response.json()) as { documentId: string; status: string; mode: string };

    expect(response.status).toBe(200);
    expect(body.documentId.startsWith("mock-upload-")).toBe(true);
    expect(body.status).toBe("Uploaded");
    expect(body.mode).toBe("mock");
  });

  it("確認用キーが必要な環境でkeyがない場合は401 demo_key_requiredを返す", async () => {
    vi.stubEnv("KEIRIFLOW_DEMO_ACCESS_KEY", "demo-secret");
    const formData = createValidFormData(new File(["pdf"], "invoice.pdf", { type: "application/pdf" }));

    const response = await POST(createFormRequest(formData));
    const body = (await response.json()) as { error: string };

    expect(response.status).toBe(401);
    expect(body.error).toBe("demo_key_required");
  });

  it("確認用キーが一致すればguard対象routeでも200を返す", async () => {
    vi.stubEnv("KEIRIFLOW_DEMO_ACCESS_KEY", "demo-secret");
    const formData = createValidFormData(new File(["pdf"], "invoice.pdf", { type: "application/pdf" }));

    const response = await POST(createFormRequest(formData, "demo-secret"));
    const body = (await response.json()) as { documentId: string; status: string; mode: string };

    expect(response.status).toBe(200);
    expect(body.documentId.startsWith("mock-upload-")).toBe(true);
    expect(body.status).toBe("Uploaded");
    expect(body.mode).toBe("mock");
  });
});

function createValidFormData(file: File) {
  const formData = new FormData();
  formData.set("documentType", "invoice");
  formData.set("memo", "一時登録");
  formData.set("file", file);
  return formData;
}

function createFormRequest(formData: FormData, accessKey?: string) {
  const headers = accessKey ? { [DEMO_ACCESS_KEY_HEADER]: accessKey } : undefined;

  return new Request("http://localhost/api/documents/upload", {
    headers,
    method: "POST",
    body: formData,
  });
}
