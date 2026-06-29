const token = process.env.DISCORD_BOT_TOKEN;

if (!token) {
  console.error("DISCORD_BOT_TOKEN is required.");
  process.exit(1);
}

try {
  await import("./dist-discord/bot.cjs");
} catch (error) {
  if (
    error instanceof Error &&
    "code" in error &&
    error.code === "ERR_MODULE_NOT_FOUND" &&
    error.message.includes("dist-discord/bot.cjs")
  ) {
    console.error("Discord bot bundle is missing. Run `npm run bot:build` before `node index.js`.");
    process.exit(1);
  }

  throw error;
}
