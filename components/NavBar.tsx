"use client";
import Link from "next/link";

export default function NavBar() {
  return (
    <header className="topbar">
      <div className="topbar-inner">
        <Link href="/" className="brand no-underline">
          PanoReady
        </Link>
        <span className="privacy">Data never leaves your browser</span>
      </div>
    </header>
  );
}
