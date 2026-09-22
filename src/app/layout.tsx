import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { Toaster } from "@/components/ui/toaster";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Lengger Ledger Converter + OCR",
  description: "Konversi Info Lengger (.md/.csv/FB scraping) atau foto → Excel .xlsx. OCR client-side via Tesseract.js (gratis, privacy-friendly).",
  keywords: ["Lengger", "Wonosobo", "Budaya", "Excel", "Converter", "OCR", "Tesseract"],
  authors: [{ name: "Z.ai" }],
  icons: {
    icon: "https://z-cdn.chatglm.cn/z-ai/static/logo.svg",
  },
  openGraph: {
    title: "Lengger Ledger Converter + OCR",
    description: "Info Lengger .md/.csv/foto → Excel (.xlsx) dengan OCR",
    siteName: "Lengger Ledger",
    type: "website",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased bg-background text-foreground`}
      >
        {children}
        <Toaster />
      </body>
    </html>
  );
}
