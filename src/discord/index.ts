import { Client, Events, GatewayIntentBits } from "discord.js";
import { DiscordAtCoderService } from "./atcoder";
import { handleInteraction, registerDiscordCommands } from "./commands";
import { DiscordTrainingBotService } from "./service";
import { DiscordBotStore } from "./storage";

const token = process.env.DISCORD_BOT_TOKEN;
if (!token) throw new Error("DISCORD_BOT_TOKEN is required.");

const store = new DiscordBotStore();
const atcoder = new DiscordAtCoderService(store);
const service = new DiscordTrainingBotService(store, atcoder);
const client = new Client({ intents: [GatewayIntentBits.Guilds] });
const pendingVerificationInterval = setInterval(() => {
  void verifyPendingAssignments();
}, 5 * 60 * 1000);

client.once(Events.ClientReady, async (readyClient) => {
  const applicationId = process.env.DISCORD_CLIENT_ID ?? readyClient.user.id;
  await registerDiscordCommands(token, applicationId, process.env.DISCORD_GUILD_ID);
  console.log(`AtCoder Discord bot logged in as ${readyClient.user.tag}`);
  void verifyPendingAssignments();
});

client.on(Events.InteractionCreate, (interaction) => {
  handleInteraction(interaction, service, store).catch((error: unknown) => {
    console.error("Unhandled interaction error", error);
  });
});

process.once("SIGINT", () => shutdown());
process.once("SIGTERM", () => shutdown());

void client.login(token);

function shutdown(): void {
  clearInterval(pendingVerificationInterval);
  store.close();
  client.destroy();
  process.exit(0);
}

async function verifyPendingAssignments(): Promise<void> {
  try {
    const result = await service.verifyPendingAssignments();
    if (result.verified > 0) {
      console.log(`Verified ${result.verified} pending AtCoder assignment(s). ${result.remaining} remain pending.`);
    }
  } catch (error) {
    console.error("Pending assignment verification failed", error);
  }
}
