import Bun from "bun";

await Bun.build({
  entrypoints: ["src/dev/miniflare-script.ts"],
  outdir: "dist/dev",
  minify: {
    keepNames: false,
    identifiers: false,
    whitespace: true,
    syntax: true,
  },
  sourcemap: false,
  target: "browser",
  splitting: false,
});

console.log("✅ Built miniflare script for production.");
