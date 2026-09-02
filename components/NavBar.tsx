"use client";
import Link from "next/link";

export default function NavBar() {
  return (
    <header className="topbar">
      <div className="topbar-inner">
        <Link href="./" className="brand no-underline">
          PanoReady
        </Link>
        <nav aria-label="Primary navigation" style={{ display: "flex", alignItems: "center", gap: 16, marginLeft: "auto" }}>
          <Link href="./about" className="no-underline" style={{ color: "var(--color-text-secondary)", fontSize: 12, whiteSpace: "nowrap" }}>
            About
          </Link>
        </nav>
        <span className="privacy">Files stay in this browser</span>
      </div>
    </header>
  );
}
