import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

export default defineConfig({
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
      // Neutralise the `server-only` import guard so server modules are testable.
      "server-only": fileURLToPath(new URL("./src/test/server-only.stub.ts", import.meta.url)),
    },
  },
  // Use the automatic JSX runtime so .tsx sources/tests don't need a React
  // import. `jsx` is a valid esbuild transform option (and works at runtime), but
  // Vite 8's narrowed legacy-esbuild type omits it, so cast to satisfy tsc.
  esbuild: { jsx: "automatic", jsxImportSource: "react" } as never,
  test: {
    environment: "node",
    include: ["src/**/*.test.{ts,tsx}"],
  },
});
