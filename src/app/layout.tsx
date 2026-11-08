import type { Metadata } from "next";
import { Inter, Cinzel, Geist_Mono } from "next/font/google";
import "./globals.css";
import { getSiteUrl } from "@/lib/site-url";

const inter = Inter({
  variable: "--font-sans",
  subsets: ["latin"],
});

const cinzel = Cinzel({
  variable: "--font-serif",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  // Absolute base for file-convention metadata (./opengraph-image.png) on
  // portal pages. getSiteUrl() always yields a valid origin -- it falls back to
  // Vercel's own URLs and finally localhost -- so this cannot throw at build.
  // The class page overrides it with the funnel's domain.
  metadataBase: new URL(getSiteUrl()),
  title: "AKPA University",
  description: "Staff training and management system for childcare centers.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${inter.variable} ${cinzel.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
