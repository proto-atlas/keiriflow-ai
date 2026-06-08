import { UNEXTRACTED_PLACEHOLDER } from "../document-placeholders";
import { mockDocuments } from "../mock-data";
import type { DocumentFile } from "../server/document-repository";
import type { AccountingDocument, DocumentLine, JournalEntry } from "../types";
import { extractionToolInputSchema, journalToolInputSchema } from "./anthropic-json-schema";
import {
  aiExtractionResultSchema,
  aiJournalSuggestionSchema,
  type AiExtractionResult,
  type AiJournalSuggestion,
} from "./schemas";

const ANTHROPIC_MESSAGES_URL = "https://api.anthropic.com/v1/messages";
const ANTHROPIC_VERSION = "2023-06-01";
const DEFAULT_MAX_TOKENS = 800;
const DEFAULT_TIMEOUT_MS = 20_000;

type AiProviderMode = "mock" | "anthropic";

export type ExtractionInput = {
  document: AccountingDocument;
  documentFile?: DocumentFile | null;
};

export type JournalInput = {
  document: AccountingDocument;
};

export type AiProvider = {
  mode: AiProviderMode;
  extractDocument(input: ExtractionInput): Promise<AiExtractionResult>;
  generateJournal(input: JournalInput): Promise<AiJournalSuggestion>;
};

type AnthropicConfig = {
  apiKey: string;
  model: string;
  maxTokens: number;
  timeoutMs: number;
};

type AnthropicMessageResponse = {
  content: unknown[];
};

type AnthropicUserContentBlock =
  | {
      source: {
        data: string;
        media_type: "application/pdf";
        type: "base64";
      };
      type: "document";
    }
  | {
      source: {
        data: string;
        media_type: "image/jpeg" | "image/png";
        type: "base64";
      };
      type: "image";
    }
  | {
      text: string;
      type: "text";
    };

type ToolUseContentBlock = {
  type: "tool_use";
  name: string;
  input: unknown;
};

export class AiProviderError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AiProviderError";
  }
}

export function getAiProvider(): AiProvider {
  const config = getAnthropicConfig();

  if (process.env.AI_PROVIDER_MODE === "anthropic") {
    if (!config) {
      throw new AiProviderError("provider_not_configured");
    }

    return new AnthropicAiProvider(config);
  }

  return new MockAiProvider();
}

export function parseAnthropicToolInput(response: unknown, toolName: string): unknown {
  if (!isAnthropicMessageResponse(response)) {
    throw new AiProviderError("provider_response_invalid");
  }

  const toolBlock = response.content.find((block) => isToolUseContentBlock(block) && block.name === toolName);

  if (!toolBlock || !isToolUseContentBlock(toolBlock)) {
    throw new AiProviderError("provider_tool_output_missing");
  }

  return toolBlock.input;
}

class MockAiProvider implements AiProvider {
  mode = "mock" as const;

  async extractDocument(input: ExtractionInput) {
    const source = findMockSource(input.document);
    const result: AiExtractionResult = {
      vendorName: source.vendorName,
      invoiceNumber: source.invoiceNumber,
      registrationNumber: source.registrationNumber,
      issueDate: source.issueDate,
      dueDate: source.dueDate,
      subtotal: source.subtotal,
      taxAmount: source.taxAmount,
      totalAmount: source.totalAmount,
      taxRate: source.taxRate,
      confidenceScore: source.confidenceScore,
      memo: source.memo,
    };

    return aiExtractionResultSchema.parse(result);
  }

  async generateJournal(input: JournalInput) {
    const source = findMockSource(input.document);
    const result: AiJournalSuggestion = {
      debitAccount: source.journalEntry.debitAccount,
      debitAmount: source.totalAmount,
      debitTaxCategory: source.journalEntry.debitTaxCategory,
      creditAccount: source.journalEntry.creditAccount,
      creditAmount: source.totalAmount,
      creditTaxCategory: source.journalEntry.creditTaxCategory,
      department: source.journalEntry.department,
      description: source.journalEntry.description,
      aiReason: source.journalEntry.aiReason,
      confidenceScore: source.journalEntry.confidenceScore,
    };

    return aiJournalSuggestionSchema.parse(result);
  }
}

class AnthropicAiProvider implements AiProvider {
  mode = "anthropic" as const;

  constructor(private readonly config: AnthropicConfig) {}

  async extractDocument(input: ExtractionInput) {
    const payload = await this.callTool(
      "return_extraction",
      "証憑から抽出した項目だけを返します。読み取れない項目は空文字または0にせず、与えられた文脈で確認できる範囲に限定してください。",
      extractionToolInputSchema,
      buildAnthropicUserContent(buildExtractionPrompt(input.document), input.documentFile),
    );
    const parsed = aiExtractionResultSchema.safeParse(payload);

    if (!parsed.success) {
      throw new AiProviderError("provider_extraction_invalid");
    }

    return parsed.data;
  }

  async generateJournal(input: JournalInput) {
    const payload = await this.callTool(
      "return_journal_entry",
      "証憑情報から仕訳候補を1件返します。税務判断を断定せず、人間のレビュー前提の候補として作成してください。",
      journalToolInputSchema,
      [{ type: "text", text: buildJournalPrompt(input.document) }],
    );
    const parsed = aiJournalSuggestionSchema.safeParse(payload);

    if (!parsed.success) {
      throw new AiProviderError("provider_journal_invalid");
    }

    return parsed.data;
  }

  private async callTool(
    toolName: string,
    toolDescription: string,
    inputSchema: object,
    userContent: AnthropicUserContentBlock[],
  ): Promise<unknown> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.config.timeoutMs);

    let response: Response;

    try {
      response = await fetch(ANTHROPIC_MESSAGES_URL, {
        method: "POST",
        headers: {
          "anthropic-version": ANTHROPIC_VERSION,
          "content-type": "application/json",
          "x-api-key": this.config.apiKey,
        },
        signal: controller.signal,
        body: JSON.stringify({
          model: this.config.model,
          max_tokens: this.config.maxTokens,
          tools: [
            {
              name: toolName,
              description: toolDescription,
              input_schema: inputSchema,
              strict: true,
            },
          ],
          tool_choice: { type: "tool", name: toolName },
          messages: [
            {
              role: "user",
              content: userContent,
            },
          ],
        }),
      });
    } catch (error) {
      throw new AiProviderError(isAbortError(error) ? "provider_timeout" : "provider_request_failed");
    } finally {
      clearTimeout(timeout);
    }

    if (!response.ok) {
      throw new AiProviderError(mapProviderStatusError(response.status));
    }

    const json: unknown = await response.json();
    return parseAnthropicToolInput(json, toolName);
  }
}

function getAnthropicConfig(): AnthropicConfig | null {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  const model = process.env.ANTHROPIC_MODEL;

  if (!apiKey || !model) {
    return null;
  }

  return {
    apiKey,
    model,
    maxTokens: parseMaxTokens(process.env.ANTHROPIC_MAX_TOKENS),
    timeoutMs: parsePositiveInteger(process.env.ANTHROPIC_TIMEOUT_MS, DEFAULT_TIMEOUT_MS),
  };
}

function parseMaxTokens(value: string | undefined) {
  if (!value) {
    return DEFAULT_MAX_TOKENS;
  }

  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : DEFAULT_MAX_TOKENS;
}

function parsePositiveInteger(value: string | undefined, fallback: number) {
  if (!value) {
    return fallback;
  }

  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

function mapProviderStatusError(status: number) {
  if (status === 400) {
    return "provider_bad_request";
  }

  if (status === 401 || status === 403) {
    return "provider_auth_failed";
  }

  if (status === 404) {
    return "provider_model_not_found";
  }

  if (status === 429) {
    return "provider_rate_limited";
  }

  if (status >= 500) {
    return "provider_unavailable";
  }

  return "provider_request_failed";
}

function isAbortError(error: unknown) {
  return typeof error === "object" && error !== null && "name" in error && error.name === "AbortError";
}

function findMockSource(document: AccountingDocument) {
  if (document.status === "Uploaded" && document.vendorName === UNEXTRACTED_PLACEHOLDER) {
    return mockDocuments[0];
  }

  return mockDocuments.find((source) => source.id === document.id) ?? document;
}

function buildExtractionPrompt(document: AccountingDocument) {
  return [
    "添付の証憑画像から、会計レビュー用の抽出候補を作成してください。",
    "取引先名、請求書番号、登録番号、発行日、支払期日、小計、消費税額、合計金額、税率を画像から読み取ってください。",
    "画像から読み取れない項目のみ、以下の既存メタデータを参考にしてください。nullフィールドは未確定として扱ってください。",
    "信頼度スコアは画像の鮮明さと判読可能性に基づいて評価してください。",
    serializeDocumentForPrompt(document),
  ].join("\n\n");
}

function buildJournalPrompt(document: AccountingDocument) {
  return [
    "次の証憑情報から、人間が確認するための仕訳候補を1件作ってください。",
    "この出力は確定仕訳ではなく、レビュー対象の候補です。",
    "部門が判断できない場合は、departmentに「未設定」を返してください。",
    serializeDocumentForPrompt(document),
  ].join("\n\n");
}

function buildAnthropicUserContent(prompt: string, documentFile: DocumentFile | null | undefined) {
  const fileBlock = documentFile ? createFileContentBlock(documentFile) : null;
  const textBlock: AnthropicUserContentBlock = {
    type: "text",
    text: prompt,
  };

  return fileBlock ? [fileBlock, textBlock] : [textBlock];
}

function createFileContentBlock(documentFile: DocumentFile): AnthropicUserContentBlock {
  const data = arrayBufferToBase64(documentFile.bytes);

  if (documentFile.mediaType === "application/pdf") {
    return {
      type: "document",
      source: {
        type: "base64",
        media_type: "application/pdf",
        data,
      },
    };
  }

  if (documentFile.mediaType === "image/jpeg" || documentFile.mediaType === "image/png") {
    return {
      type: "image",
      source: {
        type: "base64",
        media_type: documentFile.mediaType,
        data,
      },
    };
  }

  throw new AiProviderError("provider_unsupported_media_type");
}

function arrayBufferToBase64(bytes: ArrayBuffer) {
  const view = new Uint8Array(bytes);
  const chunkSize = 32_768;
  let binary = "";

  for (let offset = 0; offset < view.length; offset += chunkSize) {
    binary += String.fromCharCode(...view.subarray(offset, offset + chunkSize));
  }

  return btoa(binary);
}

function serializeDocumentForPrompt(document: AccountingDocument) {
  const isFreshUpload = document.status === "Uploaded";
  const isPlaceholderText = (value: string) =>
    value === UNEXTRACTED_PLACEHOLDER || value === "" || value === "<UNKNOWN>";

  return JSON.stringify({
    documentType: document.documentType,
    vendorName: isFreshUpload || isPlaceholderText(document.vendorName) ? null : document.vendorName,
    invoiceNumber: isFreshUpload || isPlaceholderText(document.invoiceNumber) ? null : document.invoiceNumber,
    registrationNumber: isPlaceholderText(document.registrationNumber) ? null : document.registrationNumber,
    issueDate: document.issueDate,
    dueDate: document.dueDate,
    subtotal: isFreshUpload ? null : document.subtotal,
    taxAmount: isFreshUpload ? null : document.taxAmount,
    totalAmount: isFreshUpload ? null : document.totalAmount,
    taxRate: isFreshUpload ? null : document.taxRate,
    memo: isPlaceholderText(document.memo) ? null : document.memo,
    lines: document.lines.map(serializeLineForPrompt),
    currentJournalEntry: serializeJournalForPrompt(document.journalEntry),
  });
}

function serializeLineForPrompt(line: DocumentLine) {
  return {
    description: line.description,
    quantity: line.quantity,
    unitPrice: line.unitPrice,
    amount: line.amount,
    taxRate: line.taxRate,
  };
}

function serializeJournalForPrompt(journalEntry: JournalEntry) {
  return {
    debitAccount: journalEntry.debitAccount,
    debitTaxCategory: journalEntry.debitTaxCategory,
    creditAccount: journalEntry.creditAccount,
    creditTaxCategory: journalEntry.creditTaxCategory,
    department: journalEntry.department,
    description: journalEntry.description,
  };
}

function isAnthropicMessageResponse(value: unknown): value is AnthropicMessageResponse {
  return typeof value === "object" && value !== null && Array.isArray((value as AnthropicMessageResponse).content);
}

function isToolUseContentBlock(value: unknown): value is ToolUseContentBlock {
  if (typeof value !== "object" || value === null) {
    return false;
  }

  const block = value as Partial<ToolUseContentBlock>;
  return block.type === "tool_use" && typeof block.name === "string" && "input" in block;
}
