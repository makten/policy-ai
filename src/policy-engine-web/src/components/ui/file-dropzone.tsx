"use client";

import { useCallback, useState } from "react";
import { Upload, FileJson } from "lucide-react";
import { cn } from "@/lib/utils";

interface FileDropzoneProps {
  onFileSelect: (file: File) => void;
  accept?: string;
  label?: string;
  description?: string;
  className?: string;
  disabled?: boolean;
}

export function FileDropzone({
  onFileSelect,
  accept = ".json",
  label = "Drop your JSON file here",
  description = "or click to browse",
  className,
  disabled = false,
}: FileDropzoneProps) {
  const [isDragOver, setIsDragOver] = useState(false);
  const [fileName, setFileName] = useState<string | null>(null);

  const handleDragOver = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      if (!disabled) setIsDragOver(true);
    },
    [disabled]
  );

  const handleDragLeave = useCallback(() => {
    setIsDragOver(false);
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setIsDragOver(false);
      if (disabled) return;
      const file = e.dataTransfer.files[0];
      if (file) {
        setFileName(file.name);
        onFileSelect(file);
      }
    },
    [disabled, onFileSelect]
  );

  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (file) {
        setFileName(file.name);
        onFileSelect(file);
      }
    },
    [onFileSelect]
  );

  return (
    <label
      className={cn(
        "flex flex-col items-center justify-center gap-3 rounded-xl border-2 border-dashed p-10 transition-colors cursor-pointer",
        isDragOver
          ? "border-primary bg-primary/5"
          : "border-border hover:border-primary/50",
        disabled && "pointer-events-none opacity-50",
        className
      )}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      <input
        type="file"
        accept={accept}
        className="hidden"
        onChange={handleChange}
        disabled={disabled}
      />
      {fileName ? (
        <>
          <FileJson className="h-10 w-10 text-primary" />
          <span className="text-sm font-medium text-foreground">{fileName}</span>
          <span className="text-xs text-muted-foreground">Click or drop to replace</span>
        </>
      ) : (
        <>
          <Upload className="h-10 w-10 text-muted-foreground" />
          <div className="text-center">
            <p className="text-sm font-medium text-foreground">{label}</p>
            <p className="text-xs text-muted-foreground">{description}</p>
          </div>
        </>
      )}
    </label>
  );
}
