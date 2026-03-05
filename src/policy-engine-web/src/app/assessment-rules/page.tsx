"use client";

import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { fetchAssessmentBusinessRules } from "@/lib/queries";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { LoadingSpinner } from "@/components/ui/loading-spinner";
import { Search, ChevronDown, ChevronRight, X } from "lucide-react";
import type { AssessmentBusinessRule } from "@/types";

type ActiveFilter = "all" | "active" | "inactive";

export default function AssessmentRulesPage() {
  const [search, setSearch] = useState("");
  const [activeFilter, setActiveFilter] = useState<ActiveFilter>("all");
  const [selectedRule, setSelectedRule] = useState<AssessmentBusinessRule | null>(null);

  const { data, isLoading, isError, error } = useQuery({
    queryKey: ["assessment-business-rules", activeFilter],
    queryFn: () =>
      fetchAssessmentBusinessRules(
        activeFilter === "all" ? undefined : activeFilter === "active"
      ),
  });

  const filteredRules = useMemo(() => {
    const allRules = data?.businessRuleCollection ?? [];
    const term = search.trim().toLowerCase();
    if (!term) return allRules;

    return allRules.filter((rule) => {
      const searchable = [
        rule.code,
        rule.description,
        rule.categoryType,
        rule.rejectionType,
        ...rule.parameters,
      ]
        .join(" ")
        .toLowerCase();

      return searchable.includes(term);
    });
  }, [data?.businessRuleCollection, search]);

  const categories = useMemo(
    () => Array.from(new Set(filteredRules.map((r) => r.categoryType))).sort(),
    [filteredRules]
  );

  return (
    <div className="space-y-6">
      <PageHeader
        title="Assessly Rules"
        description="Overview of configured rules in Assessly — click a rule to view details"
      />

      <div className="flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[240px] max-w-md">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <input
            type="text"
            placeholder="Search by code, description, category, rejection type..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="h-10 w-full rounded-lg border border-border bg-card pl-9 pr-3 text-sm outline-none focus:ring-2 focus:ring-ring"
          />
        </div>

        <select
          value={activeFilter}
          onChange={(e) => setActiveFilter(e.target.value as ActiveFilter)}
          className="h-10 rounded-lg border border-border bg-card px-3 text-sm outline-none focus:ring-2 focus:ring-ring"
        >
          <option value="all">All rules</option>
          <option value="active">Active only</option>
          <option value="inactive">Inactive only</option>
        </select>
      </div>

      {isLoading ? (
        <LoadingSpinner label="Loading configured business rules..." />
      ) : isError ? (
        <Card>
          <CardContent className="py-8 text-sm text-destructive">
            Failed to load rules: {(error as Error).message}
          </CardContent>
        </Card>
      ) : filteredRules.length === 0 ? (
        <Card>
          <CardContent className="py-10 text-center text-sm text-muted-foreground">
            No configured business rules found for the current filter.
          </CardContent>
        </Card>
      ) : (
        <>
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="secondary">{filteredRules.length} rule(s)</Badge>
            {categories.map((category) => (
              <Badge key={category} variant="outline" className="text-xs">
                {category}
              </Badge>
            ))}
          </div>

          <Card className="w-full">
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-secondary/40 text-left">
                    <tr className="border-b border-border">
                      <th className="px-4 py-3 font-medium">Code</th>
                      <th className="px-4 py-3 font-medium">Description</th>
                      <th className="px-4 py-3 font-medium">Category</th>
                      <th className="px-4 py-3 font-medium">Rejection</th>
                      <th className="px-4 py-3 font-medium">NHG</th>
                      <th className="px-4 py-3 font-medium">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredRules.map((rule) => (
                      <RuleRow
                        key={`${rule.code}-${rule.startDate}`}
                        rule={rule}
                        onSelect={() => setSelectedRule(rule)}
                      />
                    ))}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>

          {/* ── Detail modal ── */}
          {selectedRule && (
            <RuleDetailModal rule={selectedRule} onClose={() => setSelectedRule(null)} />
          )}
        </>
      )}
    </div>
  );
}

/* ── Table row ── */

function RuleRow({
  rule,
  onSelect,
}: {
  rule: AssessmentBusinessRule;
  onSelect: () => void;
}) {
  return (
    <tr
      onClick={onSelect}
      className="border-b border-border/70 last:border-b-0 cursor-pointer hover:bg-secondary/20 transition-colors"
    >
      <td className="px-4 py-3 align-top">
        <Badge variant="outline" className="font-mono text-xs">
          {rule.code}
        </Badge>
      </td>
      <td className="px-4 py-3 align-top">
        <div className="max-w-[540px]">
          <p className="font-medium">{rule.description}</p>
          {rule.parameters.length > 0 && (
            <p className="mt-1 text-xs text-muted-foreground line-clamp-1">
              Parameters: {rule.parameters.join(", ")}
            </p>
          )}
        </div>
      </td>
      <td className="px-4 py-3 align-top">{rule.categoryType}</td>
      <td className="px-4 py-3 align-top">{rule.rejectionType}</td>
      <td className="px-4 py-3 align-top">{rule.nhgApplicableType}</td>
      <td className="px-4 py-3 align-top">
        <Badge variant={rule.isActive ? "default" : "secondary"}>
          {rule.isActive ? "Active" : "Inactive"}
        </Badge>
      </td>
    </tr>
  );
}

/* ── Detail modal ── */

function RuleDetailModal({
  rule,
  onClose,
}: {
  rule: AssessmentBusinessRule;
  onClose: () => void;
}) {
  const [exprExpanded, setExprExpanded] = useState(false);

  const parsedExpression = useMemo(() => {
    if (!rule.jsonExpression) return null;
    try {
      return JSON.parse(rule.jsonExpression);
    } catch {
      return null;
    }
  }, [rule.jsonExpression]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="relative bg-card border border-border rounded-xl shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col">
      <CardContent className="p-5 space-y-5 overflow-y-auto">
        {/* Header */}
        <div className="flex items-start justify-between gap-2">
          <div>
            <div className="flex items-center gap-2">
              <Badge variant="outline" className="font-mono text-xs">
                {rule.code}
              </Badge>
              <Badge variant={rule.isActive ? "default" : "secondary"}>
                {rule.isActive ? "Active" : "Inactive"}
              </Badge>
            </div>
            <p className="mt-2 text-sm font-medium">{rule.description}</p>
          </div>
          <button
            onClick={onClose}
            className="rounded-md p-1 hover:bg-secondary transition-colors shrink-0"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Metadata grid */}
        <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
          <DetailField label="Category" value={rule.categoryType} />
          <DetailField label="Rejection type" value={rule.rejectionType} />
          <DetailField label="NHG" value={rule.nhgApplicableType} />
          <DetailField label="Date policy" value={rule.datePolicyType} />
          <DetailField label="Start" value={formatDate(rule.startDate)} />
          <DetailField label="End" value={rule.endDate ? formatDate(rule.endDate) : "—"} />
        </div>

        {/* Employee explanation */}
        {rule.employeeExplanation && (
          <div>
            <p className="text-xs font-semibold text-muted-foreground mb-1">Employee explanation</p>
            <p className="text-sm bg-secondary/30 rounded-md p-3">{rule.employeeExplanation}</p>
          </div>
        )}

        {/* Customer explanation */}
        {rule.customerExplanation && (
          <div>
            <p className="text-xs font-semibold text-muted-foreground mb-1">Customer explanation</p>
            <p className="text-sm bg-secondary/30 rounded-md p-3">{rule.customerExplanation}</p>
          </div>
        )}

        {/* Arrangement types */}
        {rule.arrangementTypes.length > 0 && (
          <div>
            <p className="text-xs font-semibold text-muted-foreground mb-1">Arrangement types</p>
            <div className="flex flex-wrap gap-1">
              {rule.arrangementTypes.map((a) => (
                <Badge key={a} variant="outline" className="text-xs">{a}</Badge>
              ))}
            </div>
          </div>
        )}

        {/* Product lines */}
        {rule.productLines.length > 0 && (
          <div>
            <p className="text-xs font-semibold text-muted-foreground mb-1">Product lines</p>
            <div className="flex flex-wrap gap-1">
              {rule.productLines.map((p) => (
                <Badge key={p} variant="outline" className="text-xs">{p}</Badge>
              ))}
            </div>
          </div>
        )}

        {/* Decision groups */}
        {rule.decisionGroups.length > 0 && (
          <div>
            <p className="text-xs font-semibold text-muted-foreground mb-1">Decision groups</p>
            <div className="flex flex-wrap gap-1">
              {rule.decisionGroups.map((d) => (
                <Badge key={d} variant="outline" className="text-xs">{d}</Badge>
              ))}
            </div>
          </div>
        )}

        {/* Parameters */}
        {rule.parameters.length > 0 && (
          <div>
            <p className="text-xs font-semibold text-muted-foreground mb-1">Parameters</p>
            <div className="flex flex-wrap gap-1">
              {rule.parameters.map((p) => (
                <Badge key={p} variant="secondary" className="text-xs font-mono">{p}</Badge>
              ))}
            </div>
          </div>
        )}

        {/* Characteristics */}
        {rule.characteristics.length > 0 && (
          <div>
            <p className="text-xs font-semibold text-muted-foreground mb-1">Characteristics</p>
            <div className="flex flex-wrap gap-1">
              {rule.characteristics.map((c) => (
                <Badge key={c} variant="secondary" className="text-xs font-mono">{c}</Badge>
              ))}
            </div>
          </div>
        )}

        {/* Logical expression */}
        {rule.logicalExpression && (
          <div>
            <p className="text-xs font-semibold text-muted-foreground mb-1">Logical expression</p>
            <pre className="text-xs bg-secondary/30 rounded-md p-3 overflow-x-auto whitespace-pre-wrap break-words">
              {rule.logicalExpression}
            </pre>
          </div>
        )}

        {/* JSON Expression */}
        {parsedExpression && (
          <div>
            <button
              onClick={() => setExprExpanded(!exprExpanded)}
              className="flex items-center gap-1 text-xs font-semibold text-muted-foreground hover:text-foreground transition-colors"
            >
              {exprExpanded ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
              JSON expression
            </button>
            {exprExpanded && (
              <pre className="mt-1 text-xs bg-secondary/30 rounded-md p-3 overflow-x-auto max-h-80 whitespace-pre-wrap break-words">
                {JSON.stringify(parsedExpression, null, 2)}
              </pre>
            )}
          </div>
        )}
      </CardContent>
      </div>
    </div>
  );
}

/* ── Helpers ── */

function DetailField({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="font-medium">{value}</p>
    </div>
  );
}

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString("nl-NL", {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  } catch {
    return iso;
  }
}
