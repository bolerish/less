import assert from "node:assert/strict";
import { createServer } from "wxt";

const server = await createServer({
  webExt: { disabled: true },
  dev: { server: { host: "127.0.0.1", port: 31847 } },
});
try {
  await server.start();
  const paths = [
    "/src/entries/welcome/index.html",
    "/src/entries/welcome/App.tsx",
    "/src/entries/sidepanel/App.tsx",
    "/src/shared/styles/bolerish-tokens.css",
  ];
  const responses = await Promise.all(
    paths.map(async (path) => {
      const response = await fetch(new URL(path, server.origin));
      const source = await response.text();
      assert.equal(response.status, 200, `${path}: ${source.slice(0, 300)}`);
      assert(!source.includes("vite-error-overlay"), `${path}: no transform error`);
      return source;
    }),
  );
  assert(responses[0]?.includes("Welcome to Less"), "dev serves the current welcome page");
  assert(/react.*compiler.runtime/.test(responses[2] ?? ""), "React Compiler transforms the panel");
  assert(responses[3]?.includes("--veil-color-bg-canvas"), "StyleX token bridge runs in dev");
  console.log("PASS WXT dev startup, entrypoint scan, React Compiler and StyleX token transforms");
} finally {
  await server.stop();
}
