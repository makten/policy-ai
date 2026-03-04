import { Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

interface LoadingSpinnerProps {
  className?: string;
  size?: number;
  label?: string;
}

export function LoadingSpinner({
  className,
  size = 24,
  label = "Loading...",
}: LoadingSpinnerProps) {
  return (
    <div className={cn("flex flex-col items-center justify-center gap-2 py-12", className)}>
      <Loader2 className="animate-spin text-primary" size={size} />
      <span className="text-sm text-muted-foreground">{label}</span>
    </div>
  );
}
