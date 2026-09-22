import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "export",
  outputFileTracingRoot: process.cwd(),
  // Convex static hosting sits behind a CDN that caches a miss for four hours,
  // so a chunk requested before its upload stays 404 at that edge long after
  // the file exists. Stamping every asset URL with a per-deploy id changes the
  // cache key on each publish, so a poisoned miss can never outlive a deploy.
  deploymentId: process.env.NEXT_PUBLIC_DEPLOYMENT_ID ?? String(Date.now()),
  // The build script runs TypeScript 7 before Next.js. Next still needs the
  // older TypeScript compiler API for configuration and editor tooling.
  typescript: {
    ignoreBuildErrors: true,
  },
};

export default nextConfig;
