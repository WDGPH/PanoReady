import type { Metadata } from "next";
import { Inter, DM_Mono, Patrick_Hand } from "next/font/google";
import "./globals.css";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-sans",
  display: "swap",
});

const patrickHand = Patrick_Hand({
  subsets: ["latin"],
  weight: "400",
  variable: "--font-title",
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
    <html lang="en" className={`h-full antialiased ${inter.variable} ${dmMono.variable} ${patrickHand.variable}`}>
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
