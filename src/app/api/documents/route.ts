import { getDocumentRepository, RepositoryError, type DocumentListFilters } from "@/lib/server/document-repository";
import { isDateOnlyString } from "@/lib/date-filter";
import type { DocumentStatus } from "@/lib/types";

const statuses: DocumentStatus[] = [
  "Uploaded",
  "Extracted",
  "NeedsReview",
  "Reviewed",
  "PendingApproval",
  "Approved",
  "Rejected",
  "Exported",
];

export async function GET(request: Request) {
  const repository = getDocumentRepository();
  const url = new URL(request.url);
  const filters = parseFilters(url.searchParams);

  if (!filters) {
    return Response.json({ error: "invalid_date_filter" }, { status: 400 });
  }

  try {
    const documents = await repository.listDocuments(filters);

    return Response.json({
      items: documents.map((document) => ({
        id: document.id,
        vendorName: document.vendorName,
        status: document.status,
        totalAmount: document.totalAmount,
        issueDate: document.issueDate,
        hasWarnings: document.warnings.some((warning) => warning.status === "open"),
      })),
      total: documents.length,
      mode: repository.mode,
    });
  } catch (error) {
    if (error instanceof RepositoryError) {
      return Response.json({ error: error.message, mode: repository.mode }, { status: 500 });
    }

    return Response.json({ error: "list_documents_failed", mode: repository.mode }, { status: 500 });
  }
}

function parseFilters(searchParams: URLSearchParams): DocumentListFilters | null {
  const status = searchParams.get("status");
  const from = searchParams.get("from");
  const to = searchParams.get("to");

  if ((from && !isDateOnlyString(from)) || (to && !isDateOnlyString(to))) {
    return null;
  }

  return {
    status: status && statuses.includes(status as DocumentStatus) ? (status as DocumentStatus) : undefined,
    vendorName: searchParams.get("vendorName") ?? undefined,
    hasWarnings: searchParams.get("hasWarnings") === "true" ? true : undefined,
    from: from ?? undefined,
    to: to ?? undefined,
  };
}
