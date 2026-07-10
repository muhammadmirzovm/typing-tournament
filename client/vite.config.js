import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { execSync } from "child_process";
import { readFileSync } from "fs";

const pkg = JSON.parse(readFileSync("./package.json", "utf-8"));

// Short commit hash — makes every build uniquely identifiable in the footer.
// Vercel exposes VERCEL_GIT_COMMIT_SHA; fall back to git, then "dev".
let commit =
  process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 7) ||
  (() => {
    try {
      return execSync("git rev-parse --short HEAD").toString().trim();
    } catch {
      return "dev";
    }
  })();

const buildDate = new Date().toISOString().slice(0, 10);

export default defineConfig({
  plugins: [react()],
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version),
    __COMMIT_HASH__: JSON.stringify(commit),
    __BUILD_DATE__: JSON.stringify(buildDate),
  },
  server: {
    port: 5173,
  },
});
