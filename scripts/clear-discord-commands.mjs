import { REST } from "@discordjs/rest";
import { Routes } from "discord-api-types/v10";

const scope = process.argv[2];
const validScopes = new Set(["global", "guild", "both"]);

if (!validScopes.has(scope)) {
  console.error("Usage: node scripts/clear-discord-commands.mjs <global|guild|both>");
  process.exit(1);
}

const token = process.env.DISCORD_BOT_TOKEN;
const applicationId = process.env.DISCORD_CLIENT_ID;
const guildId = process.env.DISCORD_GUILD_ID;

if (!token) throw new Error("DISCORD_BOT_TOKEN is required.");
if (!applicationId) throw new Error("DISCORD_CLIENT_ID is required for command cleanup.");
if ((scope === "guild" || scope === "both") && !guildId) {
  throw new Error("DISCORD_GUILD_ID is required to clear guild-scoped commands.");
}

const rest = new REST({ version: "10" }).setToken(token);

if (scope === "global" || scope === "both") {
  await rest.put(Routes.applicationCommands(applicationId), { body: [] });
  console.log("Cleared global Discord application commands.");
}

if (scope === "guild" || scope === "both") {
  await rest.put(Routes.applicationGuildCommands(applicationId, guildId), { body: [] });
  console.log(`Cleared Discord application commands for guild ${guildId}.`);
}
