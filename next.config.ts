import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  distDir: process.env.NEXT_DIST_DIR || ".next",
  serverExternalPackages: ["pdf-parse"],
  async headers() {
    return ["/atlas/bodyparts3d-v4/:path*", "/atlas/hra-female-v1.5/:path*"].map((source) => ({
      source,
      headers: [{ key: "Cache-Control", value: "public, max-age=31536000, immutable" }],
    }));
  },
  outputFileTracingIncludes: {
    "/api/sources": [
      "./node_modules/@napi-rs/canvas*/**/*",
      "./node_modules/pdfjs-dist/legacy/build/pdf.worker.mjs",
    ],
  },
  turbopack: { root: process.cwd() },
};

export default nextConfig;
