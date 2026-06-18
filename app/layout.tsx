import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "PanoReady | School Enrollment Data Cleaner",
  description:
    "Clean, validate, and export STIX XML school enrollment files. All processing happens in your browser — data never leaves your device.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="h-full antialiased">
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
