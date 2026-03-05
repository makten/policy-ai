import { cn } from "@/lib/utils";
import type { CheckStatus, Verdict } from "@/types";

interface StatusDotProps {
  status: Verdict | CheckStatus;
  className?: string;
  withLabel?: boolean;
}

const statusConfig: Record<
  string,
  { color: string; label: string }
> = {
  APPROVED: { color: "bg-success", label: "Approved" },
  REJECTED: { color: "bg-destructive", label: "Rejected" },
  MANUAL_REVIEW: { color: "bg-warning", label: "Manual Review" },
  PASS: { color: "bg-success", label: "Pass" },
  FAIL: { color: "bg-destructive", label: "Fail" },
  WARNING: { color: "bg-warning", label: "Warning" },
  NOT_EVALUATED: { color: "bg-muted-foreground", label: "Not Evaluated" },
};

export function StatusDot({ status, className, withLabel = false }: StatusDotProps) {
  const config = statusConfig[status] ?? { color: "bg-muted-foreground", label: status };

  return (
    <span className={cn("inline-flex items-center gap-1.5", className)}>
      <span
        className={cn("h-2 w-2 rounded-full", config.color)}
        aria-hidden="true"
      />
      {withLabel && (
        <span className="text-sm font-medium">{config.label}</span>
      )}
    </span>
  );
}
