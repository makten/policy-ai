"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createPolicy, fetchPolicyDocuments, fetchCategories } from "@/lib/queries";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ArrowLeft, Save, AlertCircle, CheckCircle, Plus } from "lucide-react";

interface FormData {
  code: string;
  title: string;
  category: string;
  section: string;
  sourcePage: number;
  description: string;
  policyDocumentId: string;
}

const initialForm: FormData = {
  code: "",
  title: "",
  category: "",
  section: "",
  sourcePage: 0,
  description: "",
  policyDocumentId: "",
};

export default function NewPolicyPage() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [form, setForm] = useState<FormData>(initialForm);
  const [customCategory, setCustomCategory] = useState(false);
  const [errors, setErrors] = useState<Partial<Record<keyof FormData, string>>>({});

  const documentsQuery = useQuery({
    queryKey: ["policyDocuments"],
    queryFn: fetchPolicyDocuments,
  });

  const categoriesQuery = useQuery({
    queryKey: ["categories"],
    queryFn: fetchCategories,
  });

  const mutation = useMutation({
    mutationFn: () =>
      createPolicy({
        code: form.code.trim(),
        title: form.title.trim(),
        category: form.category.trim(),
        description: form.description.trim(),
        section: form.section.trim() || undefined,
        sourcePage: form.sourcePage || undefined,
        policyDocumentId: form.policyDocumentId || undefined,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["policies"] });
      queryClient.invalidateQueries({ queryKey: ["categories"] });
      router.push("/policies");
    },
  });

  const documents = documentsQuery.data ?? [];
  const categories = categoriesQuery.data ?? [];

  function validate(): boolean {
    const e: Partial<Record<keyof FormData, string>> = {};
    if (!form.code.trim()) e.code = "Policy code is required";
    if (!/^[A-Z0-9]+-[A-Z0-9]+-\d+$/i.test(form.code.trim()) && form.code.trim())
      e.code = "Use format like ENTITY-POL-001";
    if (!form.title.trim()) e.title = "Title is required";
    if (!form.category.trim()) e.category = "Category is required";
    if (!form.description.trim()) e.description = "Description is required";
    if (!form.policyDocumentId) e.policyDocumentId = "Policy document is required";
    setErrors(e);
    return Object.keys(e).length === 0;
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (validate()) mutation.mutate();
  }

  function updateField<K extends keyof FormData>(key: K, value: FormData[K]) {
    setForm((f) => ({ ...f, [key]: value }));
    if (errors[key]) setErrors((e) => ({ ...e, [key]: undefined }));
  }

  return (
    <div className="space-y-6 max-w-2xl">
      <Button
        variant="ghost"
        size="sm"
        onClick={() => router.push("/policies")}
      >
        <ArrowLeft className="h-4 w-4" /> Back to Policies
      </Button>

      <PageHeader
        title="Create New Policy"
        description="Define a new business validation rule for mortgage application evaluation"
      />

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Policy Document */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Policy Document</CardTitle>
            <CardDescription>
              Assign this policy to an existing policy document
            </CardDescription>
          </CardHeader>
          <CardContent>
            <FieldWrapper label="Policy Document *" error={errors.policyDocumentId}>
              <select
                value={form.policyDocumentId}
                onChange={(e) => updateField("policyDocumentId", e.target.value)}
                className={inputClass(errors.policyDocumentId)}
              >
                <option value="">Select a policy document...</option>
                {documents.map((doc) => (
                  <option key={doc.id} value={doc.id}>
                    {doc.entity || "Unknown"} — {doc.fileName} (v{doc.version}, {doc.policyCount} policies)
                  </option>
                ))}
              </select>
            </FieldWrapper>
          </CardContent>
        </Card>

        {/* Identity */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Policy Identity</CardTitle>
            <CardDescription>
              Code and title uniquely identify this policy
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <FieldWrapper
              label="Policy Code *"
              error={errors.code}
              hint="Unique identifier, e.g. ASN-POL-010 or MUNT-POL-045"
            >
              <input
                type="text"
                value={form.code}
                onChange={(e) => updateField("code", e.target.value.toUpperCase())}
                placeholder="ENTITY-POL-001"
                className={inputClass(errors.code)}
                maxLength={30}
              />
            </FieldWrapper>

            <FieldWrapper label="Title *" error={errors.title}>
              <input
                type="text"
                value={form.title}
                onChange={(e) => updateField("title", e.target.value)}
                placeholder="e.g. Maximale Schuld-Marktwaardeverhouding"
                className={inputClass(errors.title)}
              />
            </FieldWrapper>
          </CardContent>
        </Card>

        {/* Classification */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Classification</CardTitle>
            <CardDescription>
              Organize this policy by category and section
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <FieldWrapper label="Category *" error={errors.category}>
              {!customCategory ? (
                <div className="space-y-2">
                  <select
                    value={form.category}
                    onChange={(e) => updateField("category", e.target.value)}
                    className={inputClass(errors.category)}
                  >
                    <option value="">Select a category...</option>
                    {categories.map((c) => (
                      <option key={c} value={c}>
                        {c}
                      </option>
                    ))}
                  </select>
                  <button
                    type="button"
                    onClick={() => {
                      setCustomCategory(true);
                      updateField("category", "");
                    }}
                    className="text-xs text-primary hover:underline flex items-center gap-1"
                  >
                    <Plus className="h-3 w-3" /> Add new category
                  </button>
                </div>
              ) : (
                <div className="space-y-2">
                  <input
                    type="text"
                    value={form.category}
                    onChange={(e) => updateField("category", e.target.value)}
                    placeholder="Enter new category name"
                    className={inputClass(errors.category)}
                  />
                  <button
                    type="button"
                    onClick={() => {
                      setCustomCategory(false);
                      updateField("category", "");
                    }}
                    className="text-xs text-primary hover:underline"
                  >
                    Choose from existing categories
                  </button>
                </div>
              )}
            </FieldWrapper>

            <div className="grid grid-cols-2 gap-4">
              <FieldWrapper label="Section" hint="e.g. Artikel 4.2">
                <input
                  type="text"
                  value={form.section}
                  onChange={(e) => updateField("section", e.target.value)}
                  placeholder="Optional section reference"
                  className={inputClass()}
                />
              </FieldWrapper>

              <FieldWrapper label="Source Page" hint="Page number in source document">
                <input
                  type="number"
                  value={form.sourcePage || ""}
                  onChange={(e) =>
                    updateField("sourcePage", parseInt(e.target.value) || 0)
                  }
                  placeholder="0"
                  min={0}
                  className={inputClass()}
                />
              </FieldWrapper>
            </div>
          </CardContent>
        </Card>

        {/* Description */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Policy Description</CardTitle>
            <CardDescription>
              Describe the rule or requirement in detail. The AI evaluator uses
              this text to check mortgage applications.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <FieldWrapper label="Description *" error={errors.description}>
              <textarea
                value={form.description}
                onChange={(e) => updateField("description", e.target.value)}
                placeholder="Describe the policy requirement in full detail. Include specific thresholds, conditions, and exceptions that the AI should check for..."
                rows={6}
                className={inputClass(errors.description) + " resize-y min-h-[120px]"}
              />
            </FieldWrapper>
            <p className="mt-2 text-xs text-muted-foreground">
              {form.description.length} characters
              {form.description.length < 20 && form.description.length > 0 && (
                <span className="text-warning ml-2">
                  — Consider adding more detail for better AI evaluation
                </span>
              )}
            </p>
          </CardContent>
        </Card>

        {/* Preview */}
        {form.code && form.title && (
          <Card className="border-primary/20 bg-primary/5">
            <CardHeader>
              <CardTitle className="text-base text-primary">Preview</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-center gap-2 mb-2">
                <Badge variant="outline" className="font-mono text-xs">
                  {form.code || "CODE"}
                </Badge>
                <span className="text-sm font-semibold">
                  {form.title || "Policy Title"}
                </span>
              </div>
              {form.category && (
                <Badge variant="secondary" className="mb-2">
                  {form.category}
                </Badge>
              )}
              {form.description && (
                <p className="text-sm text-foreground/70 mt-1">
                  {form.description.length > 200
                    ? form.description.substring(0, 200) + "..."
                    : form.description}
                </p>
              )}
            </CardContent>
          </Card>
        )}

        {/* Actions */}
        <div className="flex items-center gap-3">
          <Button type="submit" disabled={mutation.isPending} className="flex-1">
            {mutation.isPending ? (
              "Creating..."
            ) : (
              <>
                <Save className="h-4 w-4" /> Create Policy
              </>
            )}
          </Button>
          <Button
            type="button"
            variant="outline"
            onClick={() => router.push("/policies")}
          >
            Cancel
          </Button>
        </div>

        {/* Error */}
        {mutation.isError && (
          <div className="flex items-center gap-2 rounded-lg border border-destructive/30 bg-destructive/5 p-4">
            <AlertCircle className="h-5 w-5 text-destructive shrink-0" />
            <p className="text-sm text-destructive">
              {(mutation.error as Error).message}
            </p>
          </div>
        )}

        {/* Success */}
        {mutation.isSuccess && (
          <div className="flex items-center gap-2 rounded-lg border border-success/30 bg-success/5 p-4">
            <CheckCircle className="h-5 w-5 text-success shrink-0" />
            <p className="text-sm text-success">
              Policy created successfully! Redirecting...
            </p>
          </div>
        )}
      </form>
    </div>
  );
}

/* ── Reusable form helpers ── */

function FieldWrapper({
  label,
  error,
  hint,
  children,
}: {
  label: string;
  error?: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label className="block text-sm font-medium text-foreground mb-1">
        {label}
      </label>
      {children}
      {hint && !error && (
        <p className="mt-1 text-xs text-muted-foreground">{hint}</p>
      )}
      {error && (
        <p className="mt-1 text-xs text-destructive flex items-center gap-1">
          <AlertCircle className="h-3 w-3" /> {error}
        </p>
      )}
    </div>
  );
}

function inputClass(error?: string) {
  return `h-10 w-full rounded-lg border ${
    error ? "border-destructive" : "border-border"
  } bg-card px-3 text-sm outline-none focus:ring-2 ${
    error ? "focus:ring-destructive/50" : "focus:ring-ring"
  } transition-colors`;
}
