import { getDocumentRepository } from "@/lib/server/document-repository";
import { enforceDemoAccess } from "@/lib/server/demo-rate-limit";
import { toDocumentsCsv } from "@/lib/workflow";

export async function GET(request: Request) {
  const accessError = await enforceDemoAccess(request, "export");

  if (accessError) {
    return accessError;
  }

  const repository = getDocumentRepository();
  const approvedDocuments = await repository.listDocuments({ status: "Approved" });
  const csv = toDocumentsCsv(approvedDocuments);

  return new Response(csv, {
    headers: {
      "Content-Disposition": 'attachment; filename="keiriflow-export.csv"',
      "Content-Type": "text/csv; charset=utf-8",
    },
  });
}
