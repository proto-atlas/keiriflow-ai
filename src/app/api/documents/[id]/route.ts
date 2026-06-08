import {
  getDocumentRepository,
  RepositoryConflictError,
  RepositoryError,
  RepositoryNotFoundError,
} from "@/lib/server/document-repository";
import { enforceDemoAccess } from "@/lib/server/demo-rate-limit";
import { documentPatchSchema } from "@/lib/schemas";
import { isPatchStatusTransitionAllowed } from "@/lib/workflow";

type DocumentRouteContext = {
  params: Promise<{
    id: string;
  }>;
};

export async function GET(_request: Request, context: DocumentRouteContext) {
  const { id } = await context.params;
  const repository = getDocumentRepository();
  const document = await repository.getDocument(id);

  if (!document) {
    return Response.json({ error: "document_not_found" }, { status: 404 });
  }

  return Response.json({ document, mode: repository.mode });
}

export async function PATCH(request: Request, context: DocumentRouteContext) {
  const accessError = await enforceDemoAccess(request, "mutation");

  if (accessError) {
    return accessError;
  }

  const { id } = await context.params;
  const repository = getDocumentRepository();
  const body = await request.json();
  const parsed = documentPatchSchema.safeParse(body);

  if (!parsed.success) {
    return Response.json({ error: "invalid_request" }, { status: 400 });
  }

  try {
    if (parsed.data.status) {
      const current = await repository.getDocument(id);

      if (!current) {
        return Response.json({ error: "document_not_found" }, { status: 404 });
      }

      if (!isPatchStatusTransitionAllowed(current.status, parsed.data.status)) {
        return Response.json({ error: "invalid_status_transition" }, { status: 409 });
      }
    }

    const document = await repository.updateDocument(id, parsed.data);

    return Response.json({ document, mode: repository.mode });
  } catch (error) {
    if (error instanceof RepositoryNotFoundError) {
      return Response.json({ error: "document_not_found" }, { status: 404 });
    }

    if (error instanceof RepositoryConflictError) {
      return Response.json({ error: error.message }, { status: 409 });
    }

    if (error instanceof RepositoryError) {
      return Response.json({ error: error.message }, { status: 500 });
    }

    return Response.json({ error: "update_failed" }, { status: 500 });
  }
}
