import { getDocumentRepository, RepositoryError, RepositoryNotFoundError } from "@/lib/server/document-repository";
import { enforceDemoAccess } from "@/lib/server/demo-rate-limit";
import { warningPatchSchema } from "@/lib/schemas";

type WarningRouteContext = {
  params: Promise<{
    id: string;
    warningId: string;
  }>;
};

export async function PATCH(request: Request, context: WarningRouteContext) {
  const accessError = await enforceDemoAccess(request, "mutation");

  if (accessError) {
    return accessError;
  }

  const { id, warningId } = await context.params;
  const repository = getDocumentRepository();
  const body = await request.json();
  const parsed = warningPatchSchema.safeParse(body);

  if (!parsed.success) {
    return Response.json({ error: "invalid_request" }, { status: 400 });
  }

  try {
    const document = await repository.updateWarning(id, warningId, parsed.data);

    return Response.json({ document, mode: repository.mode });
  } catch (error) {
    if (error instanceof RepositoryNotFoundError) {
      return Response.json({ error: error.message }, { status: 404 });
    }

    if (error instanceof RepositoryError) {
      return Response.json({ error: error.message }, { status: 500 });
    }

    return Response.json({ error: "warning_update_failed" }, { status: 500 });
  }
}
