import type { NextConfig } from "next";

/**
 * Lengger Ledger Converter — Next.js config.
 *
 * This app is 100% client-side: parsing & xlsx generation run in the browser.
 * No server, no API routes, no database.
 *
 * `output: "export"` produces a static site (`out/`) deployable to GitHub Pages,
 * Netlify, or any static host. It is ignored during `next dev`, so local
 * development works normally.
 *
 * For GitHub Pages project sites, set NEXT_PUBLIC_BASE_PATH=/repo-name.
 */
const basePath = process.env.NEXT_PUBLIC_BASE_PATH || "";

const nextConfig: NextConfig = {
  // Static export → pure HTML/JS/CSS in `out/`, no Node.js server needed.
  output: "export",

  // Required for static export — Next.js Image Optimization needs a server.
  images: {
    unoptimized: true,
  },

  // Base path for GitHub Pages project sites (e.g. "/lengger-ledger-converter").
  // Leave empty for root deployment (Vercel, Netlify, user GitHub Pages).
  ...(basePath ? { basePath, assetPrefix: basePath } : {}),

  // Ignore TypeScript errors during build (some types from ExcelJS in browser).
  typescript: {
    ignoreBuildErrors: true,
  },
  reactStrictMode: false,
};

export default nextConfig;
