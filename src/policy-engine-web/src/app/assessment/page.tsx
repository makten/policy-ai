"use client";

import { useState, useEffect, type ReactNode } from "react";
import { PageHeader } from "@/components/ui/page-header";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Activity,
  Play,
  RotateCcw,
  CheckCircle,
  XCircle,
  AlertTriangle,
  Copy,
  ClipboardCheck,
  Cpu,
  Clock,
  TrendingUp,
  TrendingDown,
  Eye,
  X,
  ChevronDown,
  ChevronRight,
  Info,
} from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import {
  executeAssessment,
  fetchAssessmentDecision,
  fetchDecisionRuleDetails,
} from "@/lib/queries";
import type {
  AssessmentDecisionResponseDto,
  DecisionRuleResultDto,
  DecisionRuleDetailsDto,
  DecisionParameter,
} from "@/types";

type UiVerdict = "APPROVED" | "REJECTED" | "MANUAL_REVIEW";

type RuleBucket = "PASS" | "FAIL" | "WARNING";

const verdictConfig: Record<
  UiVerdict,
  {
    gradient: string;
    glow: string;
    icon: typeof CheckCircle;
    label: string;
    ring: string;
    accentColor: string;
  }
> = {
  APPROVED: {
    gradient: "from-emerald-500/20 via-green-500/10 to-teal-500/20",
    glow: "shadow-[0_0_60px_-12px_rgba(34,197,94,0.35)]",
    icon: CheckCircle,
    label: "APPROVED",
    ring: "ring-emerald-500/30",
    accentColor: "#22c55e",
  },
  REJECTED: {
    gradient: "from-red-500/20 via-rose-500/10 to-pink-500/20",
    glow: "shadow-[0_0_60px_-12px_rgba(239,68,68,0.35)]",
    icon: XCircle,
    label: "REJECTED",
    ring: "ring-red-500/30",
    accentColor: "#ef4444",
  },
  MANUAL_REVIEW: {
    gradient: "from-amber-500/20 via-yellow-500/10 to-orange-500/20",
    glow: "shadow-[0_0_60px_-12px_rgba(245,158,11,0.35)]",
    icon: Eye,
    label: "MANUAL REVIEW",
    ring: "ring-amber-500/30",
    accentColor: "#f59e0b",
  },
};

const PASS_CODES = new Set(["PASS", "PASSED", "APPROVED", "TRUE", "OK"]);

const FAIL_CODES = new Set([
  "FAIL",
  "FAILED",
  "REJECTED",
  "FALSE",
  "GV",
  "O",
  "GG",
  "P",
  "F1",
  "F2",
  "BB",
  "V",
  "VZ",
]);

const POLL_INTERVAL_MS = 2500;
const MAX_POLL_ATTEMPTS = 48;
const GUID_PLACEHOLDER_REGEX = /\{\{?\$guid\}?\}/gi;

function normalizeCode(value: string | null | undefined): string {
  return (value ?? "").trim().toUpperCase();
}

function classifyRule(resultCode: string | null | undefined): RuleBucket {
  const code = normalizeCode(resultCode);
  if (PASS_CODES.has(code)) return "PASS";
  if (FAIL_CODES.has(code)) return "FAIL";
  return "WARNING";
}

function toUiVerdict(resultCode: string | null | undefined): UiVerdict {
  const code = normalizeCode(resultCode);
  if (PASS_CODES.has(code)) return "APPROVED";
  if (FAIL_CODES.has(code)) return "REJECTED";
  return "MANUAL_REVIEW";
}

function extractCorrelationReference(payload: Record<string, unknown>): string | null {
  const directKeys = [
    "assessmentCorrelationReference",
    "correlationReference",
    "assessmentReference",
    "reference",
  ];

  for (const key of directKeys) {
    const value = payload[key];
    if (typeof value === "string" && value.trim()) return value.trim();
  }

  const nestedCandidates = [
    payload.data,
    payload.result,
    payload.response,
    payload.assessment,
  ];

  for (const candidate of nestedCandidates) {
    if (candidate && typeof candidate === "object") {
      const nested = extractCorrelationReference(candidate as Record<string, unknown>);
      if (nested) return nested;
    }
  }

  return null;
}

function prepareAssessmentRequest(payload: unknown): {
  requestBody: unknown;
  assessmentCorrelationReference: string | null;
} {
  let foundReference: string | null = null;

  function walk(value: unknown, parentKey?: string): unknown {
    if (typeof value === "string") {
      const replaced = value.replace(GUID_PLACEHOLDER_REGEX, () => crypto.randomUUID());
      if ((parentKey ?? "").toLowerCase() === "assessmentcorrelationreference" && replaced.trim()) {
        foundReference = replaced.trim();
      }
      return replaced;
    }

    if (Array.isArray(value)) {
      return value.map((item) => walk(item));
    }

    if (value && typeof value === "object") {
      const next: Record<string, unknown> = {};
      for (const [key, nested] of Object.entries(value as Record<string, unknown>)) {
        next[key] = walk(nested, key);
        if (
          key.toLowerCase() === "assessmentcorrelationreference" &&
          typeof next[key] === "string" &&
          (next[key] as string).trim()
        ) {
          foundReference = (next[key] as string).trim();
        }
      }
      return next;
    }

    return value;
  }

  const requestBody = walk(payload);
  return {
    requestBody,
    assessmentCorrelationReference: foundReference,
  };
}

function hasDecisionResult(data: AssessmentDecisionResponseDto): boolean {
  return !!normalizeCode(data.resultCode);
}

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export default function AssessmentPage() {
  const [jsonText, setJsonText] = useState<string>("");
  const [jsonError, setJsonError] = useState<string | null>(null);
  const [isExecuting, setIsExecuting] = useState(false);
  const [isPolling, setIsPolling] = useState(false);
  const [pollAttempt, setPollAttempt] = useState(0);
  const [correlationReference, setCorrelationReference] = useState<string | null>(null);
  const [result, setResult] = useState<AssessmentDecisionResponseDto | null>(null);
  const [rawResult, setRawResult] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [selectedRuleRef, setSelectedRuleRef] = useState<string | null>(null);

  useEffect(() => {
    fetch("/templates/ama_request.json")
      .then((r) => r.json())
      .then((data) => setJsonText(JSON.stringify(data, null, 2)))
      .catch(() => setJsonText("{}"));
  }, []);

  function handleJsonChange(value: string) {
    setJsonText(value);
    try {
      JSON.parse(value);
      setJsonError(null);
    } catch (e: unknown) {
      setJsonError(e instanceof Error ? e.message : "Invalid JSON");
    }
  }

  function resetToTemplate() {
    fetch("/templates/ama_request.json")
      .then((r) => r.json())
      .then((data) => {
        setJsonText(JSON.stringify(data, null, 2));
        setJsonError(null);
      });
  }

  async function pollDecision(assessmentCorrelationReference: string): Promise<AssessmentDecisionResponseDto> {
    for (let attempt = 1; attempt <= MAX_POLL_ATTEMPTS; attempt += 1) {
      setPollAttempt(attempt);
      try {
        const decision = await fetchAssessmentDecision(assessmentCorrelationReference);
        if (hasDecisionResult(decision)) {
          return decision;
        }
      } catch (err: unknown) {
        if (
          typeof err === "object" &&
          err !== null &&
          "response" in err &&
          (err as { response?: { status?: number } }).response
        ) {
          const status = (err as { response: { status?: number } }).response.status;
          if (status && status >= 500) {
            throw err;
          }
        }
      }

      if (attempt < MAX_POLL_ATTEMPTS) {
        await wait(POLL_INTERVAL_MS);
      }
    }

    throw new Error("Assessment started, but no decision is available yet. Please try again shortly.");
  }

  async function execute() {
    if (jsonError) return;

    let parsed: unknown;
    try {
      parsed = JSON.parse(jsonText);
    } catch {
      setJsonError("Invalid JSON — fix before executing.");
      return;
    }

    setIsExecuting(true);
    setIsPolling(false);
    setPollAttempt(0);
    setCorrelationReference(null);
    setResult(null);
    setRawResult(null);
    setError(null);

    try {
      const prepared = prepareAssessmentRequest(parsed);
      const executeResponse = await executeAssessment(prepared.requestBody);
      const assessmentCorrelationReference =
        prepared.assessmentCorrelationReference ?? extractCorrelationReference(executeResponse);

      if (!assessmentCorrelationReference) {
        throw new Error("Assessment started but no assessmentCorrelationReference was returned.");
      }

      setCorrelationReference(assessmentCorrelationReference);
      setIsPolling(true);

      const decision = await pollDecision(assessmentCorrelationReference);
      setResult(decision);
      setRawResult(JSON.stringify(decision, null, 2));
    } catch (err: unknown) {
      if (err instanceof Error) {
        setError(err.message);
      } else {
        setError("Unknown error occurred.");
      }
    } finally {
      setIsExecuting(false);
      setIsPolling(false);
    }
  }

  async function copyRaw() {
    if (!rawResult) return;
    await navigator.clipboard.writeText(rawResult);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  const checks = result?.ruleResultCollection ?? [];
  const passedChecks = checks.filter((c) => classifyRule(c.resultCode) === "PASS");
  const failedChecks = checks.filter((c) => classifyRule(c.resultCode) === "FAIL");
  const warningChecks = checks.filter((c) => classifyRule(c.resultCode) === "WARNING");
  const totalChecks = checks.length;
  const passRate = totalChecks > 0 ? Math.round((passedChecks.length / totalChecks) * 100) : 0;

  const overallVerdict = toUiVerdict(result?.resultCode);
  const vc = verdictConfig[overallVerdict];
  const VerdictIcon = vc.icon;

  return (
    <div className="space-y-6 max-w-5xl">
      <PageHeader
        title="Assessment"
        description="Execute a mortgage application assessment and fetch the asynchronous decision result"
      />

      <Card>
        <CardHeader className="flex-row items-center justify-between pb-2">
          <CardTitle className="text-base">Request JSON</CardTitle>
          <div className="flex gap-2">
            <Button
              onClick={resetToTemplate}
              className="h-8 border border-border bg-card px-3 text-xs text-foreground hover:bg-secondary"
            >
              <RotateCcw className="h-3 w-3" />
              Reset Template
            </Button>
            <Button
              onClick={execute}
              disabled={isExecuting || !!jsonError}
              className="h-8 px-3 text-xs"
            >
              {isExecuting ? (
                <>
                  <Activity className="h-3 w-3 animate-spin" />
                  Executing…
                </>
              ) : (
                <>
                  <Play className="h-3 w-3" />
                  Execute
                </>
              )}
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-2">
          {jsonError && (
            <div className="flex items-center gap-2 rounded-md bg-red-500/10 border border-red-500/20 px-3 py-2 text-xs text-red-400">
              <AlertTriangle className="h-3 w-3 shrink-0" />
              <span className="font-mono">{jsonError}</span>
            </div>
          )}
          <textarea
            className="min-h-[320px] w-full rounded-md border border-border bg-muted/30 px-3 py-2 font-mono text-xs leading-relaxed text-foreground resize-none focus:outline-none focus:ring-1 focus:ring-primary"
            value={jsonText}
            onChange={(e) => handleJsonChange(e.target.value)}
            spellCheck={false}
          />
        </CardContent>
      </Card>

      {isPolling && (
        <Card className="border-primary/30 bg-primary/5">
          <CardContent className="py-4 flex items-center justify-between gap-4">
            <div>
              <p className="text-sm font-semibold">Assessment submitted. Waiting for decision...</p>
              {correlationReference && (
                <p className="text-xs text-muted-foreground font-mono mt-1">
                  assessmentCorrelationReference: {correlationReference}
                </p>
              )}
            </div>
            <Badge className="font-mono text-xs bg-secondary text-secondary-foreground">
              Poll {pollAttempt}/{MAX_POLL_ATTEMPTS}
            </Badge>
          </CardContent>
        </Card>
      )}

      {error && (
        <Card className="border-destructive/30 bg-destructive/5">
          <CardContent className="py-4">
            <p className="text-sm font-semibold text-destructive">Assessment Failed</p>
            <p className="text-xs mt-1 text-destructive/80 font-mono">{error}</p>
          </CardContent>
        </Card>
      )}

      {result && (
        <div className="space-y-5">
          <div
            className={`relative overflow-hidden rounded-2xl border bg-gradient-to-br ${vc.gradient} ${vc.glow} ring-1 ${vc.ring} p-6`}
          >
            <div className="relative flex items-center gap-5">
              <div className="relative flex h-16 w-16 items-center justify-center rounded-full bg-card/80 backdrop-blur-sm border border-white/10">
                <VerdictIcon className="h-8 w-8" style={{ color: vc.accentColor }} />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-3">
                  <h2 className="text-2xl font-black tracking-tight">{vc.label}</h2>
                  <span className="text-xs font-mono px-2 py-0.5 rounded-full bg-card/60 border border-white/10 text-muted-foreground">
                    {passRate}% pass rate
                  </span>
                </div>
                <p className="mt-1 text-sm text-foreground/70">
                  Decision result code: {result.resultCode}
                </p>
                <div className="flex items-center gap-4 mt-3 text-xs text-muted-foreground font-mono">
                  <span className="flex items-center gap-1">
                    <Cpu className="h-3 w-3" /> Decision API
                  </span>
                  <span className="flex items-center gap-1">
                    <Clock className="h-3 w-3" /> {String(result.decisionTimeStamp)}
                  </span>
                  <span className="flex items-center gap-1">
                    <Activity className="h-3 w-3" /> {totalChecks} checks
                  </span>
                </div>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-3 gap-3">
            <MetricCard value={passedChecks.length} label="Passed" icon={<TrendingUp className="h-4 w-4" />} color="emerald" />
            <MetricCard value={failedChecks.length} label="Failed" icon={<TrendingDown className="h-4 w-4" />} color="red" />
            <MetricCard value={warningChecks.length} label="Warnings" icon={<AlertTriangle className="h-4 w-4" />} color="amber" />
          </div>

          <div className="rounded-xl border border-border bg-card p-4">
            <div className="flex items-center justify-between text-xs mb-2">
              <span className="font-medium text-foreground">Compliance Score</span>
              <span className="font-mono text-muted-foreground">{passRate}%</span>
            </div>
            <div className="h-3 rounded-full bg-secondary overflow-hidden flex">
              {passedChecks.length > 0 && (
                <div
                  className="h-full bg-gradient-to-r from-emerald-500 to-green-400"
                  style={{ width: `${(passedChecks.length / totalChecks) * 100}%` }}
                />
              )}
              {warningChecks.length > 0 && (
                <div
                  className="h-full bg-gradient-to-r from-amber-500 to-yellow-400"
                  style={{ width: `${(warningChecks.length / totalChecks) * 100}%` }}
                />
              )}
              {failedChecks.length > 0 && (
                <div
                  className="h-full bg-gradient-to-r from-red-500 to-rose-400"
                  style={{ width: `${(failedChecks.length / totalChecks) * 100}%` }}
                />
              )}
            </div>
          </div>

          {failedChecks.length > 0 && (
            <DecisionCheckGrid title="Failed Checks" checks={failedChecks} color="red" onRuleClick={setSelectedRuleRef} />
          )}
          {warningChecks.length > 0 && (
            <DecisionCheckGrid title="Warnings" checks={warningChecks} color="amber" onRuleClick={setSelectedRuleRef} />
          )}
          {passedChecks.length > 0 && (
            <DecisionCheckGrid title="Passed Checks" checks={passedChecks} color="emerald" onRuleClick={setSelectedRuleRef} />
          )}

          <Card>
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between">
                <CardTitle className="text-base">Raw Decision Response</CardTitle>
                <Button
                  className="h-8 border border-border bg-card px-3 text-xs hover:bg-secondary"
                  onClick={copyRaw}
                >
                  {copied ? (
                    <ClipboardCheck className="h-3 w-3 text-emerald-400" />
                  ) : (
                    <Copy className="h-3 w-3" />
                  )}
                  {copied ? "Copied" : "Copy"}
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              <pre className="text-xs font-mono text-muted-foreground bg-muted/30 rounded-md p-3 overflow-auto max-h-72">
                {rawResult}
              </pre>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Rule detail modal */}
      {selectedRuleRef && correlationReference && (
        <RuleDetailModal
          correlationReference={correlationReference}
          ruleReference={selectedRuleRef}
          onClose={() => setSelectedRuleRef(null)}
        />
      )}
    </div>
  );
}

function MetricCard({
  value,
  label,
  icon,
  color,
}: {
  value: number;
  label: string;
  icon: ReactNode;
  color: "emerald" | "red" | "amber";
}) {
  const gradients: Record<string, string> = {
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

function DecisionCheckGrid({
  title,
  checks,
  color,
  onRuleClick,
}: {
  title: string;
  checks: DecisionRuleResultDto[];
  color: "emerald" | "red" | "amber";
  onRuleClick: (ruleReference: string) => void;
}) {
  const tone =
    color === "emerald"
      ? "border-emerald-500/20 bg-emerald-500/[0.04]"
      : color === "red"
      ? "border-red-500/20 bg-red-500/[0.04]"
      : "border-amber-500/20 bg-amber-500/[0.04]";

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base">{title}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        {checks.map((check) => (
          <div
            key={`${check.ruleReference}-${check.resultCode}-${check.category}`}
            className={`rounded-lg border px-3 py-3 ${tone} cursor-pointer hover:ring-1 hover:ring-border transition-all group`}
            onClick={() => onRuleClick(check.ruleReference)}
          >
            <div className="flex flex-wrap items-center gap-2">
              <Badge className="font-mono text-[10px] border border-border bg-transparent text-foreground">
                {check.ruleReference}
              </Badge>
              <Badge className="font-mono text-[10px] bg-secondary text-secondary-foreground">
                {check.resultCode}
              </Badge>
              <Badge className="text-[10px] border border-border bg-transparent text-foreground">
                {check.category}
              </Badge>
              <span className="ml-auto text-[10px] text-muted-foreground flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                <Info className="h-3 w-3" /> details
              </span>
            </div>
            <p className="mt-2 text-sm font-medium">{check.ruleDescription}</p>
            {check.employeeExplanation && (
              <p className="mt-1 text-xs text-muted-foreground">{check.employeeExplanation}</p>
            )}
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

/* ─── Rule Detail Modal ─── */

function RuleDetailModal({
  correlationReference,
  ruleReference,
  onClose,
}: {
  correlationReference: string;
  ruleReference: string;
  onClose: () => void;
}) {
  const [logicExpanded, setLogicExpanded] = useState(false);

  const { data, isLoading, isError } = useQuery<DecisionRuleDetailsDto>({
    queryKey: ["decision-rule-details", correlationReference, ruleReference],
    queryFn: () => fetchDecisionRuleDetails(correlationReference, ruleReference),
    staleTime: 60_000,
    retry: 1,
  });

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="relative bg-card border border-border rounded-xl shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between gap-4 px-6 py-4 border-b border-border shrink-0">
          <div className="flex items-center gap-2">
            <Badge variant="outline" className="font-mono text-xs">{ruleReference}</Badge>
            <span className="text-sm font-semibold text-muted-foreground">Rule Details</span>
          </div>
          <button
            onClick={onClose}
            className="rounded-md p-1 hover:bg-secondary transition-colors"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Body */}
        <div className="overflow-y-auto px-6 py-5 space-y-5 text-sm">
          {isLoading && (
            <div className="flex items-center justify-center py-10 gap-2 text-muted-foreground text-xs">
              <Activity className="h-4 w-4 animate-spin" />
              Loading rule details…
            </div>
          )}

          {isError && (
            <p className="text-sm text-destructive">
              Failed to load rule details. The rule may not have details available.
            </p>
          )}

          {data && (
            <>
              {/* Description */}
              <p className="font-medium text-base">{data.ruleDescription}</p>

              {/* Explanations */}
              {data.employeeExplanation && (
                <div>
                  <p className="text-xs font-semibold text-muted-foreground mb-1">Employee explanation</p>
                  <p className="bg-secondary/30 rounded-md p-3">{data.employeeExplanation}</p>
                </div>
              )}
              {data.customerExplanation && (
                <div>
                  <p className="text-xs font-semibold text-muted-foreground mb-1">Customer explanation</p>
                  <p className="bg-secondary/30 rounded-md p-3">{data.customerExplanation}</p>
                </div>
              )}

              {/* Logical representation */}
              <div>
                <button
                  onClick={() => setLogicExpanded(!logicExpanded)}
                  className="flex items-center gap-1 text-xs font-semibold text-muted-foreground hover:text-foreground transition-colors"
                >
                  {logicExpanded ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
                  Logical representation
                </button>
                {logicExpanded && (
                  <pre className="mt-1 text-xs bg-secondary/30 rounded-md p-3 overflow-x-auto whitespace-pre-wrap break-words">
                    {data.logicalRepresentation}
                  </pre>
                )}
              </div>

              {/* Parameters */}
              {data.parameterCollection && data.parameterCollection.length > 0 && (
                <div>
                  <p className="text-xs font-semibold text-muted-foreground mb-2">Parameters</p>
                  <div className="space-y-1.5">
                    {data.parameterCollection.map((param, i) => (
                      <ParameterRow key={i} param={param} depth={0} />
                    ))}
                  </div>
                </div>
              )}

              {/* Characteristics */}
              {data.characteristicCollection && data.characteristicCollection.length > 0 && (
                <div>
                  <p className="text-xs font-semibold text-muted-foreground mb-2">Characteristics</p>
                  <div className="space-y-1.5">
                    {data.characteristicCollection.map((char, i) => (
                      <div key={i} className="flex items-center gap-2 rounded-md bg-secondary/30 px-3 py-2">
                        <code className="text-xs font-mono font-medium text-foreground/80 flex-1">{char.name}</code>
                        <Badge variant="secondary" className="text-[10px] font-mono">{char.type}</Badge>
                        {char.value && (
                          <span className="text-xs font-mono text-foreground/70">= {char.value}</span>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Overrule history */}
              {data.overruleResultCollection && data.overruleResultCollection.length > 0 && (
                <div>
                  <p className="text-xs font-semibold text-muted-foreground mb-2">Overrule history</p>
                  <div className="space-y-2">
                    {data.overruleResultCollection.map((overrule, i) => (
                      <div key={i} className="rounded-md border border-border bg-secondary/20 px-3 py-2.5 text-xs space-y-1">
                        <div className="flex items-center gap-2">
                          <Badge variant={overrule.isApproved ? "default" : "destructive"} className="text-[10px]">
                            {overrule.isApproved ? "Approved" : "Rejected"}
                          </Badge>
                          <span className="font-mono text-muted-foreground">{overrule.employeeReference}</span>
                          <span className="text-muted-foreground ml-auto">
                            {new Date(overrule.overruleDateTime).toLocaleDateString("nl-NL")}
                          </span>
                        </div>
                        <p className="text-foreground/70">{overrule.motivation}</p>
                        {overrule.reasonForOverrule && (
                          <p className="text-muted-foreground">Reason: {overrule.reasonForOverrule}</p>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

/* ─── Parameter row (recursive) ─── */

function ParameterRow({ param, depth }: { param: DecisionParameter; depth: number }) {
  return (
    <div style={{ marginLeft: depth * 16 }}>
      <div className="flex items-center gap-2 rounded-md bg-secondary/30 px-3 py-2">
        <code className="text-xs font-mono font-medium text-foreground/80 flex-1">{param.name}</code>
        <Badge variant="secondary" className="text-[10px] font-mono">{param.type}</Badge>
        {param.value != null && (
          <span className="text-xs font-mono text-foreground/70">= {param.value}</span>
        )}
      </div>
      {param.parameterCollection?.map((child, i) => (
        <ParameterRow key={i} param={child} depth={depth + 1} />
      ))}
    </div>
  );
}
