import { AiProviderError, getAiProvider } from "@/lib/ai/provider";
import { getDocumentRepository, RepositoryError } from "@/lib/server/document-repository";
import { enforceDemoAccess } from "@/lib/server/demo-rate-limit";

type GenerateJournalRouteContext = {
  params: Promise<{
    id: string;
  }>;
};

export async function POST(request: Request, context: GenerateJournalRouteContext) {
  const accessError = await enforceDemoAccess(request, "ai_journal");

  if (accessError) {
    return accessError;
  }

  const { id } = await context.params;
  const repository = getDocumentRepository();
  const document = await repository.getDocument(id);

  if (!document) {
    return Response.json({ error: "document_not_found" }, { status: 404 });
  }

  if (!isJournalGenerationAllowed(document.status)) {
    return Response.json({ error: "document_locked" }, { status: 409 });
  }

  try {
    const provider = getAiProvider();
    const journalEntry = await provider.generateJournal({ document });

    return Response.json({
      journalEntry,
      mode: provider.mode,
      repositoryMode: repository.mode,
    });
  } catch (error) {
    if (error instanceof AiProviderError) {
      return Response.json(
        { error: error.message },
        { status: error.message === "provider_not_configured" ? 503 : 502 },
      );
    }

    if (error instanceof RepositoryError) {
      return Response.json({ error: error.message }, { status: 500 });
    }

    return Response.json({ error: "journal_generation_failed" }, { status: 500 });
  }
}

function isJournalGenerationAllowed(status: string) {
  return status !== "PendingApproval" && status !== "Approved" && status !== "Rejected" && status !== "Exported";
}
