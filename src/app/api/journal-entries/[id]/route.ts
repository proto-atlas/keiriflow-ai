import {
  getDocumentRepository,
  RepositoryConflictError,
  RepositoryError,
  RepositoryNotFoundError,
} from "@/lib/server/document-repository";
import { enforceDemoAccess } from "@/lib/server/demo-rate-limit";
import { journalPatchSchema } from "@/lib/schemas";

type JournalEntryRouteContext = {
  params: Promise<{
    id: string;
  }>;
};

export async function PATCH(request: Request, context: JournalEntryRouteContext) {
  const accessError = await enforceDemoAccess(request, "mutation");

  if (accessError) {
    return accessError;
  }

  const { id } = await context.params;
  const repository = getDocumentRepository();
  const body = await request.json();
  const parsed = journalPatchSchema.safeParse(body);

  if (!parsed.success) {
    return Response.json({ error: "invalid_request" }, { status: 400 });
  }

  try {
    const document = await repository.updateJournalEntry(id, parsed.data);

    return Response.json({ document, mode: repository.mode });
  } catch (error) {
    if (error instanceof RepositoryNotFoundError) {
      return Response.json({ error: error.message }, { status: 404 });
    }

    if (error instanceof RepositoryConflictError) {
      return Response.json({ error: error.message }, { status: 409 });
    }

    if (error instanceof RepositoryError) {
      return Response.json({ error: error.message }, { status: 500 });
    }

    return Response.json({ error: "journal_entry_update_failed" }, { status: 500 });
  }
}
