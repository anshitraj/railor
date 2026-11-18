import { defineConfig } from "vitest/config";
// tsconfig keeps `jsx: preserve` for Next; tests that render a component need the automatic runtime.
export default defineConfig({ esbuild: { jsx: "automatic" }, test: { minWorkers: 1, maxWorkers: 1 } });
