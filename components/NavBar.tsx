"use client";
import Link from "next/link";

export default function NavBar() {
  return (
    <header className="topbar">
      <div className="topbar-inner">
        <div className="brand-lockup">
          <Link href="./" className="brand no-underline">
            PanoReady
          </Link>
          <span className="brand-tagline">Tools for faster, more reliable Panorama imports</span>
        </div>
        <nav aria-label="Primary navigation" style={{ display: "flex", alignItems: "center", gap: 16, marginLeft: "auto" }}>
          <a href="https://wdgph.github.io/PanoReady/docs/" className="no-underline" style={{ fontSize: 12, whiteSpace: "nowrap" }}>
            Docs
          </a>
        </nav>
      </div>
    </header>
  );
}
