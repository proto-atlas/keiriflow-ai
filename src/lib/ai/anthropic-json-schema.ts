// Anthropic structured outputsは一部のJSON Schema制約を送信前に単純化する前提のため、
// `minimum` / `maximum` / `minItems` はZod側の事後検証に寄せる。
// 参考: https://platform.claude.com/docs/en/build-with-claude/structured-outputs
export const extractionToolInputSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    vendorName: { type: "string" },
    invoiceNumber: { type: "string" },
    registrationNumber: { type: "string" },
    issueDate: { type: "string" },
    dueDate: { type: "string" },
    subtotal: { type: "number" },
    taxAmount: { type: "number" },
    totalAmount: { type: "number" },
    taxRate: { type: "number", enum: [0, 0.08, 0.1] },
    confidenceScore: { type: "number" },
    memo: { type: "string" },
  },
  required: [
    "vendorName",
    "invoiceNumber",
    "registrationNumber",
    "issueDate",
    "dueDate",
    "subtotal",
    "taxAmount",
    "totalAmount",
    "taxRate",
    "confidenceScore",
    "memo",
  ],
} as const;

export const journalToolInputSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    debitAccount: { type: "string" },
    debitAmount: { type: "number" },
    debitTaxCategory: { type: "string" },
    creditAccount: { type: "string" },
    creditAmount: { type: "number" },
    creditTaxCategory: { type: "string" },
    department: { type: "string" },
    description: { type: "string" },
    aiReason: { type: "string" },
    confidenceScore: { type: "number" },
  },
  required: [
    "debitAccount",
    "debitAmount",
    "debitTaxCategory",
    "creditAccount",
    "creditAmount",
    "creditTaxCategory",
    "department",
    "description",
    "aiReason",
    "confidenceScore",
  ],
} as const;
