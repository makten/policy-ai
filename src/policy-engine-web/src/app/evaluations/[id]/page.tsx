"use client";

import { useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { fetchEvaluation } from "@/lib/queries";
import { PageHeader } from "@/components/ui/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { LoadingSpinner } from "@/components/ui/loading-spinner";
import {
  ArrowLeft,
  ArrowRight,
  CheckCircle,
  XCircle,
  AlertTriangle,
  Clock,
  Cpu,
  Activity,
  Shield,
  ShieldCheck,
  Eye,
  TrendingUp,
  TrendingDown,
  FileText,
  Database,
  Zap,
  Coins,
} from "lucide-react";
import type { Verdict, EvaluationCheckDto, RetrievedPolicyVectorDto, TokenUsageDto, AnonymizedFieldDto } from "@/types";

const verdictConfig: Record<
  Verdict,
  {
    gradient: string;
    glow: string;
    icon: typeof Shield;
    label: string;
    pulse: string;
    ring: string;
    accentColor: string;
  }
> = {
  APPROVED: {
    gradient: "from-emerald-500/20 via-green-500/10 to-teal-500/20",
    glow: "shadow-[0_0_60px_-12px_rgba(34,197,94,0.4)]",
    icon: Shield,
    label: "APPROVED",
    pulse: "animate-pulse bg-emerald-400",
    ring: "ring-emerald-500/30",
    accentColor: "#22c55e",
  },
  REJECTED: {
    gradient: "from-red-500/20 via-rose-500/10 to-pink-500/20",
    glow: "shadow-[0_0_60px_-12px_rgba(239,68,68,0.4)]",
    icon: XCircle,
    label: "REJECTED",
    pulse: "animate-pulse bg-red-400",
    ring: "ring-red-500/30",
    accentColor: "#ef4444",
  },
  MANUAL_REVIEW: {
    gradient: "from-amber-500/20 via-yellow-500/10 to-orange-500/20",
    glow: "shadow-[0_0_60px_-12px_rgba(245,158,11,0.4)]",
    icon: Eye,
    label: "MANUAL REVIEW",
    pulse: "animate-pulse bg-amber-400",
    ring: "ring-amber-500/30",
    accentColor: "#f59e0b",
  },
};

export default function EvaluationDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();

  const { data: evaluation, isLoading } = useQuery({
    queryKey: ["evaluation", params.id],
    queryFn: () => fetchEvaluation(params.id),
  });

  if (isLoading) return <LoadingSpinner label="Loading evaluation..." />;
  if (!evaluation)
    return <p className="text-muted-foreground text-sm">Evaluation not found.</p>;

  const vc = verdictConfig[evaluation.verdict];
  const VerdictIcon = vc.icon;
  const totalChecks =
    evaluation.passedChecks.length +
    evaluation.failedChecks.length +
    evaluation.warnings.length;
  const passRate =
    totalChecks > 0
      ? Math.round((evaluation.passedChecks.length / totalChecks) * 100)
      : 0;

  return (
    <div className="space-y-6 max-w-4xl">
      <Button variant="ghost" size="sm" onClick={() => router.push("/evaluations")}>
        <ArrowLeft className="h-4 w-4" /> Back to Results
      </Button>

      {/* ─── Verdict Hero Banner ─── */}
      <div
        className={`relative overflow-hidden rounded-2xl border bg-gradient-to-br ${vc.gradient} ${vc.glow} ring-1 ${vc.ring} p-6`}
      >
        {/* Grid overlay */}
        <div
          className="absolute inset-0 opacity-[0.03]"
          style={{
            backgroundImage:
              "linear-gradient(rgba(255,255,255,.1) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,.1) 1px, transparent 1px)",
            backgroundSize: "20px 20px",
          }}
        />
        <div className="relative flex items-center gap-5">
          <div className="relative shrink-0">
            <div className={`absolute -inset-2 rounded-full ${vc.pulse} opacity-20`} />
            <div className="relative flex h-16 w-16 items-center justify-center rounded-full bg-card/80 backdrop-blur-sm border border-white/10">
              <VerdictIcon className="h-8 w-8" style={{ color: vc.accentColor }} />
            </div>
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-3 flex-wrap">
              <h2 className="text-2xl font-black tracking-tight">{vc.label}</h2>
              <span className="text-xs font-mono px-2 py-0.5 rounded-full bg-card/60 backdrop-blur-sm border border-white/10 text-muted-foreground">
                {passRate}% compliance
              </span>
            </div>
            <p className="mt-1 text-sm text-foreground/70 line-clamp-2">
              {evaluation.summary}
            </p>
          </div>
        </div>
      </div>

      {/* ─── Meta Info Row ─── */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <MetaChip icon={<Clock className="h-3.5 w-3.5" />} label="Evaluated" value={new Date(evaluation.evaluatedAt).toLocaleString()} />
        <MetaChip icon={<Cpu className="h-3.5 w-3.5" />} label="Model" value={evaluation.modelUsed} />
        <MetaChip icon={<Activity className="h-3.5 w-3.5" />} label="Duration" value={`${(evaluation.durationMs / 1000).toFixed(1)}s`} />
        <MetaChip icon={<FileText className="h-3.5 w-3.5" />} label="File" value={evaluation.originalFileName} />
      </div>

      {/* ─── RAG Retrieval Info ─── */}
      {evaluation.retrievedPolicyCount != null && evaluation.totalPolicyCount != null && (
        <div className="rounded-xl border border-border bg-card/60 backdrop-blur-sm p-4">
          <div className="flex items-center gap-2 mb-3">
            <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-violet-500/10 ring-1 ring-violet-500/20">
              <Zap className="h-3.5 w-3.5 text-violet-400" />
            </div>
            <span className="text-xs font-semibold tracking-wide uppercase text-muted-foreground">RAG Retrieval</span>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div className="text-center">
              <div className="text-lg font-bold text-violet-400">{evaluation.retrievedPolicyCount}</div>
              <div className="text-[10px] text-muted-foreground">Policies Retrieved</div>
            </div>
            <div className="text-center">
              <div className="text-lg font-bold text-foreground/70">{evaluation.totalPolicyCount}</div>
              <div className="text-[10px] text-muted-foreground">Total Active</div>
            </div>
            <div className="text-center">
              <div className="text-lg font-bold text-emerald-400">
                {Math.round((1 - evaluation.retrievedPolicyCount / evaluation.totalPolicyCount) * 100)}%
              </div>
              <div className="text-[10px] text-muted-foreground">Tokens Saved</div>
            </div>
          </div>
          <div className="mt-3 h-2 rounded-full bg-secondary overflow-hidden">
            <div
              className="h-full bg-gradient-to-r from-violet-500 to-purple-400 transition-all duration-1000 rounded-full"
              style={{ width: `${(evaluation.retrievedPolicyCount / evaluation.totalPolicyCount) * 100}%` }}
            />
          </div>
          <div className="flex justify-between mt-1 text-[10px] text-muted-foreground">
            <span>Retrieved</span>
            <span>Filtered out</span>
          </div>
        </div>
      )}

      {evaluation.retrievedPolicies?.length > 0 && (
        <RetrievedVectorsPanel policies={evaluation.retrievedPolicies} />
      )}

      {/* ─── Token Usage Panel ─── */}
      {evaluation.tokenUsage?.length > 0 && (
        <TokenUsagePanel tokenUsage={evaluation.tokenUsage} />
      )}

      {/* ─── Data Privacy Shield ─── */}
      {evaluation.anonymizationReport?.length > 0 && (
        <AnonymizationPanel report={evaluation.anonymizationReport} />
      )}

      {/* ─── Metric Cards ─── */}
      <div className="grid grid-cols-3 gap-3">
        <MetricCard value={evaluation.passedChecks.length} label="Passed" icon={<TrendingUp className="h-4 w-4" />} color="emerald" />
        <MetricCard value={evaluation.failedChecks.length} label="Failed" icon={<TrendingDown className="h-4 w-4" />} color="red" />
        <MetricCard value={evaluation.warnings.length} label="Warnings" icon={<AlertTriangle className="h-4 w-4" />} color="amber" />
      </div>

      {/* ─── Compliance Bar ─── */}
      <div className="rounded-xl border border-border bg-card p-4">
        <div className="flex items-center justify-between text-xs mb-2">
          <span className="font-medium text-foreground">Compliance Score</span>
          <span className="font-mono text-muted-foreground">{passRate}%</span>
        </div>
        <div className="h-3 rounded-full bg-secondary overflow-hidden flex">
          {evaluation.passedChecks.length > 0 && (
            <div
              className="h-full bg-gradient-to-r from-emerald-500 to-green-400 transition-all duration-1000"
              style={{ width: `${(evaluation.passedChecks.length / totalChecks) * 100}%` }}
            />
          )}
          {evaluation.warnings.length > 0 && (
            <div
              className="h-full bg-gradient-to-r from-amber-500 to-yellow-400 transition-all duration-1000"
              style={{ width: `${(evaluation.warnings.length / totalChecks) * 100}%` }}
            />
          )}
          {evaluation.failedChecks.length > 0 && (
            <div
              className="h-full bg-gradient-to-r from-red-500 to-rose-400 transition-all duration-1000"
              style={{ width: `${(evaluation.failedChecks.length / totalChecks) * 100}%` }}
            />
          )}
        </div>
        <div className="flex justify-between mt-1.5 text-[10px] text-muted-foreground">
          <span className="flex items-center gap-1">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" /> Passed
          </span>
          <span className="flex items-center gap-1">
            <span className="h-1.5 w-1.5 rounded-full bg-amber-500" /> Warnings
          </span>
          <span className="flex items-center gap-1">
            <span className="h-1.5 w-1.5 rounded-full bg-red-500" /> Failed
          </span>
        </div>
      </div>

      {/* ─── Check Sections ─── */}
      {evaluation.failedChecks.length > 0 && (
        <CheckGrid
          title="Failed Checks"
          icon={<XCircle className="h-4 w-4 text-red-400" />}
          checks={evaluation.failedChecks}
          color="red"
        />
      )}
      {evaluation.warnings.length > 0 && (
        <CheckGrid
          title="Warnings"
          icon={<AlertTriangle className="h-4 w-4 text-amber-400" />}
          checks={evaluation.warnings}
          color="amber"
        />
      )}
      {evaluation.passedChecks.length > 0 && (
        <CheckGrid
          title="Passed Checks"
          icon={<CheckCircle className="h-4 w-4 text-emerald-400" />}
          checks={evaluation.passedChecks}
          color="emerald"
          collapsed
        />
      )}
    </div>
  );
}

function RetrievedVectorsPanel({ policies }: { policies: RetrievedPolicyVectorDto[] }) {
  const [open, setOpen] = useState(false);

  return (
    <div className="rounded-xl border border-border bg-card/60 backdrop-blur-sm overflow-hidden">
      <button
        onClick={() => setOpen(!open)}
        className="flex w-full items-center justify-between px-4 py-3 hover:bg-secondary/40 transition-colors"
      >
        <div className="flex items-center gap-2">
          <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-violet-500/10 ring-1 ring-violet-500/20">
            <Database className="h-3.5 w-3.5 text-violet-400" />
          </div>
          <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Vector Selection Used For This Evaluation
          </span>
          <Badge variant="secondary" className="text-[10px] font-mono">
            {policies.length}
          </Badge>
        </div>
        <svg
          className={`h-4 w-4 text-muted-foreground transition-transform ${open ? "rotate-180" : ""}`}
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {open && (
        <div className="border-t border-border px-4 py-3 space-y-2">
          {policies.map((policy) => (
            <div
              key={policy.vectorId}
              className="rounded-lg border border-violet-500/15 bg-violet-500/5 px-3 py-2"
            >
              <div className="flex items-center gap-2 text-xs">
                <Badge variant="outline" className="border-violet-500/30 text-violet-300">
                  {policy.policyCode}
                </Badge>
                <span className="font-medium text-foreground">{policy.policyTitle}</span>
              </div>
              <div className="mt-1 flex flex-wrap items-center gap-2 text-[11px] text-muted-foreground font-mono">
                <span>vector={policy.vectorId}</span>
                <span>cat={policy.category}</span>
                <span>section={policy.section || "-"}</span>
                <span>page={policy.sourcePage}</span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/* ─── Token Usage Panel ─── */
function TokenUsagePanel({ tokenUsage }: { tokenUsage: TokenUsageDto[] }) {
  const totalTokens = tokenUsage.reduce((sum, u) => sum + u.totalTokens, 0);
  const totalPrompt = tokenUsage.reduce((sum, u) => sum + u.promptTokens, 0);
  const totalCompletion = tokenUsage.reduce((sum, u) => sum + u.completionTokens, 0);

  return (
    <div className="rounded-xl border border-border bg-card/60 backdrop-blur-sm p-4">
      <div className="flex items-center gap-2 mb-3">
        <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-sky-500/10 ring-1 ring-sky-500/20">
          <Coins className="h-3.5 w-3.5 text-sky-400" />
        </div>
        <span className="text-xs font-semibold tracking-wide uppercase text-muted-foreground">
          OpenAI Token Usage
        </span>
        <Badge variant="secondary" className="text-[10px] font-mono ml-auto">
          {totalTokens.toLocaleString()} total tokens
        </Badge>
      </div>

      {/* Per-call breakdown */}
      <div className="space-y-2">
        {tokenUsage.map((usage, idx) => (
          <div
            key={idx}
            className="rounded-lg border border-sky-500/15 bg-sky-500/5 px-3 py-2.5"
          >
            <div className="flex items-center justify-between mb-1.5">
              <div className="flex items-center gap-2">
                <Badge
                  variant="outline"
                  className={
                    usage.callType === "Evaluation"
                      ? "border-amber-500/30 text-amber-300"
                      : "border-violet-500/30 text-violet-300"
                  }
                >
                  {usage.callType}
                </Badge>
                <span className="text-[11px] font-mono text-muted-foreground">
                  {usage.model}
                </span>
              </div>
              <span className="text-xs font-bold tabular-nums text-sky-400">
                {usage.totalTokens.toLocaleString()}
              </span>
            </div>
            <div className="grid grid-cols-3 gap-2 text-[11px]">
              <div className="rounded-md bg-secondary/60 px-2 py-1 text-center">
                <span className="text-muted-foreground">Prompt </span>
                <span className="font-mono font-medium">{usage.promptTokens.toLocaleString()}</span>
              </div>
              <div className="rounded-md bg-secondary/60 px-2 py-1 text-center">
                <span className="text-muted-foreground">Completion </span>
                <span className="font-mono font-medium">{usage.completionTokens.toLocaleString()}</span>
              </div>
              <div className="rounded-md bg-secondary/60 px-2 py-1 text-center">
                <span className="text-muted-foreground">Total </span>
                <span className="font-mono font-medium">{usage.totalTokens.toLocaleString()}</span>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Aggregate totals */}
      {tokenUsage.length > 1 && (
        <div className="mt-3 pt-3 border-t border-border">
          <div className="grid grid-cols-3 gap-2 text-[11px]">
            <div className="text-center">
              <div className="text-sm font-bold text-sky-400 tabular-nums">{totalPrompt.toLocaleString()}</div>
              <div className="text-[10px] text-muted-foreground">Total Prompt</div>
            </div>
            <div className="text-center">
              <div className="text-sm font-bold text-sky-400 tabular-nums">{totalCompletion.toLocaleString()}</div>
              <div className="text-[10px] text-muted-foreground">Total Completion</div>
            </div>
            <div className="text-center">
              <div className="text-sm font-bold text-sky-300 tabular-nums">{totalTokens.toLocaleString()}</div>
              <div className="text-[10px] text-muted-foreground">Grand Total</div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/* ─── Meta Chip ─── */
function MetaChip({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-lg border border-border bg-card/80 backdrop-blur-sm p-2.5">
      <div className="flex items-center gap-1.5 text-muted-foreground mb-0.5">
        {icon}
        <span className="text-[10px] uppercase tracking-wider font-medium">{label}</span>
      </div>
      <p className="text-xs font-semibold truncate">{value}</p>
    </div>
  );
}

/* ─── Metric Card ─── */
function MetricCard({
  value,
  label,
  icon,
  color,
}: {
  value: number;
  label: string;
  icon: React.ReactNode;
  color: "emerald" | "red" | "amber";
}) {
  const gradients = {
    emerald: "from-emerald-500/10 to-green-500/5 border-emerald-500/20",
    red: "from-red-500/10 to-rose-500/5 border-red-500/20",
    amber: "from-amber-500/10 to-yellow-500/5 border-amber-500/20",
  };
  const textColors = {
    emerald: "text-emerald-500",
    red: "text-red-500",
    amber: "text-amber-500",
  };

  return (
    <div className={`rounded-xl border bg-gradient-to-br ${gradients[color]} p-4 text-center`}>
      <div className={`flex items-center justify-center gap-1.5 ${textColors[color]} mb-1`}>
        {icon}
        <span className="text-3xl font-black tabular-nums">{value}</span>
      </div>
      <p className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider">
        {label}
      </p>
    </div>
  );
}

/* ─── Check Grid ─── */
function CheckGrid({
  title,
  icon,
  checks,
  color,
  collapsed = false,
}: {
  title: string;
  icon: React.ReactNode;
  checks: EvaluationCheckDto[];
  color: "emerald" | "red" | "amber";
  collapsed?: boolean;
}) {
  const [open, setOpen] = useState(!collapsed);
  const borderColors = {
    emerald: "border-emerald-500/15 hover:border-emerald-500/30",
    red: "border-red-500/15 hover:border-red-500/30",
    amber: "border-amber-500/15 hover:border-amber-500/30",
  };
  const dotColors = { emerald: "bg-emerald-500", red: "bg-red-500", amber: "bg-amber-500" };

  return (
    <div className="rounded-xl border border-border bg-card overflow-hidden">
      <button
        onClick={() => setOpen(!open)}
        className="flex w-full items-center justify-between px-5 py-3.5 hover:bg-secondary/40 transition-colors"
      >
        <div className="flex items-center gap-2">
          {icon}
          <span className="text-sm font-semibold">{title}</span>
          <Badge variant="secondary" className="text-[10px] font-mono">
            {checks.length}
          </Badge>
        </div>
        <svg
          className={`h-4 w-4 text-muted-foreground transition-transform ${open ? "rotate-180" : ""}`}
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>
      {open && (
        <div className="border-t border-border px-4 py-3 space-y-2">
          {checks.map((check) => (
            <div
              key={check.id}
              className={`relative rounded-lg border ${borderColors[color]} bg-card p-3 pl-5 transition-colors`}
            >
              <div
                className={`absolute left-0 top-2 bottom-2 w-0.5 rounded-full ${dotColors[color]}`}
              />
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <code className="text-xs font-bold font-mono text-foreground/80">
                      {check.policyCode}
                    </code>
                    <span className="text-sm font-medium">{check.policyTitle}</span>
                  </div>
                  <p className="mt-1 text-xs text-foreground/60 leading-relaxed">
                    {check.reason}
                  </p>
                </div>
              </div>
              {(check.submittedValue || check.requiredValue) && (
                <div className="mt-2 grid grid-cols-2 gap-2 text-[11px]">
                  {check.submittedValue && (
                    <div className="rounded-md bg-secondary/60 px-2 py-1.5">
                      <span className="text-muted-foreground">Submitted: </span>
                      <span className="font-medium">{check.submittedValue}</span>
                    </div>
                  )}
                  {check.requiredValue && (
                    <div className="rounded-md bg-secondary/60 px-2 py-1.5">
                      <span className="text-muted-foreground">Required: </span>
                      <span className="font-medium">{check.requiredValue}</span>
                    </div>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/* ─── Anonymization Transparency Panel ─── */
function AnonymizationPanel({ report }: { report: AnonymizedFieldDto[] }) {
  const [open, setOpen] = useState(false);

  const categoryConfig: Record<string, { label: string; border: string; text: string; bg: string }> = {
    PII: { label: "PII", border: "border-rose-500/30", text: "text-rose-300", bg: "bg-rose-500/5" },
    LOCATION: { label: "Location", border: "border-sky-500/30", text: "text-sky-300", bg: "bg-sky-500/5" },
    TEMPORAL: { label: "Temporal", border: "border-violet-500/30", text: "text-violet-300", bg: "bg-violet-500/5" },
  };

  const piiCount = report.filter(f => f.category === "PII").length;
  const locationCount = report.filter(f => f.category === "LOCATION").length;
  const temporalCount = report.filter(f => f.category === "TEMPORAL").length;

  return (
    <div className="rounded-xl border border-border bg-card/60 backdrop-blur-sm overflow-hidden">
      <button
        onClick={() => setOpen(!open)}
        className="flex w-full items-center justify-between px-4 py-3 hover:bg-secondary/40 transition-colors"
      >
        <div className="flex items-center gap-2">
          <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-emerald-500/10 ring-1 ring-emerald-500/20">
            <ShieldCheck className="h-3.5 w-3.5 text-emerald-400" />
          </div>
          <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Data Privacy Shield
          </span>
          <Badge variant="secondary" className="text-[10px] font-mono">
            {report.length} fields anonymized
          </Badge>
        </div>
        <svg
          className={`h-4 w-4 text-muted-foreground transition-transform ${open ? "rotate-180" : ""}`}
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {open && (
        <div className="border-t border-border px-4 py-3 space-y-3">
          {/* Summary bar */}
          <div className="flex items-center gap-3 text-[11px]">
            <span className="text-muted-foreground">
              Personal data was anonymized before AI evaluation:
            </span>
            {piiCount > 0 && (
              <span className="flex items-center gap-1 text-rose-300">
                <span className="h-1.5 w-1.5 rounded-full bg-rose-400" />
                {piiCount} PII
              </span>
            )}
            {locationCount > 0 && (
              <span className="flex items-center gap-1 text-sky-300">
                <span className="h-1.5 w-1.5 rounded-full bg-sky-400" />
                {locationCount} Location
              </span>
            )}
            {temporalCount > 0 && (
              <span className="flex items-center gap-1 text-violet-300">
                <span className="h-1.5 w-1.5 rounded-full bg-violet-400" />
                {temporalCount} Temporal
              </span>
            )}
          </div>

          <p className="text-[10px] text-muted-foreground/70 leading-relaxed">
            Financial values and policy-critical fields (gender, marital status) are retained for accurate evaluation.
            Names, addresses, BSN, and contact details were already stripped during summarization.
          </p>

          {/* Field cards */}
          <div className="space-y-2">
            {report.map((field, idx) => {
              const cat = categoryConfig[field.category] ?? categoryConfig.PII;
              return (
                <div key={idx} className={`rounded-lg border ${cat.border} ${cat.bg} px-3 py-2.5`}>
                  <div className="flex items-center gap-2 mb-1.5">
                    <Badge variant="outline" className={`${cat.border} ${cat.text} text-[10px]`}>
                      {cat.label}
                    </Badge>
                    <code className="text-[11px] font-mono text-foreground/70">{field.fieldPath}</code>
                  </div>
                  <div className="flex items-center gap-2 text-xs">
                    <span className="rounded-md bg-secondary/60 px-2 py-1 font-mono text-muted-foreground line-through decoration-rose-400/50">
                      {field.originalHint}
                    </span>
                    <ArrowRight className="h-3 w-3 text-muted-foreground shrink-0" />
                    <span className="rounded-md bg-emerald-500/10 border border-emerald-500/20 px-2 py-1 font-mono text-emerald-300">
                      {field.anonymizedValue}
                    </span>
                  </div>
                  <p className="mt-1.5 text-[10px] text-muted-foreground/70 leading-relaxed">{field.reason}</p>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
