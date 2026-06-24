import type { NextConfig } from "next";

/**
 * Static export config — supports GitHub Pages deployment.
 *
 * For GitHub Pages project sites (https://username.github.io/repo-name/),
 * set NEXT_PUBLIC_BASE_PATH=/repo-name in your env.
 *
 * For local dev or standalone Next.js deploy (Vercel/Netlify), leave
 * NEXT_PUBLIC_BASE_PATH unset (empty string).
 */

const basePath = process.env.NEXT_PUBLIC_BASE_PATH || "";

const nextConfig: NextAuthConfig = {
  // Static export — generates pure HTML/JS/CSS in `out/`, no Node.js server needed.
  // Comment this line out if you want to use /api/convert or /api/source (server mode).
  output: "export",

  // Required for static export — Next.js Image Optimization needs a server.
  images: {
    unoptimized: true,
  },

  // Base path for GitHub Pages project sites (e.g. "/lengger-ledger-converter")
  // Leave empty for root deployment (Vercel, Netlify, user GitHub Pages).
  ...(basePath ? { basePath, assetPrefix: basePath } : {}),

  // Ignore TypeScript errors during build (some types from ExcelJS in browser)
  typescript: {
    ignoreBuildErrors: true,
  },
  reactStrictMode: false,
};

type NextAuthConfig = NextConfig;

export default nextConfig;
