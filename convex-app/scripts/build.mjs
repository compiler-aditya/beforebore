import { spawnSync } from "node:child_process";

const buildEnv = { ...process.env };
if (buildEnv.VITE_CONVEX_URL) {
  buildEnv.NEXT_PUBLIC_CONVEX_URL = buildEnv.VITE_CONVEX_URL;
}

const result = spawnSync(
  process.execPath,
  ["node_modules/next/dist/bin/next", "build"],
  { env: buildEnv, stdio: "inherit" },
);
process.exit(result.status ?? 1);
