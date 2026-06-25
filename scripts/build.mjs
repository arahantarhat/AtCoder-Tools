import { mkdir, readFile, writeFile } from "node:fs/promises";
import esbuild from "esbuild";

await mkdir("dist", { recursive: true });

const stylesPromise = Promise.all([
  "base.css",
  "problemset.css",
  "stats.css",
  "training.css",
  "progress.css"
].map((file) => readFile(`src/styles/${file}`, "utf8")));

await Promise.all([
  esbuild.build({
    entryPoints: ["src/entrypoints/content.ts"],
    bundle: true,
    format: "iife",
    target: "chrome114",
    outfile: "dist/content.js",
    sourcemap: true
  }),
  esbuild.build({
    entryPoints: ["src/entrypoints/background.ts"],
    bundle: true,
    format: "iife",
    target: "chrome114",
    outfile: "dist/background.js",
    sourcemap: true
  }),
  stylesPromise.then((styles) => writeFile("dist/styles.css", styles.join("\n")))
]);

await mkdir("dist-web", { recursive: true });
await mkdir("dist-electron", { recursive: true });

await Promise.all([
  esbuild.build({
    entryPoints: ["src/entrypoints/standalone.ts"],
    bundle: true,
    format: "iife",
    target: "safari16",
    outfile: "dist-web/app.js",
    sourcemap: true
  }),
  esbuild.build({
    entryPoints: ["src/electron/main.ts"],
    bundle: true,
    platform: "node",
    format: "cjs",
    target: "node22",
    external: ["electron"],
    outfile: "dist-electron/main.cjs",
    sourcemap: true
  }),
  stylesPromise.then((styles) => writeFile("dist-web/styles.css", styles.join("\n"))),
  readFile("src/standalone/index.html", "utf8").then((html) => writeFile("dist-web/index.html", html))
]);
