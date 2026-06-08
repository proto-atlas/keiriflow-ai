import type { DocumentStatus } from "@/lib/types";
import { statusLabels } from "@/lib/workflow";
import { cn } from "@/lib/utils";

const statusClassNames: Record<DocumentStatus, string> = {
  Uploaded: "bg-slate-100 text-slate-700",
  Extracted: "bg-sky-100 text-sky-800",
  NeedsReview: "bg-amber-100 text-amber-900",
  Reviewed: "bg-indigo-100 text-indigo-800",
  PendingApproval: "bg-violet-100 text-violet-800",
  Approved: "bg-emerald-100 text-emerald-800",
  Rejected: "bg-rose-100 text-rose-800",
  Exported: "bg-zinc-200 text-zinc-800",
};

export function StatusBadge({ status }: { status: DocumentStatus }) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-md px-2 py-1 text-xs font-medium",
        statusClassNames[status],
      )}
    >
      {statusLabels[status]}
    </span>
  );
}
