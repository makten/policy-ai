"use client";

import { useState, useCallback, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useMutation, useQuery } from "@tanstack/react-query";
import { submitEvaluation, fetchPolicyDocuments } from "@/lib/queries";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { FileDropzone } from "@/components/ui/file-dropzone";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ApplicationPreview } from "@/components/ui/application-preview";
import {
  CheckCircle,
  XCircle,
  AlertTriangle,
  ArrowRight,
  Sparkles,
  Zap,
  Shield,
  ShieldCheck,
  Activity,
  Clock,
  Cpu,
  TrendingUp,
  TrendingDown,
  Eye,
  Database,
  RotateCcw,
} from "lucide-react";
import type { EvaluationResultDto, EvaluationCheckDto, Verdict, AnonymizedFieldDto } from "@/types";

const verdictConfig: Record<
  Verdict,
  {
    gradient: string;
    glow: string;
    icon: typeof CheckCircle;
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

export default function EvaluatePage() {
  const router = useRouter();
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [fileContent, setFileContent] = useState<string | null>(null);
  const [selectedDocumentId, setSelectedDocumentId] = useState<string>("");
  const [result, setResult] = useState<EvaluationResultDto | null>(null);
  const [showPreview, setShowPreview] = useState(false);

  const documentsQuery = useQuery({
    queryKey: ["policyDocuments"],
    queryFn: fetchPolicyDocuments,
  });

  const mutation = useMutation({
    mutationFn: () => {
      if (!selectedFile) throw new Error("No file selected");
      return submitEvaluation(selectedFile, selectedDocumentId || undefined);
    },
    onSuccess: (data) => setResult(data),
  });

  const handleFileSelect = useCallback((file: File) => {
    setSelectedFile(file);
    setResult(null);
    setShowPreview(false);
    setFileContent(null);
  }, []);

  // Read file content for preview when file is selected
  useEffect(() => {
    if (!selectedFile) {
      setFileContent(null);
      return;
    }
    const reader = new FileReader();
    reader.onload = (e) => {
      const text = e.target?.result as string;
      setFileContent(text);
      setShowPreview(true);
    };
    reader.readAsText(selectedFile);
  }, [selectedFile]);

  const handleReset = useCallback(() => {
    setSelectedFile(null);
    setFileContent(null);
    setResult(null);
    setShowPreview(false);
  }, []);

  const documents = documentsQuery.data ?? [];

  return (
    <div className="space-y-6 max-w-4xl">
      <PageHeader
        title="Evaluate Application"
        description="Upload a mortgage application JSON to validate against policies"
      />

      {/* Upload Card */}
      {!showPreview && !result && (
        <Card>
          <CardHeader>
            <CardTitle>Upload Application</CardTitle>
            <CardDescription>
              Select a JSON file containing the mortgage application data
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <FileDropzone
              onFileSelect={handleFileSelect}
              disabled={mutation.isPending}
            />
          </CardContent>
        </Card>
      )}

      {/* ─── Application Preview ─── */}
      {showPreview && fileContent && !result && !mutation.isPending && (
        <div className="space-y-4">
          {/* Preview header with file info */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <h2 className="text-sm font-semibold text-foreground">
                Reviewing: <span className="text-primary">{selectedFile?.name}</span>
              </h2>
              <Badge variant="outline" className="text-[10px] font-mono">
                {(selectedFile?.size ?? 0) > 1024
                  ? `${((selectedFile?.size ?? 0) / 1024).toFixed(1)} KB`
                  : `${selectedFile?.size ?? 0} B`}
              </Badge>
            </div>
            <Button variant="ghost" size="sm" onClick={handleReset}>
              <RotateCcw className="h-3.5 w-3.5 mr-1.5" />
              Upload Different File
            </Button>
          </div>

          {/* The beautiful preview */}
          <ApplicationPreview json={fileContent} />

          {/* Policy document selection + submit */}
          <Card className="border-primary/20 bg-gradient-to-br from-primary/[0.02] to-transparent">
            <CardContent className="pt-6 space-y-4">
              {documents.length > 0 && (
                <div>
                  <label className="text-sm font-medium text-foreground">
                    Evaluate against specific policy document (optional)
                  </label>
                  <select
                    value={selectedDocumentId}
                    onChange={(e) => setSelectedDocumentId(e.target.value)}
                    className="mt-1 h-10 w-full rounded-lg border border-border bg-card px-3 text-sm outline-none focus:ring-2 focus:ring-ring"
                  >
                    <option value="">All active policies</option>
                    {documents.map((doc) => (
                      <option key={doc.id} value={doc.id}>
                        {doc.entity || "Unknown"} — {doc.fileName} (v{doc.version})
                      </option>
                    ))}
                  </select>
                </div>
              )}

              <Button
                onClick={() => mutation.mutate()}
                disabled={!selectedFile || mutation.isPending}
                className="w-full h-12 text-base font-semibold"
              >
                <Zap className="h-5 w-5" /> Confirm & Run Evaluation
              </Button>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Scanning Animation */}
      {mutation.isPending && <ScanningAnimation />}

      {/* Error */}
      {mutation.isError && (
        <Card className="border-destructive/30">
          <CardContent className="py-6">
            <p className="text-sm text-destructive">
              Evaluation failed: {(mutation.error as Error).message}
            </p>
          </CardContent>
        </Card>
      )}

      {/* ─── Futuristic Results ─── */}
      {result && (
        <EvaluationResults
          result={result}
          onViewDetails={() => router.push(`/evaluations/${result.id}`)}
        />
      )}
    </div>
  );
}

/* ─── Scanning Animation ─── */
function ScanningAnimation() {
  return (
    <div className="relative overflow-hidden rounded-2xl border border-primary/20 bg-gradient-to-br from-primary/5 via-card to-primary/5 p-8">
      <div className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-transparent via-primary to-transparent animate-scan" />
      <div className="text-center space-y-4">
        <div className="relative mx-auto w-16 h-16">
          <div className="absolute inset-0 rounded-full border-2 border-primary/30 animate-ping" />
          <div className="absolute inset-2 rounded-full border-2 border-primary/50 animate-pulse" />
          <div className="absolute inset-4 rounded-full bg-primary/20 flex items-center justify-center">
            <Activity className="h-6 w-6 text-primary animate-pulse" />
          </div>
        </div>
        <div>
          <p className="text-sm font-semibold text-foreground">AI Engine Processing</p>
          <p className="text-xs text-muted-foreground mt-1">
            Validating against all active policies...
          </p>
        </div>
        <div className="flex justify-center gap-1">
          {[0, 1, 2, 3, 4].map((i) => (
            <div key={i} className="h-1.5 w-8 rounded-full bg-primary/30 overflow-hidden">
              <div
                className="h-full w-full bg-primary rounded-full animate-pulse"
                style={{ animationDelay: `${i * 200}ms` }}
              />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

/* ─── Evaluation Results Block ─── */
function EvaluationResults({
  result,
  onViewDetails,
}: {
  result: EvaluationResultDto;
  onViewDetails: () => void;
}) {
  const vc = verdictConfig[result.verdict];
  const VerdictIcon = vc.icon;
  const totalChecks =
    result.passedChecks.length + result.failedChecks.length + result.warnings.length;
  const passRate =
    totalChecks > 0 ? Math.round((result.passedChecks.length / totalChecks) * 100) : 0;

  return (
    <div className="space-y-5">
      {/* Verdict Hero */}
      <div
        className={`relative overflow-hidden rounded-2xl border bg-gradient-to-br ${vc.gradient} ${vc.glow} ring-1 ${vc.ring} p-6`}
      >
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
            <div className="flex items-center gap-3">
              <h2 className="text-2xl font-black tracking-tight">{vc.label}</h2>
              <span className="text-xs font-mono px-2 py-0.5 rounded-full bg-card/60 backdrop-blur-sm border border-white/10 text-muted-foreground">
                {passRate}% pass rate
              </span>
            </div>
            <p className="mt-1 text-sm text-foreground/70 line-clamp-2">{result.summary}</p>
            <div className="flex items-center gap-4 mt-3 text-xs text-muted-foreground font-mono">
              <span className="flex items-center gap-1">
                <Cpu className="h-3 w-3" /> {result.modelUsed}
              </span>
              <span className="flex items-center gap-1">
                <Clock className="h-3 w-3" /> {(result.durationMs / 1000).toFixed(1)}s
              </span>
              <span className="flex items-center gap-1">
                <Activity className="h-3 w-3" /> {totalChecks} checks
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Metric Cards */}
      <div className="grid grid-cols-3 gap-3">
        <MetricCard value={result.passedChecks.length} label="Passed" icon={<TrendingUp className="h-4 w-4" />} color="emerald" />
        <MetricCard value={result.failedChecks.length} label="Failed" icon={<TrendingDown className="h-4 w-4" />} color="red" />
        <MetricCard value={result.warnings.length} label="Warnings" icon={<AlertTriangle className="h-4 w-4" />} color="amber" />
      </div>

      {/* Compliance Bar */}
      <div className="rounded-xl border border-border bg-card p-4">
        <div className="flex items-center justify-between text-xs mb-2">
          <span className="font-medium text-foreground">Compliance Score</span>
          <span className="font-mono text-muted-foreground">{passRate}%</span>
        </div>
        <div className="h-3 rounded-full bg-secondary overflow-hidden flex">
          {result.passedChecks.length > 0 && (
            <div
              className="h-full bg-gradient-to-r from-emerald-500 to-green-400 transition-all duration-1000"
              style={{ width: `${(result.passedChecks.length / totalChecks) * 100}%` }}
            />
          )}
          {result.warnings.length > 0 && (
            <div
              className="h-full bg-gradient-to-r from-amber-500 to-yellow-400 transition-all duration-1000"
              style={{ width: `${(result.warnings.length / totalChecks) * 100}%` }}
            />
          )}
          {result.failedChecks.length > 0 && (
            <div
              className="h-full bg-gradient-to-r from-red-500 to-rose-400 transition-all duration-1000"
              style={{ width: `${(result.failedChecks.length / totalChecks) * 100}%` }}
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

      {/* Check Sections */}
      {result.failedChecks.length > 0 && (
        <CheckGrid title="Failed Checks" icon={<XCircle className="h-4 w-4 text-red-400" />} checks={result.failedChecks} color="red" />
      )}
      {result.warnings.length > 0 && (
        <CheckGrid title="Warnings" icon={<AlertTriangle className="h-4 w-4 text-amber-400" />} checks={result.warnings} color="amber" />
      )}
      {result.passedChecks.length > 0 && (
        <CheckGrid title="Passed Checks" icon={<CheckCircle className="h-4 w-4 text-emerald-400" />} checks={result.passedChecks} color="emerald" collapsed />
      )}

      {/* Retrieved vectors used in this evaluation */}
      {result.retrievedPolicies?.length > 0 && (
        <div className="rounded-xl border border-border bg-card/60 backdrop-blur-sm p-4">
          <div className="mb-3 flex items-center gap-2">
            <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-violet-500/10 ring-1 ring-violet-500/20">
              <Database className="h-3.5 w-3.5 text-violet-400" />
            </div>
            <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Retrieved Vectors Used
            </span>
          </div>

          <div className="space-y-2">
            {result.retrievedPolicies.slice(0, 8).map((policy) => (
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
                <div className="mt-1 flex items-center gap-2 text-[11px] text-muted-foreground font-mono">
                  <span>vector={policy.vectorId.slice(0, 8)}…</span>
                  <span>cat={policy.category}</span>
                  <span>p.{policy.sourcePage}</span>
                </div>
              </div>
            ))}
          </div>

          {result.retrievedPolicies.length > 8 && (
            <p className="mt-2 text-[11px] text-muted-foreground">
              +{result.retrievedPolicies.length - 8} more vectors used in this evaluation (see full details)
            </p>
          )}
        </div>
      )}

      {/* Data Privacy Shield */}
      {result.anonymizationReport?.length > 0 && (
        <AnonymizationPanel report={result.anonymizationReport} />
      )}

      {/* View Full Details */}
      <Button variant="outline" className="w-full group" onClick={onViewDetails}>
        View Full Evaluation Details
        <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
      </Button>
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
      <p className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider">{label}</p>
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
          <Badge variant="secondary" className="text-[10px] font-mono">{checks.length}</Badge>
        </div>
        <svg
          className={`h-4 w-4 text-muted-foreground transition-transform ${open ? "rotate-180" : ""}`}
          fill="none" viewBox="0 0 24 24" stroke="currentColor"
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
              <div className={`absolute left-0 top-2 bottom-2 w-0.5 rounded-full ${dotColors[color]}`} />
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <code className="text-xs font-bold font-mono text-foreground/80">{check.policyCode}</code>
                    <span className="text-sm font-medium">{check.policyTitle}</span>
                  </div>
                  <p className="mt-1 text-xs text-foreground/60 leading-relaxed">{check.reason}</p>
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
