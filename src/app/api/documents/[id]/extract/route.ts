import { AiProviderError, getAiProvider } from "@/lib/ai/provider";
import {
  getDocumentRepository,
  RepositoryConflictError,
  RepositoryError,
  RepositoryNotFoundError,
} from "@/lib/server/document-repository";
import { enforceDemoAccess } from "@/lib/server/demo-rate-limit";

type ExtractRouteContext = {
  params: Promise<{
    id: string;
  }>;
};

export async function POST(request: Request, context: ExtractRouteContext) {
  const accessError = await enforceDemoAccess(request, "ai_extract");

  if (accessError) {
    return accessError;
  }

  const { id } = await context.params;
  const repository = getDocumentRepository();
  const document = await repository.getDocument(id);

  if (!document) {
    return Response.json({ error: "document_not_found" }, { status: 404 });
  }

  if (!isExtractionAllowed(document.status)) {
    return Response.json({ error: "invalid_status_transition" }, { status: 409 });
  }

  try {
    const provider = getAiProvider();
    const documentFile = await repository.getDocumentFile(id);
    const extraction = await provider.extractDocument({ document, documentFile });
    const updatedDocument = await repository.updateDocument(id, {
      vendorName: extraction.vendorName,
      invoiceNumber: extraction.invoiceNumber,
      registrationNumber: extraction.registrationNumber,
      issueDate: extraction.issueDate,
      dueDate: extraction.dueDate,
      subtotal: extraction.subtotal,
      taxAmount: extraction.taxAmount,
      totalAmount: extraction.totalAmount,
      taxRate: extraction.taxRate,
      confidenceScore: extraction.confidenceScore,
      memo: extraction.memo,
      status: "Extracted",
    });

    return Response.json({
      document: updatedDocument,
      extraction,
      mode: provider.mode,
      repositoryMode: repository.mode,
    });
  } catch (error) {
    if (error instanceof RepositoryNotFoundError) {
      return Response.json({ error: "document_not_found" }, { status: 404 });
    }

    if (error instanceof RepositoryConflictError) {
      return Response.json({ error: error.message }, { status: 409 });
    }

    if (error instanceof AiProviderError) {
      return Response.json(
        { error: error.message },
        { status: error.message === "provider_not_configured" ? 503 : 502 },
      );
    }

    if (error instanceof RepositoryError) {
      return Response.json({ error: error.message }, { status: 500 });
    }

    return Response.json({ error: "extraction_failed" }, { status: 500 });
  }
}

function isExtractionAllowed(status: string) {
  return status === "Uploaded" || status === "Extracted";
}
