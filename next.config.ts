import type { NextConfig } from "next";

// output: "export" → static build for GitHub Pages / Cloudflare Pages (free, no server)
// The web UI is client-side only: parser runs in browser, OCR via Tesseract.js CDN.
// No API routes, no SSR, no server — perfect for static hosting.
const nextConfig: NextConfig = {
  output: "export",
  // Disable image optimization (static export can't run the optimizer server-side).
  images: {
    unoptimized: true,
  },
  // basePath: for GitHub Pages project site (e.g. /Parse-INFO-LENGGER)
  // Set via env var NEXT_PUBLIC_BASE_PATH at build time.
  // Cloudflare Pages: leave empty (root domain, no basePath).
  basePath: process.env.NEXT_PUBLIC_BASE_PATH || "",
  typescript: {
    ignoreBuildErrors: true,
  },
  reactStrictMode: false,
};

export default nextConfig;
