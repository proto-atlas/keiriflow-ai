import { afterEach, describe, expect, it, vi } from "vitest";
import { mockDocuments } from "../mock-data";
import { AiProviderError, getAiProvider, parseAnthropicToolInput } from "./provider";

describe("getAiProvider", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it("AI provider envがない場合はmock providerを返す", () => {
    vi.stubEnv("AI_PROVIDER_MODE", "mock");
    vi.stubEnv("ANTHROPIC_API_KEY", "");
    vi.stubEnv("ANTHROPIC_MODEL", "");

    expect(getAiProvider().mode).toBe("mock");
  });

  it("Anthropic modeでmodelがない場合はprovider_not_configuredを返す", () => {
    vi.stubEnv("AI_PROVIDER_MODE", "anthropic");
    vi.stubEnv("ANTHROPIC_API_KEY", "test-key");
    vi.stubEnv("ANTHROPIC_MODEL", "");

    expect(() => getAiProvider()).toThrow("provider_not_configured");
  });

  it("mock providerに証憑を渡したら抽出候補を返す", async () => {
    vi.stubEnv("AI_PROVIDER_MODE", "mock");

    const provider = getAiProvider();
    const result = await provider.extractDocument({ document: mockDocuments[0] });

    expect(result.vendorName).toBe("サンプル広告株式会社");
    expect(result.totalAmount).toBe(110000);
  });

  it("mock providerに未抽出のアップロード証憑を渡したらサンプル抽出候補を返す", async () => {
    vi.stubEnv("AI_PROVIDER_MODE", "mock");

    const provider = getAiProvider();
    const result = await provider.extractDocument({
      document: {
        ...mockDocuments[0],
        id: "mock-upload-preview",
        status: "Uploaded",
        vendorName: "未抽出",
      },
    });

    expect(result.vendorName).toBe("サンプル広告株式会社");
  });

  it("mock providerに証憑を渡したら仕訳候補を返す", async () => {
    vi.stubEnv("AI_PROVIDER_MODE", "mock");

    const provider = getAiProvider();
    const result = await provider.generateJournal({ document: mockDocuments[0] });

    expect(result.debitAccount).toBe("広告宣伝費");
    expect(result.creditAccount).toBe("未払金");
  });

  it("Anthropic providerでrate limitならsanitized errorを返す", async () => {
    stubAnthropicEnv();
    vi.stubGlobal("fetch", vi.fn(() => Promise.resolve(new Response("rate limited", { status: 429 }))));

    await expect(getAiProvider().extractDocument({ document: mockDocuments[0] })).rejects.toThrow(
      "provider_rate_limited",
    );
  });

  it("Anthropic providerで認証失敗ならsanitized errorを返す", async () => {
    stubAnthropicEnv();
    vi.stubGlobal("fetch", vi.fn(() => Promise.resolve(new Response("unauthorized", { status: 401 }))));

    await expect(getAiProvider().extractDocument({ document: mockDocuments[0] })).rejects.toThrow(
      "provider_auth_failed",
    );
  });

  it("Anthropic providerでbad requestならsanitized errorを返す", async () => {
    stubAnthropicEnv();
    vi.stubGlobal("fetch", vi.fn(() => Promise.resolve(new Response("bad request", { status: 400 }))));

    await expect(getAiProvider().extractDocument({ document: mockDocuments[0] })).rejects.toThrow(
      "provider_bad_request",
    );
  });

  it("Anthropic providerでtimeoutならsanitized errorを返す", async () => {
    stubAnthropicEnv();
    vi.stubGlobal("fetch", vi.fn(() => Promise.reject(new DOMException("aborted", "AbortError"))));

    await expect(getAiProvider().extractDocument({ document: mockDocuments[0] })).rejects.toThrow(
      "provider_timeout",
    );
  });

  it("Anthropic providerの抽出ではPDFをdocument blockとしてtextより前に送る", async () => {
    stubAnthropicEnv();
    const fetchMock = vi.fn(() =>
      Promise.resolve(
        jsonResponse(
          anthropicToolResponse("return_extraction", {
            vendorName: "PDF株式会社",
            invoiceNumber: "INV-001",
            registrationNumber: "T1234567890123",
            issueDate: "2026-05-07",
            dueDate: "2026-05-31",
            subtotal: 1000,
            taxAmount: 100,
            totalAmount: 1100,
            taxRate: 0.1,
            confidenceScore: 0.9,
            memo: "PDFから抽出",
          }),
        ),
      ),
    );
    vi.stubGlobal("fetch", fetchMock);

    const result = await getAiProvider().extractDocument({
      document: mockDocuments[0],
      documentFile: {
        bytes: new Uint8Array([37, 80, 68, 70]).buffer,
        fileName: "invoice.pdf",
        mediaType: "application/pdf",
      },
    });
    const payload = readAnthropicRequestBody(fetchMock);
    const content = payload.messages[0]?.content;

    expect(result.vendorName).toBe("PDF株式会社");
    expect(content[0]).toMatchObject({
      type: "document",
      source: {
        type: "base64",
        media_type: "application/pdf",
        data: "JVBERg==",
      },
    });
    expect(content[1]).toMatchObject({ type: "text" });
  });

  it("Anthropic providerの抽出では画像をimage blockとして送る", async () => {
    stubAnthropicEnv();
    const fetchMock = vi.fn(() =>
      Promise.resolve(
        jsonResponse(
          anthropicToolResponse("return_extraction", {
            vendorName: "画像株式会社",
            invoiceNumber: "IMG-001",
            registrationNumber: "",
            issueDate: "2026-05-07",
            dueDate: "2026-05-31",
            subtotal: 1000,
            taxAmount: 100,
            totalAmount: 1100,
            taxRate: 0.1,
            confidenceScore: 0.8,
            memo: "画像から抽出",
          }),
        ),
      ),
    );
    vi.stubGlobal("fetch", fetchMock);

    await getAiProvider().extractDocument({
      document: mockDocuments[0],
      documentFile: {
        bytes: new Uint8Array([1, 2, 3]).buffer,
        fileName: "receipt.png",
        mediaType: "image/png",
      },
    });
    const payload = readAnthropicRequestBody(fetchMock);
    const content = payload.messages[0]?.content;

    expect(content[0]).toMatchObject({
      type: "image",
      source: {
        type: "base64",
        media_type: "image/png",
        data: "AQID",
      },
    });
  });

  it("Anthropic providerの抽出で未対応MIMEならsanitized errorを返す", async () => {
    stubAnthropicEnv();

    await expect(
      getAiProvider().extractDocument({
        document: mockDocuments[0],
        documentFile: {
          bytes: new TextEncoder().encode("text").buffer,
          fileName: "memo.txt",
          mediaType: "text/plain",
        },
      }),
    ).rejects.toThrow("provider_unsupported_media_type");
  });

  it("Anthropic providerでtool_useが無ければsanitized errorを返す", async () => {
    stubAnthropicEnv();
    vi.stubGlobal("fetch", vi.fn(() => Promise.resolve(jsonResponse({ content: [] }))));

    await expect(getAiProvider().extractDocument({ document: mockDocuments[0] })).rejects.toThrow(
      "provider_tool_output_missing",
    );
  });

  it("Anthropic providerで抽出結果schemaに合わなければsanitized errorを返す", async () => {
    stubAnthropicEnv();
    vi.stubGlobal(
      "fetch",
      vi.fn(() =>
        Promise.resolve(
          jsonResponse(
            anthropicToolResponse("return_extraction", {
              vendorName: "",
              invoiceNumber: "",
              registrationNumber: "",
              issueDate: "",
              dueDate: "",
              subtotal: 0,
              taxAmount: 0,
              totalAmount: 0,
              taxRate: 0,
              confidenceScore: 0,
              memo: "",
            }),
          ),
        ),
      ),
    );

    await expect(getAiProvider().extractDocument({ document: mockDocuments[0] })).rejects.toThrow(
      "provider_extraction_invalid",
    );
  });

  it("Anthropic providerで仕訳候補schemaに合わなければsanitized errorを返す", async () => {
    stubAnthropicEnv();
    vi.stubGlobal(
      "fetch",
      vi.fn(() =>
        Promise.resolve(
          jsonResponse(
            anthropicToolResponse("return_journal_entry", {
              debitAccount: "",
              debitAmount: 0,
              debitTaxCategory: "",
              creditAccount: "",
              creditAmount: 0,
              creditTaxCategory: "",
              department: "",
              description: "",
              aiReason: "",
              confidenceScore: 0,
            }),
          ),
        ),
      ),
    );

    await expect(getAiProvider().generateJournal({ document: mockDocuments[0] })).rejects.toThrow(
      "provider_journal_invalid",
    );
  });

  it("Anthropic providerの抽出では画像優先のpromptを送る", async () => {
    stubAnthropicEnv();
    const fetchMock = vi.fn(() =>
      Promise.resolve(
        jsonResponse(
          anthropicToolResponse("return_extraction", {
            vendorName: "テスト株式会社",
            invoiceNumber: "INV-001",
            registrationNumber: "T1234567890123",
            issueDate: "2026-05-09",
            dueDate: "2026-05-31",
            subtotal: 1000,
            taxAmount: 100,
            totalAmount: 1100,
            taxRate: 0.1,
            confidenceScore: 0.9,
            memo: "",
          }),
        ),
      ),
    );
    vi.stubGlobal("fetch", fetchMock);

    await getAiProvider().extractDocument({
      document: mockDocuments[0],
      documentFile: {
        bytes: new Uint8Array([1, 2, 3]).buffer,
        fileName: "invoice.png",
        mediaType: "image/png",
      },
    });
    const payload = readAnthropicRequestBody(fetchMock);
    const textBlock = payload.messages[0].content.find((c: Record<string, unknown>) => c.type === "text");

    expect(String(textBlock?.text)).toMatch(/添付の証憑画像から/);
    expect(String(textBlock?.text)).not.toMatch(/次の証憑メタデータから/);
  });

  it("Anthropic providerの抽出ではfresh uploadのplaceholderをmetadataから除外する", async () => {
    stubAnthropicEnv();
    const fetchMock = vi.fn(() =>
      Promise.resolve(
        jsonResponse(
          anthropicToolResponse("return_extraction", {
            vendorName: "テスト株式会社",
            invoiceNumber: "INV-001",
            registrationNumber: "T1234567890123",
            issueDate: "2026-05-09",
            dueDate: "2026-05-31",
            subtotal: 1000,
            taxAmount: 100,
            totalAmount: 1100,
            taxRate: 0.1,
            confidenceScore: 0.9,
            memo: "",
          }),
        ),
      ),
    );
    vi.stubGlobal("fetch", fetchMock);

    await getAiProvider().extractDocument({
      document: {
        ...mockDocuments[0],
        status: "Uploaded",
        vendorName: "未抽出",
        invoiceNumber: "未抽出",
        subtotal: 1,
        taxAmount: 0,
        totalAmount: 1,
        taxRate: 0,
      },
      documentFile: {
        bytes: new Uint8Array([1, 2, 3]).buffer,
        fileName: "invoice.png",
        mediaType: "image/png",
      },
    });
    const payload = readAnthropicRequestBody(fetchMock);
    const textBlock = payload.messages[0].content.find((c: Record<string, unknown>) => c.type === "text");

    expect(String(textBlock?.text)).not.toContain('"vendorName":"未抽出"');
    expect(String(textBlock?.text)).not.toContain('"invoiceNumber":"未抽出"');
    expect(String(textBlock?.text)).toContain('"vendorName":null');
    expect(String(textBlock?.text)).toContain('"subtotal":null');
  });
});

describe("parseAnthropicToolInput", () => {
  it("tool_use blockがある場合はinputだけを返す", () => {
    const result = parseAnthropicToolInput(
      {
        content: [
          {
            type: "tool_use",
            name: "return_extraction",
            input: {
              vendorName: "Example Inc.",
            },
          },
        ],
      },
      "return_extraction",
    );

    expect(result).toEqual({ vendorName: "Example Inc." });
  });

  it("tool_use blockがない場合はsanitized errorを返す", () => {
    expect(() => parseAnthropicToolInput({ content: [] }, "return_extraction")).toThrow(AiProviderError);
  });
});

function stubAnthropicEnv() {
  vi.stubEnv("AI_PROVIDER_MODE", "anthropic");
  vi.stubEnv("ANTHROPIC_API_KEY", "test-key");
  vi.stubEnv("ANTHROPIC_MODEL", "test-model");
}

function jsonResponse(payload: unknown) {
  return new Response(JSON.stringify(payload), {
    headers: {
      "content-type": "application/json",
    },
  });
}

function anthropicToolResponse(toolName: string, input: unknown) {
  return {
    content: [
      {
        type: "tool_use",
        name: toolName,
        input,
      },
    ],
  };
}

function readAnthropicRequestBody(fetchMock: ReturnType<typeof vi.fn>) {
  const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
  return JSON.parse(String(init.body)) as {
    messages: Array<{
      content: Array<Record<string, unknown>>;
    }>;
  };
}
