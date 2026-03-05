"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import {
  LayoutDashboard,
  FileText,
  ShieldCheck,
  Upload,
  PlusCircle,
  FolderUp,
  ListChecks,
  Wand2,
  Activity,
} from "lucide-react";

const navItems = [
  { href: "/", label: "Dashboard", icon: LayoutDashboard },
  { href: "/policies", label: "Policies", icon: FileText },
  { href: "/assessment-rules", label: "Assessly Rules", icon: ListChecks },
  { href: "/policies/new", label: "New Policy", icon: PlusCircle },
  { href: "/policies/upload", label: "Upload Policies", icon: FolderUp },
  // { href: "/rag", label: "RAG Pipeline", icon: Workflow },
  { href: "/evaluate", label: "Evaluate", icon: Upload },
  { href: "/evaluations", label: "Results", icon: ShieldCheck },
  { href: "/business-rules", label: "Generate Business Rules", icon: Wand2 },
  { href: "/assessment", label: "Perform Assessment", icon: Activity },
];

function isPathMatch(pathname: string, href: string): boolean {
  if (href === "/")
    return pathname === "/";

  return pathname === href || pathname.startsWith(`${href}/`);
}

export function Sidebar() {
  const pathname = usePathname();
  const activeHref =
    navItems
      .filter((item) => isPathMatch(pathname, item.href))
      .sort((a, b) => b.href.length - a.href.length)[0]?.href ?? "";

  return (
    <aside className="fixed inset-y-0 left-0 z-30 flex w-60 flex-col bg-sidebar-bg text-sidebar-fg">
      {/* Logo */}
      <div className="flex h-16 items-center gap-2 px-5 border-b border-white/10">
        <ShieldCheck className="h-7 w-7 text-white" />
        <span className="text-base font-bold tracking-tight">Assessly</span>
      </div>

      {/* Navigation */}
      <nav className="flex-1 space-y-1 px-3 py-4">
        {navItems.map((item) => {
          const isActive = (() => {
            if (item.href === "/") return pathname === "/";
            if (pathname === item.href) return true;
            if (!pathname.startsWith(item.href + "/")) return false;
            // Don't highlight this item if a more-specific sibling nav item owns this path
            return !navItems.some(
              (other) =>
                other.href !== item.href &&
                (pathname === other.href || pathname.startsWith(other.href + "/"))
            );
          })();
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors",
                isActive
                  ? "bg-sidebar-active text-white"
                  : "text-sidebar-fg/70 hover:bg-sidebar-hover hover:text-sidebar-fg"
              )}
            >
              <item.icon className="h-4 w-4" />
              {item.label}
            </Link>
          );
        })}
      </nav>

      {/* Footer */}
      <div className="border-t border-white/10 px-5 py-4">
        <p className="text-xs text-sidebar-fg/40">
          AI Policy Validation Engine
        </p>
      </div>
    </aside>
  );
}
