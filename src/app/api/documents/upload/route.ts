import { getDocumentRepository, RepositoryError } from "@/lib/server/document-repository";
import { enforceDemoAccess } from "@/lib/server/demo-rate-limit";
import { uploadFormSchema } from "@/lib/schemas";
import { validateUploadFile } from "@/lib/upload-validation";

export async function POST(request: Request) {
  const accessError = await enforceDemoAccess(request, "upload");

  if (accessError) {
    return accessError;
  }

  const repository = getDocumentRepository();
  let formData: FormData;

  try {
    formData = await request.formData();
  } catch {
    return Response.json({ error: "invalid_request" }, { status: 400 });
  }

  const file = formData.get("file");

  if (!(file instanceof File)) {
    return Response.json({ error: "file_required" }, { status: 400 });
  }

  const fileValidationError = validateUploadFile(file);

  if (fileValidationError) {
    return Response.json({ error: fileValidationError }, { status: 400 });
  }

  const parsed = uploadFormSchema.safeParse({
    documentType: formData.get("documentType"),
    memo: formData.get("memo") ?? "",
  });

  if (!parsed.success) {
    return Response.json({ error: "invalid_request" }, { status: 400 });
  }

  try {
    const document = await repository.createDocumentFromUpload({
      ...parsed.data,
      memo: parsed.data.memo ?? "",
      file,
    });

    return Response.json({
      documentId: document.id,
      status: document.status,
      mode: repository.mode,
    });
  } catch (error) {
    if (error instanceof RepositoryError) {
      return Response.json({ error: error.message }, { status: 500 });
    }

    return Response.json({ error: "upload_failed" }, { status: 500 });
  }
}
