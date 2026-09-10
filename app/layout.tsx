import type { Metadata } from "next";
import { Inter, Playfair_Display, DM_Mono } from "next/font/google";
import "./globals.css";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-sans",
  display: "swap",
});

const playfair = Playfair_Display({
  subsets: ["latin"],
  variable: "--font-serif",
  display: "swap",
});

const dmMono = DM_Mono({
  subsets: ["latin"],
  weight: ["300", "400", "500"],
  variable: "--font-mono",
  display: "swap",
});

export const metadata: Metadata = {
  title: "PanoReady | Panorama Import Toolbox",
  description:
    "Tools for preparing data for Panorama. Validate school-enrolment files, review automatic corrections, and compare changes in your browser.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={`h-full antialiased ${inter.variable} ${playfair.variable} ${dmMono.variable}`}>
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
