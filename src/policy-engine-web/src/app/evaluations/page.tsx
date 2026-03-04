"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { fetchEvaluations } from "@/lib/queries";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { LoadingSpinner } from "@/components/ui/loading-spinner";
import {
  ChevronLeft,
  ChevronRight,
  Shield,
  XCircle,
  Eye,
  Activity,
  TrendingUp,
  TrendingDown,
  AlertTriangle,
} from "lucide-react";
import Link from "next/link";
import type { Verdict, EvaluationSummaryDto } from "@/types";

const verdictBadge: Record<
  Verdict,
  { icon: typeof Shield; gradient: string; glow: string; label: string; dot: string }
> = {
  APPROVED: {
    icon: Shield,
    gradient: "from-emerald-500/20 to-green-500/10",
    glow: "shadow-[0_0_20px_-6px_rgba(34,197,94,0.35)]",
    label: "Approved",
    dot: "bg-emerald-500",
  },
  REJECTED: {
    icon: XCircle,
    gradient: "from-red-500/20 to-rose-500/10",
    glow: "shadow-[0_0_20px_-6px_rgba(239,68,68,0.35)]",
    label: "Rejected",
    dot: "bg-red-500",
  },
  MANUAL_REVIEW: {
    icon: Eye,
    gradient: "from-amber-500/20 to-yellow-500/10",
    glow: "shadow-[0_0_20px_-6px_rgba(245,158,11,0.35)]",
    label: "Review",
    dot: "bg-amber-500",
  },
};

export default function EvaluationsPage() {
  const [page, setPage] = useState(1);
  const pageSize = 20;

  const { data, isLoading } = useQuery({
    queryKey: ["evaluations", page],
    queryFn: () => fetchEvaluations(page, pageSize),
  });

  // Compute aggregate stats
  const stats = data
    ? {
        total: data.total,
        approved: data.data.filter((e) => e.verdict === "APPROVED").length,
        rejected: data.data.filter((e) => e.verdict === "REJECTED").length,
        review: data.data.filter((e) => e.verdict === "MANUAL_REVIEW").length,
      }
    : null;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Evaluation Results"
        description="History of all mortgage application evaluations"
      />

      {isLoading ? (
        <LoadingSpinner />
      ) : !data || data.data.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-sm text-muted-foreground">
            No evaluations yet. Go to the Evaluate page to run your first assessment.
          </CardContent>
        </Card>
      ) : (
        <>
          {/* Stats Row */}
          {stats && (
            <div className="grid grid-cols-4 gap-3">
              <MiniStat label="Total" value={stats.total} icon={<Activity className="h-4 w-4 text-primary" />} color="primary" />
              <MiniStat label="Approved" value={stats.approved} icon={<TrendingUp className="h-4 w-4 text-emerald-500" />} color="emerald" />
              <MiniStat label="Rejected" value={stats.rejected} icon={<TrendingDown className="h-4 w-4 text-red-500" />} color="red" />
              <MiniStat label="Review" value={stats.review} icon={<AlertTriangle className="h-4 w-4 text-amber-500" />} color="amber" />
            </div>
          )}

          {/* Evaluation List */}
          <div className="space-y-2">
            {data.data.map((ev) => (
              <EvaluationRow key={ev.id} ev={ev} />
            ))}
          </div>

          {/* Pagination */}
          {data.totalPages > 1 && (
            <div className="flex items-center justify-between">
              <p className="text-sm text-muted-foreground font-mono">
                Page {data.page} of {data.totalPages} ({data.total} total)
              </p>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  disabled={page <= 1}
                  onClick={() => setPage((p) => p - 1)}
                >
                  <ChevronLeft className="h-4 w-4" /> Previous
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={page >= data.totalPages}
                  onClick={() => setPage((p) => p + 1)}
                >
                  Next <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}

/* ─── Mini Stat Card ─── */
function MiniStat({
  label,
  value,
  icon,
  color,
}: {
  label: string;
  value: number;
  icon: React.ReactNode;
  color: string;
}) {
  const gradients: Record<string, string> = {
    primary: "from-primary/10 to-blue-500/5 border-primary/20",
    emerald: "from-emerald-500/10 to-green-500/5 border-emerald-500/20",
    red: "from-red-500/10 to-rose-500/5 border-red-500/20",
    amber: "from-amber-500/10 to-yellow-500/5 border-amber-500/20",
  };

  return (
    <div className={`rounded-xl border bg-gradient-to-br ${gradients[color]} p-3 text-center`}>
      <div className="flex items-center justify-center gap-1.5 mb-0.5">
        {icon}
        <span className="text-2xl font-black tabular-nums">{value}</span>
      </div>
      <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">{label}</p>
    </div>
  );
}

/* ─── Evaluation Row Card ─── */
function EvaluationRow({ ev }: { ev: EvaluationSummaryDto }) {
  const vb = verdictBadge[ev.verdict];
  const VIcon = vb.icon;
  const totalChecks = ev.passedCount + ev.failedCount + ev.warningCount;
  const passRate = totalChecks > 0 ? Math.round((ev.passedCount / totalChecks) * 100) : 0;

  return (
    <Link href={`/evaluations/${ev.id}`} className="block group">
      <div
        className={`relative rounded-xl border border-border bg-card overflow-hidden transition-all hover:border-border/80 hover:${vb.glow}`}
      >
        {/* Left accent */}
        <div className={`absolute left-0 top-0 bottom-0 w-1 ${vb.dot}`} />

        <div className="flex items-center gap-4 p-4 pl-5">
          {/* Verdict Icon */}
          <div
            className={`relative shrink-0 flex h-10 w-10 items-center justify-center rounded-lg bg-gradient-to-br ${vb.gradient}`}
          >
            <VIcon className="h-5 w-5 opacity-80" />
          </div>

          {/* Info */}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <p className="text-sm font-semibold truncate">{ev.originalFileName}</p>
              <Badge variant="secondary" className="text-[10px] font-mono shrink-0">
                {vb.label}
              </Badge>
            </div>
            <div className="flex items-center gap-3 mt-1 text-xs text-muted-foreground font-mono">
              <span>{new Date(ev.evaluatedAt).toLocaleString()}</span>
              {ev.entity && <span className="text-foreground/50">{ev.entity}</span>}
              <span>{ev.durationMs}ms</span>
              {ev.retrievedPolicyCount != null && ev.totalPolicyCount != null && (
                <span className="text-violet-400" title="RAG: policies retrieved / total">
                  ⚡ {ev.retrievedPolicyCount}/{ev.totalPolicyCount}
                </span>
              )}
            </div>
          </div>

          {/* Mini Compliance Bar + Counts */}
          <div className="shrink-0 flex items-center gap-4">
            {/* Mini bar */}
            <div className="hidden sm:flex flex-col items-end gap-1">
              <span className="text-[10px] font-mono text-muted-foreground">{passRate}%</span>
              <div className="h-1.5 w-20 rounded-full bg-secondary overflow-hidden flex">
                {ev.passedCount > 0 && (
                  <div
                    className="h-full bg-emerald-500"
                    style={{ width: `${(ev.passedCount / totalChecks) * 100}%` }}
                  />
                )}
                {ev.warningCount > 0 && (
                  <div
                    className="h-full bg-amber-500"
                    style={{ width: `${(ev.warningCount / totalChecks) * 100}%` }}
                  />
                )}
                {ev.failedCount > 0 && (
                  <div
                    className="h-full bg-red-500"
                    style={{ width: `${(ev.failedCount / totalChecks) * 100}%` }}
                  />
                )}
              </div>
            </div>

            {/* Counts */}
            <div className="flex items-center gap-1.5 text-xs font-mono">
              <span className="flex items-center gap-0.5 text-emerald-500">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                {ev.passedCount}
              </span>
              <span className="flex items-center gap-0.5 text-red-500">
                <span className="h-1.5 w-1.5 rounded-full bg-red-500" />
                {ev.failedCount}
              </span>
              <span className="flex items-center gap-0.5 text-amber-500">
                <span className="h-1.5 w-1.5 rounded-full bg-amber-500" />
                {ev.warningCount}
              </span>
            </div>

            {/* Arrow */}
            <ChevronRight className="h-4 w-4 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
          </div>
        </div>
      </div>
    </Link>
  );
}
