import { cn } from "@/lib/utils";
import { CONFIDENCE_REVIEW_THRESHOLD } from "@/lib/workflow";

export function ConfidenceMeter({ value }: { value: number }) {
  const percent = Math.round(value * 100);
  const tone =
    value >= CONFIDENCE_REVIEW_THRESHOLD
      ? "bg-emerald-500"
      : value >= 0.5
        ? "bg-amber-500"
        : "bg-rose-500";

  return (
    <div className="min-w-[120px]">
      <div className="flex items-center justify-between text-xs text-slate-500">
        <span>AI信頼度</span>
        <span>{percent}%</span>
      </div>
      <div className="mt-1 h-2 rounded-full bg-slate-100">
        <div className={cn("h-2 rounded-full", tone)} style={{ width: `${percent}%` }} />
      </div>
    </div>
  );
}
