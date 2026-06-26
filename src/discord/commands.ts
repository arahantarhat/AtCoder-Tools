import { SlashCommandBuilder, type SlashCommandStringOption } from "@discordjs/builders";
import { Routes, type RESTPostAPIChatInputApplicationCommandsJSONBody } from "discord-api-types/v10";
import type {
  ButtonInteraction,
  ChatInputCommandInteraction,
  Interaction
} from "discord.js";
import { CONTEST_TYPES, type ContestType } from "../shared/contest-types";
import { graphReply } from "./graphs";
import { assignmentEmbed, helpMessage, leaderboardMessage, profileMessage, queueMessage, trainingButtons } from "./messages";
import { parseDateToEpochSecond, getUtcMonthKey } from "./time";
import type { DiscordTrainingBotService, PendingVerificationResult, TrainingResolutionResult } from "./service";
import type { DiscordBotStore } from "./storage";
import type { DifficultyColor, PendingLinkChallenge, ProblemFilters } from "./types";

export function buildDiscordCommands(): RESTPostAPIChatInputApplicationCommandsJSONBody[] {
  return [
    new SlashCommandBuilder()
      .setName("help")
      .setDescription("Show how to use the AtCoder training bot."),
    new SlashCommandBuilder()
      .setName("link")
      .setDescription("Link your Discord account to an AtCoder username.")
      .addStringOption((option) => option.setName("username").setDescription("AtCoder username").setRequired(true)),
    new SlashCommandBuilder()
      .setName("gimme")
      .setDescription("Get a random AtCoder problem with optional filters.")
      .addIntegerOption((option) => option.setName("min").setDescription("Minimum difficulty"))
      .addIntegerOption((option) => option.setName("max").setDescription("Maximum difficulty"))
      .addStringOption((option) => option.setName("color").setDescription("AtCoder color band").addChoices(...colorChoices()))
      .addStringOption((option) => option.setName("category").setDescription("Contest category").addChoices(...contestTypeChoices()))
      .addStringOption((option) => option.setName("contest").setDescription("Contest id, like abc350"))
      .addIntegerOption((option) => option.setName("contest_number_min").setDescription("Minimum contest number"))
      .addIntegerOption((option) => option.setName("contest_number_max").setDescription("Maximum contest number"))
      .addStringOption((option) => option.setName("after").setDescription("Earliest contest date, YYYY-MM-DD"))
      .addStringOption((option) => option.setName("before").setDescription("Latest contest date, YYYY-MM-DD"))
      .addBooleanOption((option) => option.setName("unsolved_only").setDescription("Only problems not solved by your linked AtCoder handle")),
    new SlashCommandBuilder()
      .setName("train")
      .setDescription("Adaptive gitgud-style training.")
      .addSubcommand((command) => command
        .setName("start")
        .setDescription("Start an adaptive training assignment.")
        .addIntegerOption((option) => option
          .setName("delta")
          .setDescription("Difficulty delta from your training rating.")
          .addChoices(
            { name: "-300", value: -300 },
            { name: "-200", value: -200 },
            { name: "-100", value: -100 },
            { name: "0", value: 0 },
            { name: "+100", value: 100 },
            { name: "+200", value: 200 },
            { name: "+300", value: 300 }
          )))
      .addSubcommand((command) => command.setName("current").setDescription("Show your active training assignment."))
      .addSubcommand((command) => command.setName("completed").setDescription("Mark your active assignment as completed without editorial help."))
      .addSubcommand((command) => command.setName("assisted").setDescription("Mark your active assignment as AC with editorial or help."))
      .addSubcommand((command) => command.setName("skip").setDescription("Skip your active assignment without points."))
      .addSubcommand((command) => command.setName("verify").setDescription("Check your pending completion claims now.")),
    new SlashCommandBuilder()
      .setName("queue")
      .setDescription("View or start due review problems.")
      .addSubcommand((command) => command.setName("list").setDescription("List due assisted/skipped review problems."))
      .addSubcommand((command) => command.setName("next").setDescription("Start the next due review problem.")),
    new SlashCommandBuilder()
      .setName("leaderboard")
      .setDescription("Show server points leaderboard.")
      .addStringOption((option) => option.setName("month").setDescription("UTC month key, e.g. 2026-06"))
      .addStringOption((option) => option
        .setName("period")
        .setDescription("Leaderboard period")
        .addChoices({ name: "month", value: "month" }, { name: "alltime", value: "alltime" })),
    new SlashCommandBuilder()
      .setName("points")
      .setDescription("Show points for yourself or another user.")
      .addUserOption((option) => option.setName("user").setDescription("Discord user"))
      .addStringOption((option) => option.setName("month").setDescription("UTC month key, e.g. 2026-06"))
      .addStringOption((option) => option
        .setName("period")
        .setDescription("Points period")
        .addChoices({ name: "month", value: "month" }, { name: "alltime", value: "alltime" })),
    new SlashCommandBuilder()
      .setName("profile")
      .setDescription("Show linked handle, points, training rating, and queue size.")
      .addUserOption((option) => option.setName("user").setDescription("Discord user")),
    new SlashCommandBuilder()
      .setName("graph")
      .setDescription("Render progress graphs.")
      .addSubcommand((command) => command
        .setName("official")
        .setDescription("Graph official AtCoder rating and contest performance.")
        .addUserOption((option) => option.setName("user").setDescription("Discord user"))
        .addStringOption(addGraphRangeOption))
      .addSubcommand((command) => command
        .setName("training")
        .setDescription("Graph daily training ELO.")
        .addUserOption((option) => option.setName("user").setDescription("Discord user"))
        .addStringOption(addGraphRangeOption))
      .addSubcommand((command) => command
        .setName("points")
        .setDescription("Graph monthly verified points.")
        .addUserOption((option) => option.setName("user").setDescription("Discord user"))
        .addStringOption(addGraphRangeOption))
      .addSubcommand((command) => command
        .setName("solved")
        .setDescription("Graph solved problems by 100-point difficulty band.")
        .addUserOption((option) => option.setName("user").setDescription("Discord user")))
      .addSubcommand((command) => command
        .setName("leaderboard")
        .setDescription("Graph server leaderboard trend.")
        .addStringOption(addGraphRangeOption))
  ].map((command) => command.toJSON());
}

export async function registerDiscordCommands(token: string, applicationId: string, guildId?: string): Promise<void> {
  const { REST } = await import("@discordjs/rest");
  const rest = new REST({ version: "10" }).setToken(token);
  const commands = buildDiscordCommands();
  if (guildId) {
    await rest.put(Routes.applicationGuildCommands(applicationId, guildId), { body: commands });
    return;
  }
  await rest.put(Routes.applicationCommands(applicationId), { body: commands });
}

export async function handleInteraction(interaction: Interaction, service: DiscordTrainingBotService, store: DiscordBotStore): Promise<void> {
  if (interaction.isButton()) {
    await handleButton(interaction, service);
    return;
  }
  if (!interaction.isChatInputCommand()) return;
  if (!interaction.guildId) {
    await interaction.reply({ content: "This bot stores server-scoped training state, so commands must be used inside a Discord server.", ephemeral: true });
    return;
  }

  try {
    await routeCommand(interaction, service, store);
  } catch (error) {
    await interaction.reply({ content: error instanceof Error ? error.message : "Command failed.", ephemeral: true });
  }
}

async function routeCommand(interaction: ChatInputCommandInteraction, service: DiscordTrainingBotService, store: DiscordBotStore): Promise<void> {
  const guildId = interaction.guildId!;
  const discordUserId = interaction.user.id;
  switch (interaction.commandName) {
    case "help":
      await interaction.reply({ content: helpMessage(), ephemeral: true });
      return;
    case "link": {
      const username = interaction.options.getString("username", true).trim();
      const result = await service.linkUser(guildId, discordUserId, username);
      if (result.status === "linked") {
        await interaction.reply(`Linked <@${discordUserId}> to AtCoder **${result.user.atcoderUsername}**. You can remove the verification code from your AtCoder profile. Training rating starts at **${result.user.trainingRating}**.`);
        return;
      }
      await interaction.reply({ content: linkChallengeMessage(result.challenge), ephemeral: true });
      return;
    }
    case "gimme": {
      const assignment = await service.gimme(guildId, discordUserId, readProblemFilters(interaction));
      await interaction.reply({ content: "Problem assigned.", embeds: [assignmentEmbed(assignment)] });
      return;
    }
    case "train":
      await handleTrainCommand(interaction, service);
      return;
    case "queue":
      await handleQueueCommand(interaction, service, store);
      return;
    case "leaderboard": {
      const period = interaction.options.getString("period") ?? "month";
      const month = period === "alltime" ? undefined : interaction.options.getString("month") ?? getUtcMonthKey(Math.floor(Date.now() / 1000));
      const entries = store.getLeaderboard(guildId, month);
      await interaction.reply(leaderboardMessage(entries, month ?? "all time"));
      return;
    }
    case "points": {
      const target = interaction.options.getUser("user") ?? interaction.user;
      const period = interaction.options.getString("period") ?? "month";
      const month = period === "alltime" ? undefined : interaction.options.getString("month") ?? getUtcMonthKey(Math.floor(Date.now() / 1000));
      const points = store.getPoints(guildId, target.id, month);
      await interaction.reply(`<@${target.id}> has **${points}** points for ${month ?? "all time"}.`);
      return;
    }
    case "profile": {
      const target = interaction.options.getUser("user") ?? interaction.user;
      const user = store.getLinkedUserOrThrow(guildId, target.id);
      const month = getUtcMonthKey(Math.floor(Date.now() / 1000));
      await interaction.reply(profileMessage(
        user,
        store.getPoints(guildId, target.id, month),
        store.getPoints(guildId, target.id),
        store.getActiveAssignment(guildId, target.id),
        store.countPendingVerification(guildId, target.id),
        store.countQueued(guildId, target.id)
      ));
      return;
    }
    case "graph": {
      const reply = await graphReply(
        interaction.options.getSubcommand(),
        interaction.user,
        interaction.options.getUser("user"),
        guildId,
        service,
        store,
        undefined,
        interaction.options.getString("range")
      );
      await interaction.reply(reply);
      return;
    }
  }
}

function linkChallengeMessage(challenge: PendingLinkChallenge): string {
  return [
    `To link AtCoder **${challenge.atcoderUsername}**, add this code to your public AtCoder Affiliation field:`,
    "",
    challenge.verificationCode,
    "",
    "Then run `/link` with the same username again. You can remove the code after linking."
  ].join("\n");
}

async function handleTrainCommand(interaction: ChatInputCommandInteraction, service: DiscordTrainingBotService): Promise<void> {
  const guildId = interaction.guildId!;
  const discordUserId = interaction.user.id;
  const subcommand = interaction.options.getSubcommand();
  if (subcommand === "start") {
    const assignment = await service.startTraining(guildId, discordUserId, interaction.options.getInteger("delta") ?? 0);
    await interaction.reply({ content: "Training assignment started.", embeds: [assignmentEmbed(assignment)], components: [trainingButtons(assignment.id)] });
    return;
  }
  if (subcommand === "current") {
    const assignment = service.getActiveAssignment(guildId, discordUserId);
    if (!assignment) throw new Error("You do not have an active assignment.");
    await interaction.reply({ embeds: [assignmentEmbed(assignment)], components: [trainingButtons(assignment.id)] });
    return;
  }
  if (subcommand === "completed" || subcommand === "assisted" || subcommand === "skip") {
    const outcome = subcommand === "skip" ? "skipped" : subcommand;
    const result = await service.resolveTraining(guildId, discordUserId, outcome);
    await interaction.reply(trainingResolutionMessage(result));
    return;
  }
  if (subcommand === "verify") {
    const result = await service.verifyPendingAssignmentsForUser(guildId, discordUserId);
    await interaction.reply(pendingVerificationMessage(result));
  }
}

async function handleQueueCommand(interaction: ChatInputCommandInteraction, service: DiscordTrainingBotService, store: DiscordBotStore): Promise<void> {
  const guildId = interaction.guildId!;
  const discordUserId = interaction.user.id;
  const subcommand = interaction.options.getSubcommand();
  if (subcommand === "next") {
    const assignment = await service.startReview(guildId, discordUserId);
    await interaction.reply({ content: "Review assignment started.", embeds: [assignmentEmbed(assignment)], components: [trainingButtons(assignment.id)] });
    return;
  }
  await interaction.reply(queueMessage(store.listReviewQueue(guildId, discordUserId, Math.floor(Date.now() / 1000))));
}

async function handleButton(interaction: ButtonInteraction, service: DiscordTrainingBotService): Promise<void> {
  if (!interaction.guildId) {
    await interaction.reply({ content: "Buttons must be used inside a Discord server.", ephemeral: true });
    return;
  }
  const [scope, action] = interaction.customId.split(":");
  if (scope !== "train" || (action !== "completed" && action !== "assisted" && action !== "skip")) return;
  try {
    const outcome = action === "skip" ? "skipped" : action;
    const result = await service.resolveTraining(interaction.guildId, interaction.user.id, outcome);
    await interaction.reply(trainingResolutionMessage(result));
  } catch (error) {
    await interaction.reply({ content: error instanceof Error ? error.message : "Button action failed.", ephemeral: true });
  }
}

function trainingResolutionMessage(result: TrainingResolutionResult): string {
  if (result.verification === "pending") {
    return [
      `${result.assignment.title}: ${result.outcome} claimed.`,
      "I could not verify the AC yet, so no points or rating change were applied.",
      "The assignment was released; you can start another one while I wait for Kenkoooo/AtCoder to show the AC."
    ].join(" ");
  }
  if (result.verification === "not_required") {
    return `${result.assignment.title}: skipped. 0 points awarded. Training rating is now ${result.rating}.`;
  }
  return `${result.assignment.title}: ${result.outcome}. ${result.points} points awarded. Training rating is now ${result.rating}.`;
}

function pendingVerificationMessage(result: PendingVerificationResult): string {
  if (result.checked === 0) return "You have no pending completion claims.";
  if (result.verified === 0) return `Checked ${result.checked} pending claim(s). No new ACs were visible yet.`;
  return `Verified ${result.verified} pending claim(s). ${result.remaining} still pending.`;
}

function readProblemFilters(interaction: ChatInputCommandInteraction): ProblemFilters {
  const filters: ProblemFilters = {
    minDifficulty: interaction.options.getInteger("min") ?? undefined,
    maxDifficulty: interaction.options.getInteger("max") ?? undefined,
    color: interaction.options.getString("color") as DifficultyColor | null ?? undefined,
    contestId: interaction.options.getString("contest") ?? undefined,
    contestNumberMin: interaction.options.getInteger("contest_number_min") ?? undefined,
    contestNumberMax: interaction.options.getInteger("contest_number_max") ?? undefined,
    unsolvedOnly: interaction.options.getBoolean("unsolved_only") ?? true
  };
  const category = interaction.options.getString("category") as ContestType | null;
  if (category) filters.categories = [category];
  const after = interaction.options.getString("after");
  const before = interaction.options.getString("before");
  if (after) filters.afterEpochSecond = parseDateToEpochSecond(after);
  if (before) filters.beforeEpochSecond = parseDateToEpochSecond(before);
  return filters;
}

function contestTypeChoices(): Array<{ name: ContestType; value: ContestType }> {
  return CONTEST_TYPES.map((type) => ({ name: type, value: type }));
}

function colorChoices(): Array<{ name: DifficultyColor; value: DifficultyColor }> {
  return ["gray", "brown", "green", "cyan", "blue", "yellow", "orange", "red"].map((color) => ({
    name: color as DifficultyColor,
    value: color as DifficultyColor
  }));
}

function addGraphRangeOption(option: SlashCommandStringOption): SlashCommandStringOption {
  return option
    .setName("range")
    .setDescription("Date range")
    .addChoices(
      { name: "30 days", value: "30d" },
      { name: "90 days", value: "90d" },
      { name: "6 months", value: "6m" },
      { name: "1 year", value: "1y" },
      { name: "full history", value: "full" }
    );
}
