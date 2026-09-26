import { defineConfig } from "vitest/config";

export default defineConfig({
  test: { environment: "node" },
  server: { port: 5174 },
});
