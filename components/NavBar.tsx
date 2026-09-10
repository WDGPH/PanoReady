"use client";
import Link from "next/link";

export default function NavBar({ showPrivacy = true }: { showPrivacy?: boolean }) {
  return (
    <header className="topbar">
      <div className="topbar-inner">
        <Link href="./" className="brand no-underline">
          PanoReady
        </Link>
        <nav aria-label="Primary navigation" style={{ display: "flex", alignItems: "center", gap: 16, marginLeft: "auto" }}>
          <a href="https://wdgph.github.io/PanoReady/docs/" className="no-underline" style={{ color: "var(--color-text-secondary)", fontSize: 12, whiteSpace: "nowrap" }}>
            Docs
          </a>
          <Link href="./about" className="no-underline" style={{ color: "var(--color-text-secondary)", fontSize: 12, whiteSpace: "nowrap" }}>
            About
          </Link>
        </nav>
        {showPrivacy && <span className="privacy">Files stay in this browser</span>}
      </div>
    </header>
  );
}
