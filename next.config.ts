import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  distDir: ".next-app",
  serverExternalPackages: ["bcrypt"],
  experimental: {
    webpackBuildWorker: false,
    cpus: 1,
    staticGenerationMaxConcurrency: 1,
  },
  typescript: {
    ignoreBuildErrors: true,
  },
};

export default nextConfig;
