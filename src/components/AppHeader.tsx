"use client";

import Link from "next/link";
import type { Route } from "next";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { Fragment } from "react";
import { Logo } from "./Logo";

export interface Crumb {
  label: string;
  href?: string;
}

interface AppHeaderProps {
  crumbs?: Crumb[];
}

export function AppHeader({ crumbs = [] }: AppHeaderProps) {
  const { data: session } = useSession();
  const router = useRouter();
  const name = session?.user?.name ?? session?.user?.email ?? "?";
  const initials = name
    .split(" ")
    .map((s: string) => s[0] ?? "")
    .slice(0, 2)
    .join("")
    .toUpperCase();

  return (
    <header
      className="sticky top-0 z-30 border-b"
      style={{
        background: "rgba(255, 246, 222, 0.85)",
        borderColor: "#EFE4C8",
        backdropFilter: "saturate(180%) blur(12px)",
        WebkitBackdropFilter: "saturate(180%) blur(12px)",
      }}
    >
      <div className="max-w-5xl mx-auto px-7 py-3 flex items-center gap-4">
        <button
          onClick={() => router.push("/dashboard")}
          className="shrink-0 flex items-center gap-2 hover:opacity-80 transition-opacity"
        >
          <Logo size={20} />
        </button>

        {crumbs.length > 0 && (
          <nav className="flex items-center gap-2 min-w-0 flex-1" aria-label="Breadcrumb">
            <span className="text-ink-400 text-sm">/</span>
            {crumbs.map((crumb, i) => {
              const isLast = i === crumbs.length - 1;
              return (
                <Fragment key={i}>
                  {crumb.href && !isLast ? (
                    <Link
                      href={crumb.href as Route}
                      className="text-sm font-medium text-ink-500 hover:text-ink-900 transition-colors truncate"
                    >
                      {crumb.label}
                    </Link>
                  ) : (
                    <span
                      className={`text-sm truncate ${isLast ? "font-semibold text-ink-900" : "text-ink-500"}`}
                    >
                      {crumb.label}
                    </span>
                  )}
                  {!isLast && <span className="text-ink-400 text-sm">/</span>}
                </Fragment>
              );
            })}
          </nav>
        )}
        {crumbs.length === 0 && <div className="flex-1" />}

        <div className="flex items-center gap-2 shrink-0">
          <Link
            href="/settings"
            aria-label="Settings"
            className="w-9 h-9 rounded-full hover:bg-cream-200 transition-colors flex items-center justify-center text-ink-800"
          >
            <svg
              width="18"
              height="18"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" />
              <path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" />
            </svg>
          </Link>
          <Link
            href="/settings"
            className="flex items-center gap-2 pl-1 pr-3 py-1 rounded-full hover:bg-cream-200 transition-colors"
          >
            <span className="w-7 h-7 rounded-full bg-coral-500 text-ink-900 text-xs font-bold flex items-center justify-center shrink-0">
              {initials}
            </span>
            <span className="hidden sm:inline text-sm font-medium text-ink-900">
              {name.split(" ")[0]}
            </span>
          </Link>
        </div>
      </div>
    </header>
  );
}
