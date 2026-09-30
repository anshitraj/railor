import { defineConfig } from "vitest/config";
export default defineConfig({ test: { minWorkers: 1, maxWorkers: 1 } });
