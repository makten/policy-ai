"use client";

import { useState, useEffect } from "react";
import api from "@/lib/api";
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
  ChevronDown,
  ChevronUp,
  Copy,
  ClipboardCheck,
} from "lucide-react";

// ─── Types inferred from the Assess API response ────────────────────────────

interface RuleCheck {
  code?: string | number;
  description?: string;
  verdict?: string;
  status?: string;
  rejectionType?: string;
  categoryType?: string;
  employeeExplanation?: string;
  [key: string]: unknown;
}

interface AssessResponse {
  verdict?: string;
  overallVerdict?: string;
  assessmentVerdict?: string;
  checks?: RuleCheck[];
  ruleChecks?: RuleCheck[];
  businessRuleChecks?: RuleCheck[];
  decisionGroups?: Array<{
    name?: string;
    verdict?: string;
    checks?: RuleCheck[];
    ruleChecks?: RuleCheck[];
  }>;
  [key: string]: unknown;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function getOverallVerdict(data: AssessResponse): string | null {
  return (
    data.verdict ??
    data.overallVerdict ??
    data.assessmentVerdict ??
    null
  );
}

function getAllChecks(data: AssessResponse): RuleCheck[] {
  const direct =
    data.checks ?? data.ruleChecks ?? data.businessRuleChecks ?? [];

  const fromGroups = (data.decisionGroups ?? []).flatMap(
    (g) => g.checks ?? g.ruleChecks ?? []
  );

  return [...direct, ...fromGroups];
}

function verdictColor(v?: string) {
  if (!v) return "bg-gray-500";
  const upper = v.toUpperCase();
  if (upper === "APPROVED" || upper === "PASS" || upper === "TRUE")
    return "bg-emerald-500";
  if (upper === "REJECTED" || upper === "FAIL" || upper === "FALSE")
    return "bg-red-500";
  return "bg-yellow-500";
}

function verdictIcon(v?: string) {
  if (!v) return <AlertTriangle className="h-4 w-4" />;
  const upper = v.toUpperCase();
  if (upper === "APPROVED" || upper === "PASS" || upper === "TRUE")
    return <CheckCircle className="h-4 w-4" />;
  if (upper === "REJECTED" || upper === "FAIL" || upper === "FALSE")
    return <XCircle className="h-4 w-4" />;
  return <AlertTriangle className="h-4 w-4" />;
}

// ─── Page ────────────────────────────────────────────────────────────────────

export default function AssessmentPage() {
  const [jsonText, setJsonText] = useState<string>("");
  const [jsonError, setJsonError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [result, setResult] = useState<AssessResponse | null>(null);
  const [rawResult, setRawResult] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [expandedChecks, setExpandedChecks] = useState<Set<number>>(new Set());
  const [showRaw, setShowRaw] = useState(false);
  const [copied, setCopied] = useState(false);

  // Load the template on mount
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

  async function execute() {
    if (jsonError) return;

    let parsed: unknown;
    try {
      parsed = JSON.parse(jsonText);
    } catch {
      setJsonError("Invalid JSON — fix before executing.");
      return;
    }

    setIsLoading(true);
    setResult(null);
    setRawResult(null);
    setError(null);
    setExpandedChecks(new Set());

    try {
      const response = await api.post("/assessment/execute", parsed, {
        timeout: 180_000,
      });

      const raw = JSON.stringify(response.data, null, 2);
      setRawResult(raw);
      setResult(response.data as AssessResponse);
    } catch (err: unknown) {
      if (
        typeof err === "object" &&
        err !== null &&
        "response" in err &&
        (err as { response?: { data?: unknown } }).response
      ) {
        const e = err as { response: { data?: { error?: string; detail?: string } } };
        setError(
          e.response.data?.error ??
          e.response.data?.detail ??
          "Assessment API returned an error."
        );
      } else if (err instanceof Error) {
        setError(err.message);
      } else {
        setError("Unknown error occurred.");
      }
    } finally {
      setIsLoading(false);
    }
  }

  function toggleCheck(idx: number) {
    setExpandedChecks((prev) => {
      const next = new Set(prev);
      next.has(idx) ? next.delete(idx) : next.add(idx);
      return next;
    });
  }

  async function copyRaw() {
    if (!rawResult) return;
    await navigator.clipboard.writeText(rawResult);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  const overallVerdict = result ? getOverallVerdict(result) : null;
  const checks = result ? getAllChecks(result) : [];
  const failedChecks = checks.filter((c) => {
    const v = (c.verdict ?? c.status ?? "").toUpperCase();
    return v === "FAILED" || v === "REJECTED" || v === "FALSE" || v === "FAIL";
  });
  const passedChecks = checks.filter((c) => {
    const v = (c.verdict ?? c.status ?? "").toUpperCase();
    return v === "PASSED" || v === "APPROVED" || v === "TRUE" || v === "PASS";
  });

  return (
    <div className="flex h-full flex-col gap-6 p-6 overflow-auto">
      <PageHeader
        title="Assessment"
        description="Execute a mortgage application assessment against the Volksbank Assessment API"
      />

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6 min-h-0">
        {/* ── Left: Editor ─────────────────────────────────────────────── */}
        <Card className="flex flex-col">
          <CardHeader className="flex-row items-center justify-between pb-2">
            <CardTitle className="text-base">Request JSON</CardTitle>
            <div className="flex gap-2">
              <Button
                size="sm"
                variant="outline"
                onClick={resetToTemplate}
                className="gap-1 text-xs"
              >
                <RotateCcw className="h-3 w-3" />
                Reset Template
              </Button>
              <Button
                size="sm"
                onClick={execute}
                disabled={isLoading || !!jsonError}
                className="gap-1 text-xs"
              >
                {isLoading ? (
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
          <CardContent className="flex flex-col flex-1 gap-2 pb-4">
            {jsonError && (
              <div className="flex items-center gap-2 rounded-md bg-red-500/10 border border-red-500/20 px-3 py-2 text-xs text-red-400">
                <AlertTriangle className="h-3 w-3 shrink-0" />
                <span className="font-mono">{jsonError}</span>
              </div>
            )}
            <textarea
              className="flex-1 min-h-[500px] w-full rounded-md border border-border bg-muted/30 px-3 py-2 font-mono text-xs leading-relaxed text-foreground resize-none focus:outline-none focus:ring-1 focus:ring-primary"
              value={jsonText}
              onChange={(e) => handleJsonChange(e.target.value)}
              spellCheck={false}
            />
          </CardContent>
        </Card>

        {/* ── Right: Results ───────────────────────────────────────────── */}
        <div className="flex flex-col gap-4 overflow-auto">
          {error && (
            <Card className="border-red-500/30 bg-red-500/5">
              <CardContent className="flex items-start gap-3 pt-4">
                <XCircle className="h-5 w-5 text-red-400 shrink-0 mt-0.5" />
                <div>
                  <p className="text-sm font-semibold text-red-400">Assessment Failed</p>
                  <p className="text-xs text-red-300/80 mt-1 font-mono">{error}</p>
                </div>
              </CardContent>
            </Card>
          )}

          {result && (
            <>
              {/* Verdict Banner */}
              <Card
                className={`border-0 ${
                  overallVerdict?.toUpperCase() === "APPROVED" ||
                  overallVerdict?.toUpperCase() === "PASS"
                    ? "bg-emerald-500/10 ring-1 ring-emerald-500/30"
                    : overallVerdict?.toUpperCase() === "REJECTED" ||
                      overallVerdict?.toUpperCase() === "FAIL"
                    ? "bg-red-500/10 ring-1 ring-red-500/30"
                    : "bg-yellow-500/10 ring-1 ring-yellow-500/30"
                }`}
              >
                <CardContent className="flex items-center justify-between pt-4 pb-4">
                  <div>
                    <p className="text-xs text-muted-foreground uppercase tracking-widest mb-1">
                      Overall Verdict
                    </p>
                    <p className="text-2xl font-bold tracking-tight">
                      {overallVerdict ?? "—"}
                    </p>
                    <p className="text-xs text-muted-foreground mt-1">
                      {checks.length} checks · {passedChecks.length} passed ·{" "}
                      {failedChecks.length} failed
                    </p>
                  </div>
                  <div
                    className={`flex h-14 w-14 items-center justify-center rounded-full ${verdictColor(overallVerdict ?? undefined)} text-white`}
                  >
                    {verdictIcon(overallVerdict ?? undefined)}
                  </div>
                </CardContent>
              </Card>

              {/* Checks list */}
              {checks.length > 0 && (
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-base">Rule Checks</CardTitle>
                  </CardHeader>
                  <CardContent className="flex flex-col gap-2 max-h-[420px] overflow-y-auto">
                    {checks.map((check, idx) => {
                      const v = check.verdict ?? check.status ?? "";
                      const isExpanded = expandedChecks.has(idx);
                      return (
                        <div
                          key={idx}
                          className="rounded-md border border-border bg-muted/20 overflow-hidden"
                        >
                          <button
                            className="flex w-full items-center gap-3 px-3 py-2.5 text-left hover:bg-muted/30 transition-colors"
                            onClick={() => toggleCheck(idx)}
                          >
                            <span className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full ${verdictColor(v)} text-white`}>
                              {verdictIcon(v)}
                            </span>
                            <span className="flex-1 text-xs font-medium truncate">
                              {check.code && (
                                <span className="text-muted-foreground mr-2">
                                  #{check.code}
                                </span>
                              )}
                              {check.description ?? "Rule check"}
                            </span>
                            {check.categoryType && (
                              <Badge variant="outline" className="text-xs hidden sm:flex">
                                {check.categoryType}
                              </Badge>
                            )}
                            {check.rejectionType && (
                              <Badge className="text-xs bg-orange-500/20 text-orange-300 border-orange-500/30 hidden sm:flex">
                                {check.rejectionType}
                              </Badge>
                            )}
                            <Badge
                              className={`text-xs text-white ${verdictColor(v)}`}
                            >
                              {v || "Unknown"}
                            </Badge>
                            {isExpanded ? (
                              <ChevronUp className="h-3 w-3 text-muted-foreground shrink-0" />
                            ) : (
                              <ChevronDown className="h-3 w-3 text-muted-foreground shrink-0" />
                            )}
                          </button>
                          {isExpanded && (
                            <div className="border-t border-border px-3 py-2 bg-muted/10 space-y-1">
                              {check.employeeExplanation && (
                                <p className="text-xs text-muted-foreground">
                                  <span className="font-medium text-foreground">Explanation: </span>
                                  {check.employeeExplanation}
                                </p>
                              )}
                              <pre className="text-xs text-muted-foreground font-mono overflow-auto rounded bg-muted/30 p-2 max-h-40">
                                {JSON.stringify(check, null, 2)}
                              </pre>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </CardContent>
                </Card>
              )}

              {/* Raw Response */}
              <Card>
                <CardHeader className="pb-2">
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-base">Raw Response</CardTitle>
                    <div className="flex gap-2">
                      <Button
                        size="sm"
                        variant="outline"
                        className="gap-1 text-xs"
                        onClick={copyRaw}
                      >
                        {copied ? (
                          <ClipboardCheck className="h-3 w-3 text-emerald-400" />
                        ) : (
                          <Copy className="h-3 w-3" />
                        )}
                        {copied ? "Copied" : "Copy"}
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        className="text-xs"
                        onClick={() => setShowRaw((v) => !v)}
                      >
                        {showRaw ? "Hide" : "Show"}
                      </Button>
                    </div>
                  </div>
                </CardHeader>
                {showRaw && (
                  <CardContent>
                    <pre className="text-xs font-mono text-muted-foreground bg-muted/30 rounded-md p-3 overflow-auto max-h-60">
                      {rawResult}
                    </pre>
                  </CardContent>
                )}
              </Card>
            </>
          )}

          {!result && !error && !isLoading && (
            <div className="flex flex-col items-center justify-center gap-3 rounded-lg border border-dashed border-border p-12 text-center">
              <Activity className="h-10 w-10 text-muted-foreground/40" />
              <p className="text-sm text-muted-foreground">
                Edit the request JSON and click <strong>Execute</strong> to run an assessment
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
