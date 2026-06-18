"use client";
import Link from "next/link";
import { ShieldCheck } from "lucide-react";

export default function NavBar() {
  return (
    <header
      style={{
        background: "var(--color-surface-1)",
        borderBottom: "1px solid var(--color-border)",
      }}
    >
      <div className="max-w-5xl mx-auto px-6 h-14 flex items-center justify-between">
        <Link href="/" className="flex items-center gap-2 no-underline">
          <span
            style={{
              background: "linear-gradient(135deg, #22c55e, #14b8a6)",
              borderRadius: 8,
              padding: "4px 8px",
              fontSize: 13,
              fontWeight: 700,
              color: "#fff",
              letterSpacing: "0.05em",
              fontFamily: "var(--font-mono)",
            }}
          >
            PanoReady
          </span>
        </Link>

        <div
          className="flex items-center gap-2"
          style={{ color: "var(--color-text-muted)", fontSize: 12 }}
        >
          <ShieldCheck size={14} style={{ color: "var(--color-brand-400)" }} />
          All data processing happens locally.

        </div>
      </div>
    </header>
  );
}
