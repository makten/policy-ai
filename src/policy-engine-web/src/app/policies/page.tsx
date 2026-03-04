"use client";

import { useState, useCallback } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  fetchPolicies,
  fetchCategories,
  fetchPolicyDocuments,
  importPolicies,
  deletePolicy,
} from "@/lib/queries";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { FileDropzone } from "@/components/ui/file-dropzone";
import { LoadingSpinner } from "@/components/ui/loading-spinner";
import {
  Search,
  Upload,
  Trash2,
  ChevronDown,
  ChevronRight,
  X,
  Plus,
} from "lucide-react";
import Link from "next/link";
import type { PolicyDto, ImportResultDto } from "@/types";

export default function PoliciesPage() {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("");
  const [entityFilter, setEntityFilter] = useState("");
  const [showImport, setShowImport] = useState(false);
  const [importResult, setImportResult] = useState<ImportResultDto | null>(null);

  const policiesQuery = useQuery({
    queryKey: ["policies", { search, category: categoryFilter, entity: entityFilter }],
    queryFn: () =>
      fetchPolicies({
        search: search || undefined,
        category: categoryFilter || undefined,
        entity: entityFilter || undefined,
      }),
  });

  const categoriesQuery = useQuery({
    queryKey: ["categories"],
    queryFn: fetchCategories,
  });

  const documentsQuery = useQuery({
    queryKey: ["policyDocuments"],
    queryFn: fetchPolicyDocuments,
  });

  const importMutation = useMutation({
    mutationFn: importPolicies,
    onSuccess: (result) => {
      setImportResult(result);
      queryClient.invalidateQueries({ queryKey: ["policies"] });
      queryClient.invalidateQueries({ queryKey: ["policyDocuments"] });
      queryClient.invalidateQueries({ queryKey: ["categories"] });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: deletePolicy,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["policies"] });
    },
  });

  const handleImport = useCallback(
    (file: File) => {
      setImportResult(null);
      importMutation.mutate(file);
    },
    [importMutation]
  );

  const policies = policiesQuery.data ?? [];
  const categories = categoriesQuery.data ?? [];
  const entities = [
    ...new Set((documentsQuery.data ?? []).map((d) => d.entity).filter(Boolean)),
  ].sort();

  // Group by category
  const grouped = policies.reduce<Record<string, PolicyDto[]>>((acc, p) => {
    const key = p.category || "Uncategorized";
    (acc[key] = acc[key] || []).push(p);
    return acc;
  }, {});

  return (
    <div className="space-y-6">
      <PageHeader title="Policies" description="Manage business validation rules">
        <Link href="/policies/new">
          <Button>
            <Plus className="h-4 w-4" />
            New Policy
          </Button>
        </Link>
        <Button variant="outline" onClick={() => setShowImport(!showImport)}>
          <Upload className="h-4 w-4" />
          Import
        </Button>
      </PageHeader>

      {/* Import Panel */}
      {showImport && (
        <Card>
          <CardContent className="pt-6">
            <FileDropzone
              onFileSelect={handleImport}
              label="Drop a policy JSON file"
              description="Import policies from a GoodPolicy.json-format file"
              disabled={importMutation.isPending}
            />
            {importMutation.isPending && (
              <LoadingSpinner label="Importing policies..." className="py-4" />
            )}
            {importResult && (
              <div className="mt-4 rounded-lg border border-success/30 bg-success/5 p-4">
                <p className="text-sm font-medium text-success">
                  Imported {importResult.documentsImported} document(s) with{" "}
                  {importResult.policiesImported} policies
                </p>
                {importResult.warnings.length > 0 && (
                  <ul className="mt-2 list-disc pl-5 text-xs text-muted-foreground">
                    {importResult.warnings.map((w, i) => (
                      <li key={i}>{w}</li>
                    ))}
                  </ul>
                )}
              </div>
            )}
            {importMutation.isError && (
              <p className="mt-4 text-sm text-destructive">
                Import failed: {(importMutation.error as Error).message}
              </p>
            )}
          </CardContent>
        </Card>
      )}

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[200px] max-w-sm">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <input
            type="text"
            placeholder="Search policies..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="h-10 w-full rounded-lg border border-border bg-card pl-9 pr-3 text-sm outline-none focus:ring-2 focus:ring-ring"
          />
        </div>

        <select
          value={categoryFilter}
          onChange={(e) => setCategoryFilter(e.target.value)}
          className="h-10 rounded-lg border border-border bg-card px-3 text-sm outline-none focus:ring-2 focus:ring-ring"
        >
          <option value="">All Categories</option>
          {categories.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>

        <select
          value={entityFilter}
          onChange={(e) => setEntityFilter(e.target.value)}
          className="h-10 rounded-lg border border-border bg-card px-3 text-sm outline-none focus:ring-2 focus:ring-ring"
        >
          <option value="">All Entities</option>
          {entities.map((e) => (
            <option key={e} value={e}>
              {e}
            </option>
          ))}
        </select>

        {(search || categoryFilter || entityFilter) && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              setSearch("");
              setCategoryFilter("");
              setEntityFilter("");
            }}
          >
            <X className="h-4 w-4" /> Clear
          </Button>
        )}
      </div>

      {/* Policy count */}
      <p className="text-sm text-muted-foreground">
        {policies.length} {policies.length === 1 ? "policy" : "policies"} found
      </p>

      {/* Policy List by Category */}
      {policiesQuery.isLoading ? (
        <LoadingSpinner />
      ) : Object.keys(grouped).length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-sm text-muted-foreground">
            No policies found. Import a policy document to get started.
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {Object.entries(grouped)
            .sort(([a], [b]) => a.localeCompare(b))
            .map(([category, items]) => (
              <CategoryGroup
                key={category}
                category={category}
                policies={items}
                onDelete={(id) => deleteMutation.mutate(id)}
              />
            ))}
        </div>
      )}
    </div>
  );
}

function CategoryGroup({
  category,
  policies,
  onDelete,
}: {
  category: string;
  policies: PolicyDto[];
  onDelete: (id: string) => void;
}) {
  const [expanded, setExpanded] = useState(true);

  return (
    <Card>
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex w-full items-center justify-between p-4 text-left hover:bg-secondary/50 transition-colors rounded-t-xl"
      >
        <div className="flex items-center gap-2">
          {expanded ? (
            <ChevronDown className="h-4 w-4" />
          ) : (
            <ChevronRight className="h-4 w-4" />
          )}
          <span className="text-sm font-semibold">{category}</span>
          <Badge variant="secondary">{policies.length}</Badge>
        </div>
      </button>
      {expanded && (
        <div className="divide-y divide-border border-t border-border">
          {policies.map((policy) => (
            <div
              key={policy.id}
              className="flex items-center justify-between px-4 py-3 hover:bg-secondary/30 transition-colors"
            >
              <Link
                href={`/policies/${policy.id}`}
                className="flex-1 min-w-0"
              >
                <div className="flex items-center gap-2">
                  <Badge variant="outline" className="shrink-0 font-mono text-xs">
                    {policy.code}
                  </Badge>
                  <span className="text-sm font-medium truncate">
                    {policy.title}
                  </span>
                </div>
                <p className="mt-0.5 text-xs text-muted-foreground truncate">
                  {policy.description}
                </p>
              </Link>
              <div className="flex items-center gap-2 ml-4 shrink-0">
                <Badge variant="secondary" className="text-xs">
                  {policy.entity || "Unknown"}
                </Badge>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 text-muted-foreground hover:text-destructive"
                  onClick={(e) => {
                    e.preventDefault();
                    if (confirm(`Delete policy "${policy.code}"?`))
                      onDelete(policy.id);
                  }}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}
