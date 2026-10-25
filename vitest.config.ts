import { defineConfig } from "vitest/config";
import path from "node:path";
// automatic JSX runtime, like Next.js, so component modules can be rendered in tests
export default defineConfig({ resolve: { alias: { "@": path.resolve(__dirname, "src") } }, esbuild: { jsx: "automatic" }, test: { environment: "node" } });
