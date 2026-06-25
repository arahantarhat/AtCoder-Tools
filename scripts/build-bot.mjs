import { mkdir } from "node:fs/promises";
import esbuild from "esbuild";

await mkdir("dist-discord", { recursive: true });

await esbuild.build({
  entryPoints: ["src/discord/index.ts"],
  bundle: true,
  platform: "node",
  format: "cjs",
  target: "node22",
  external: ["discord.js", "@napi-rs/canvas", "@napi-rs/canvas-*"],
  outfile: "dist-discord/bot.cjs",
  sourcemap: true
});
