// Test-only stub for the `server-only` package. Under vitest we run modules in
// a Node environment where the real package's client-import guard would throw,
// so vitest.config.mts aliases `server-only` to this no-op. The guard still
// applies in the real Next build.
export {};
