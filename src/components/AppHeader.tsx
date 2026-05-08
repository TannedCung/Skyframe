"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useSession, signOut } from "next-auth/react";
import { useState } from "react";

export function AppHeader() {
  const { data: session } = useSession();
  const pathname = usePathname();
  const [signingOut, setSigningOut] = useState(false);

  const navLink = (href: string, label: string) => {
    const active = pathname === href || pathname.startsWith(href + "/");
    return (
      <Link
        href={href as "/dashboard" | "/settings"}
        className={`text-sm font-medium transition-colors ${
          active ? "text-indigo-600" : "text-gray-500 hover:text-gray-900"
        }`}
      >
        {label}
      </Link>
    );
  };

  return (
    <header className="bg-white border-b border-gray-200 sticky top-0 z-10">
      <div className="max-w-5xl mx-auto px-8 h-14 flex items-center justify-between">
        <div className="flex items-center gap-6">
          <Link href="/dashboard" className="font-bold text-indigo-600 text-lg tracking-tight">
            Skyframe
          </Link>
          <nav className="flex items-center gap-4">{navLink("/dashboard", "Dashboard")}</nav>
        </div>

        <div className="flex items-center gap-4">
          <span className="text-sm text-gray-500 hidden sm:block">
            {session?.user?.name ?? session?.user?.email}
          </span>
          {navLink("/settings", "Settings")}
          <button
            disabled={signingOut}
            onClick={async () => {
              setSigningOut(true);
              await signOut({ callbackUrl: "/login" });
            }}
            className="text-sm text-red-500 hover:text-red-600 font-medium disabled:opacity-50"
          >
            {signingOut ? "Signing out…" : "Sign out"}
          </button>
        </div>
      </div>
    </header>
  );
}
