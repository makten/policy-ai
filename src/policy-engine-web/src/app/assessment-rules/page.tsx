"use client";

import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { fetchAssessmentBusinessRules } from "@/lib/queries";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { LoadingSpinner } from "@/components/ui/loading-spinner";
import { Search } from "lucide-react";
import type { AssessmentBusinessRule } from "@/types";

type ActiveFilter = "all" | "active" | "inactive";

export default function AssessmentRulesPage() {
  const [search, setSearch] = useState("");
  const [activeFilter, setActiveFilter] = useState<ActiveFilter>("all");

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
        description="Overview of configured rules in Assessly"
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

          <Card>
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
                      <RuleRow key={`${rule.code}-${rule.startDate}`} rule={rule} />
                    ))}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}

function RuleRow({ rule }: { rule: AssessmentBusinessRule }) {
  return (
    <tr className="border-b border-border/70 last:border-b-0 hover:bg-secondary/20 transition-colors">
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
