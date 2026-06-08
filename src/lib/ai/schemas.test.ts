import { describe, expect, it } from "vitest";
import { aiExtractionResultSchema } from "./schemas";

describe("aiExtractionResultSchema", () => {
  const validInput = {
    vendorName: "サンプル株式会社",
    invoiceNumber: "INV-001",
    registrationNumber: "T1234567890123",
    issueDate: "2026-05-09",
    dueDate: "2026-05-31",
    subtotal: 1000,
    taxAmount: 100,
    totalAmount: 1100,
    taxRate: 0.1,
    confidenceScore: 0.85,
    memo: "",
  };

  it("実値であれば通る", () => {
    const result = aiExtractionResultSchema.safeParse(validInput);
    expect(result.success).toBe(true);
  });

  it("vendorNameがplaceholderの「未抽出」なら拒否する", () => {
    const result = aiExtractionResultSchema.safeParse({
      ...validInput,
      vendorName: "未抽出",
    });
    expect(result.success).toBe(false);
  });

  it("invoiceNumberがplaceholderの「<UNKNOWN>」なら拒否する", () => {
    const result = aiExtractionResultSchema.safeParse({
      ...validInput,
      invoiceNumber: "<UNKNOWN>",
    });
    expect(result.success).toBe(false);
  });
});
