"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { fetchPolicyDocuments } from "@/lib/queries";
import api from "@/lib/api";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Wand2, Copy, CheckCheck, Download, ChevronDown, ChevronUp, Upload, CheckCircle2, XCircle, Loader2 } from "lucide-react";
import { LoadingSpinner } from "@/components/ui/loading-spinner";

interface GeneratedBusinessRule {
  code: number;
  description: string;
  startDate: string;
  endDate: string | null;
  nhgApplicableType: string;
  categoryType: string;
  rejectionType: string;
  employeeExplanation: string;
  customerExplanation: string | null;
  jsonExpression: object | null;
  arrangementTypes: string[];
  decisionGroups: string[];
  productLines: string[];
  datePolicyType: string;
}

interface GenerateResponse {
  businessRules: GeneratedBusinessRule[];
  totalGenerated: number;
  totalPolicies: number;
  hasMore: boolean;
  tokenUsage: { callType: string; model: string; promptTokens: number; completionTokens: number; totalTokens: number } | null;
  warnings: string[];
}

export default function GenerateBusinessRulesPage() {
  const [policyText, setPolicyText] = useState("");
  const [selectedDocumentId, setSelectedDocumentId] = useState<string>("");
  const [batchSize, setBatchSize] = useState(3);
  const [currentSkip, setCurrentSkip] = useState(0);
  const [allRules, setAllRules] = useState<GeneratedBusinessRule[]>([]);
  const [lastResponse, setLastResponse] = useState<GenerateResponse | null>(null);
  const [result, setResult] = useState<GenerateResponse | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [expandedRules, setExpandedRules] = useState<Set<number>>(new Set());
  const [importStatus, setImportStatus] = useState<Record<number, "idle" | "importing" | "success" | "error">>({})
  const [importErrors, setImportErrors] = useState<Record<number, string>>({});
  const [importRefs, setImportRefs] = useState<Record<number, string>>({});

  const documentsQuery = useQuery({
    queryKey: ["policyDocuments"],
    queryFn: fetchPolicyDocuments,
  });

  const documents = documentsQuery.data ?? [];

  async function runBatch(skip: number) {
    setIsLoading(true);
    setError(null);

    try {
      const { data } = await api.post<GenerateResponse>("/businessrules/generate", {
        policyText: policyText || undefined,
        policyDocumentId: selectedDocumentId || undefined,
        batchSize,
        skip,
      }, { timeout: 300_000 });

      setAllRules((prev) => skip === 0 ? data.businessRules : [...prev, ...data.businessRules]);
      setLastResponse(data);
      setResult(data);
      setCurrentSkip(skip + data.businessRules.length);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "An unexpected error occurred.");
    } finally {
      setIsLoading(false);
    }
  }

  async function handleGenerate() {
    if (!policyText.trim() && !selectedDocumentId) return;
    setAllRules([]);
    setCurrentSkip(0);
    setResult(null);
    setImportStatus({});
    setImportErrors({});
    setImportRefs({});
    await runBatch(0);
  }

  async function handleNextBatch() {
    await runBatch(currentSkip);
  }

  async function handleCopy() {
    if (!allRules.length) return;
    const json = JSON.stringify(allRules, null, 2);
    await navigator.clipboard.writeText(json);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  function handleDownload() {
    if (!allRules.length) return;
    const json = JSON.stringify(allRules, null, 2);
    const blob = new Blob([json], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "business-rules.json";
    a.click();
    URL.revokeObjectURL(url);
  }

  async function handleImport(rule: GeneratedBusinessRule) {
    setImportStatus((s) => ({ ...s, [rule.code]: "importing" }));
    try {
      const res = await api.post("/configuration/import-business-rule", rule);
      const ref: string = res.data?.ruleReference ?? "";
      setImportRefs((r) => ({ ...r, [rule.code]: ref }));
      setImportStatus((s) => ({ ...s, [rule.code]: "success" }));
    } catch (err: unknown) {
      const msg =
        (err as { response?: { data?: { error?: string } } })?.response?.data?.error ??
        (err instanceof Error ? err.message : "Import failed");
      setImportErrors((e) => ({ ...e, [rule.code]: msg }));
      setImportStatus((s) => ({ ...s, [rule.code]: "error" }));
    }
  }

  async function handleImportAll() {
    for (const rule of allRules) {
      if (importStatus[rule.code] === "success") continue;
      await handleImport(rule);
    }
  }

  function toggleRule(code: number) {
    setExpandedRules((prev) => {
      const next = new Set(prev);
      if (next.has(code)) next.delete(code);
      else next.add(code);
      return next;
    });
  }

  const canGenerate = !isLoading && (policyText.trim().length > 0 || !!selectedDocumentId);
  const hasMore = lastResponse?.hasMore ?? false;
  const totalPolicies = lastResponse?.totalPolicies ?? 0;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Generate Business Rules"
        description="Select a policy document or paste policy text and let AI extract structured business rules."
      />

      <Card>
        <CardHeader>
          <CardTitle>Policy Input</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">

          {/* Policy document selector */}
          <div>
            <label className="text-sm font-medium text-foreground">
              Select a policy document
            </label>
            <select
              value={selectedDocumentId}
              onChange={(e) => setSelectedDocumentId(e.target.value)}
              disabled={documentsQuery.isLoading}
              className="mt-1 h-10 w-full rounded-lg border border-border bg-card px-3 text-sm outline-none focus:ring-2 focus:ring-ring disabled:opacity-50"
            >
              {documentsQuery.isLoading ? (
                <option value="">Loading documents…</option>
              ) : documents.length === 0 ? (
                <option value="">— No policy documents available —</option>
              ) : (
                <>
                  <option value="">— None selected —</option>
                  {documents.map((doc) => (
                    <option key={doc.id} value={doc.id}>
                      {doc.entity || "Unknown"} — {doc.fileName} (v{doc.version})
                    </option>
                  ))}
                </>
              )}
            </select>
          </div>

          {/* Manual text input */}
          <div>
            <label className="text-sm font-medium text-foreground">
              Or paste policy text manually
            </label>
            <textarea
              className="mt-1 w-full min-h-[180px] rounded-md border border-input bg-background px-3 py-2 text-sm font-mono shadow-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring resize-y"
              placeholder="Paste your policy text here…"
              value={policyText}
              onChange={(e) => setPolicyText(e.target.value)}
            />
          </div>

          {/* Batch size */}
          <div className="flex items-center gap-3">
            <label className="text-sm font-medium text-foreground whitespace-nowrap">
              Policies per batch
            </label>
            <input
              type="number"
              min={1}
              max={20}
              value={batchSize}
              onChange={(e) => setBatchSize(Math.max(1, Math.min(20, Number(e.target.value))))}
              className="w-20 h-10 rounded-lg border border-border bg-card px-3 text-sm outline-none focus:ring-2 focus:ring-ring"
            />
            <span className="text-xs text-muted-foreground">
              Max 20 per request — lower values are faster and more reliable.
            </span>
          </div>

          <Button
            onClick={handleGenerate}
            disabled={!canGenerate}
            className="gap-2"
          >
            <Wand2 className="h-4 w-4" />
            {isLoading ? "Generating…" : "Generate Business Rules"}
          </Button>
        </CardContent>
      </Card>

      {isLoading && <LoadingSpinner label="Generating business rules…" />}

      {error && (
        <Card className="border-destructive">
          <CardContent className="pt-6 text-sm text-destructive">{error}</CardContent>
        </Card>
      )}

      {result && (
        <div className="space-y-4">
          {/* Summary bar */}
          <Card>
            <CardContent className="pt-6 flex items-center justify-between flex-wrap gap-4">
              <div className="flex items-center gap-4">
                <Badge variant="secondary" className="text-sm">
                  {allRules.length} rule{allRules.length !== 1 ? "s" : ""} generated
                  {totalPolicies > 0 && (
                    <span className="ml-1 opacity-70">
                      ({currentSkip}/{totalPolicies} policies processed)
                    </span>
                  )}
                </Badge>
                {result.tokenUsage && (
                  <span className="text-xs text-muted-foreground">
                    {result.tokenUsage.totalTokens.toLocaleString()} tokens ({result.tokenUsage.model})
                  </span>
                )}
              </div>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" onClick={handleCopy} className="gap-2">
                  {copied ? (
                    <><CheckCheck className="h-4 w-4 text-green-500" /> Copied</>
                  ) : (
                    <><Copy className="h-4 w-4" /> Copy JSON</>
                  )}
                </Button>
                <Button variant="outline" size="sm" onClick={handleDownload} className="gap-2">
                  <Download className="h-4 w-4" /> Download
                </Button>
                <Button size="sm" onClick={handleImportAll} className="gap-2">
                  <Upload className="h-4 w-4" /> Import All
                </Button>
              </div>
            </CardContent>
          </Card>

          {/* Warnings */}
          {result.warnings.length > 0 && (
            <Card className="border-amber-500/30">
              <CardContent className="pt-6">
                {result.warnings.map((w, i) => (
                  <p key={i} className="text-sm text-amber-600">{w}</p>
                ))}
              </CardContent>
            </Card>
          )}

          {/* Individual rules */}
          {allRules.map((rule) => (
            <Card key={rule.code} className="overflow-hidden">
              <button
                onClick={() => toggleRule(rule.code)}
                className="w-full text-left px-6 py-4 flex items-center justify-between hover:bg-muted/50 transition-colors"
              >
                <div className="flex items-center gap-3">
                  <Badge variant="outline" className="font-mono">{rule.code}</Badge>
                  <span className="font-medium text-sm">{rule.description.substring(0, 120)}{rule.description.length > 120 ? "…" : ""}</span>
                </div>
                <div className="flex items-center gap-2">
                  <Badge>{rule.categoryType}</Badge>
                  <Badge variant="secondary">{rule.rejectionType}</Badge>
                  {importStatus[rule.code] === "importing" && (
                    <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                  )}
                  {importStatus[rule.code] === "success" && (
                    <CheckCircle2 className="h-4 w-4 text-green-500" />
                  )}
                  {importStatus[rule.code] === "error" && (
                    <XCircle className="h-4 w-4 text-destructive" />
                  )}
                  {expandedRules.has(rule.code) ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                </div>
              </button>
              {expandedRules.has(rule.code) && (
                <CardContent className="border-t space-y-3 pt-4">
                  {/* Import action row */}
                  <div className="flex items-center gap-3">
                    <Button
                      size="sm"
                      variant={importStatus[rule.code] === "success" ? "outline" : "default"}
                      disabled={importStatus[rule.code] === "importing"}
                      onClick={(e) => { e.stopPropagation(); handleImport(rule); }}
                      className="gap-2"
                    >
                      {importStatus[rule.code] === "importing" ? (
                        <><Loader2 className="h-4 w-4 animate-spin" /> Importing…</>
                      ) : importStatus[rule.code] === "success" ? (
                        <><CheckCircle2 className="h-4 w-4 text-green-500" /> Imported</>
                      ) : importStatus[rule.code] === "error" ? (
                        <><XCircle className="h-4 w-4" /> Retry Import</>
                      ) : (
                        <><Upload className="h-4 w-4" /> Import Rule</>
                      )}
                    </Button>
                    {importStatus[rule.code] === "success" && importRefs[rule.code] && (
                      <span className="text-xs text-muted-foreground font-mono">ref: {importRefs[rule.code]}</span>
                    )}
                    {importStatus[rule.code] === "error" && (
                      <span className="text-xs text-destructive">{importErrors[rule.code]}</span>
                    )}
                  </div>
                  <div className="grid grid-cols-2 gap-4 text-sm">
                    <div>
                      <span className="text-muted-foreground">NHG:&nbsp;</span>
                      <span>{rule.nhgApplicableType}</span>
                    </div>
                    <div>
                      <span className="text-muted-foreground">Date Policy:&nbsp;</span>
                      <span>{rule.datePolicyType}</span>
                    </div>
                    <div>
                      <span className="text-muted-foreground">Start:&nbsp;</span>
                      <span>{rule.startDate}</span>
                    </div>
                    <div>
                      <span className="text-muted-foreground">End:&nbsp;</span>
                      <span>{rule.endDate ?? "—"}</span>
                    </div>
                  </div>
                  <div>
                    <p className="text-xs font-medium text-muted-foreground mb-1">Description</p>
                    <p className="text-sm">{rule.description}</p>
                  </div>
                  <div>
                    <p className="text-xs font-medium text-muted-foreground mb-1">Employee Explanation</p>
                    <p className="text-sm">{rule.employeeExplanation}</p>
                  </div>
                  {rule.customerExplanation && (
                    <div>
                      <p className="text-xs font-medium text-muted-foreground mb-1">Customer Explanation</p>
                      <p className="text-sm">{rule.customerExplanation}</p>
                    </div>
                  )}
                  {rule.arrangementTypes.length > 0 && (
                    <div>
                      <p className="text-xs font-medium text-muted-foreground mb-1">Arrangement Types</p>
                      <div className="flex flex-wrap gap-1">
                        {rule.arrangementTypes.map((t) => (
                          <Badge key={t} variant="outline" className="text-xs">{t}</Badge>
                        ))}
                      </div>
                    </div>
                  )}
                  {rule.jsonExpression && (
                    <div>
                      <p className="text-xs font-medium text-muted-foreground mb-1">JSON Expression</p>
                      <pre className="whitespace-pre-wrap text-xs font-mono bg-muted rounded-md p-3 overflow-auto max-h-[300px]">
                        {JSON.stringify(rule.jsonExpression, null, 2)}
                      </pre>
                    </div>
                  )}
                </CardContent>
              )}
            </Card>
          ))}

          {/* Load next batch */}
          {hasMore && (
            <div className="flex items-center justify-center pt-2">
              <Button
                onClick={handleNextBatch}
                disabled={isLoading}
                variant="outline"
                className="gap-2"
              >
                {isLoading ? (
                  <><Loader2 className="h-4 w-4 animate-spin" /> Generating…</>
                ) : (
                  <>
                    <Wand2 className="h-4 w-4" />
                    Generate next {batchSize} policies
                    {totalPolicies > 0 && (
                      <span className="text-muted-foreground ml-1">
                        ({Math.min(batchSize, totalPolicies - currentSkip)} remaining of {totalPolicies - currentSkip})
                      </span>
                    )}
                  </>
                )}
              </Button>
            </div>
          )}

          {!hasMore && totalPolicies > 0 && (
            <p className="text-center text-sm text-muted-foreground pt-2">
              All {totalPolicies} policies processed.
            </p>
          )}
        </div>
      )}
    </div>
  );
}
