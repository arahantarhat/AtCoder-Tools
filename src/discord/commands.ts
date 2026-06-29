import { SlashCommandBuilder, type SlashCommandStringOption } from "@discordjs/builders";
import { Routes, type RESTPostAPIChatInputApplicationCommandsJSONBody } from "discord-api-types/v10";
import type {
  ButtonInteraction,
  ChatInputCommandInteraction,
  InteractionEditReplyOptions,
  InteractionReplyOptions,
  Interaction
} from "discord.js";
import { graphReply } from "./graphs";
import { assignmentEmbed, graphsHelpMessage, helpMessage, leaderboardMessage, profileMessage, queueMessage, trainingButtons, trainingHelpMessage } from "./messages";
import { getUtcMonthKey } from "./time";
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
      .addBooleanOption((option) => option.setName("unsolved_only").setDescription("Only problems not solved by your linked AtCoder handle")),
    new SlashCommandBuilder()
      .setName("train")
      .setDescription("Adaptive gitgud-style training.")
      .addSubcommand((command) => command.setName("help").setDescription("Explain how the training module works."))
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
      .addSubcommand((command) => command.setName("verify").setDescription("Check your pending completion claims now."))
      .addSubcommand((command) => command
        .setName("status")
        .setDescription("Show linked handle, points, training ELO, and queue size.")
        .addUserOption((option) => option.setName("user").setDescription("Discord user")))
      .addSubcommand((command) => command.setName("queue").setDescription("List due assisted/skipped review problems."))
      .addSubcommand((command) => command.setName("review").setDescription("Start the next due review problem."))
      .addSubcommand((command) => command
        .setName("leaderboard")
        .setDescription("Show server training points leaderboard.")
        .addStringOption((option) => option.setName("month").setDescription("UTC month key, e.g. 2026-06"))
        .addStringOption((option) => option
          .setName("period")
          .setDescription("Leaderboard period")
          .addChoices({ name: "month", value: "month" }, { name: "alltime", value: "alltime" }))),
    buildGraphCommand("graphs", "Render progress graphs.")
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
    await deferIfSlowCommand(interaction);
    await routeCommand(interaction, service, store);
  } catch (error) {
    await sendInteractionResponse(interaction, { content: error instanceof Error ? error.message : "Command failed.", ephemeral: true });
  }
}

export function shouldReplyEphemerally(commandName: string, subcommand?: string): boolean {
  if (commandName === "link" || commandName === "gimme") return true;
  if (commandName === "graphs" && subcommand === "help") return true;
  if (commandName !== "train") return false;
  return subcommand === "help" ||
    subcommand === "start" ||
    subcommand === "current" ||
    subcommand === "completed" ||
    subcommand === "assisted" ||
    subcommand === "skip" ||
    subcommand === "verify" ||
    subcommand === "queue" ||
    subcommand === "review";
}

async function routeCommand(interaction: ChatInputCommandInteraction, service: DiscordTrainingBotService, store: DiscordBotStore): Promise<void> {
  const guildId = interaction.guildId!;
  const discordUserId = interaction.user.id;
  switch (interaction.commandName) {
    case "help":
      await sendInteractionResponse(interaction, { content: helpMessage(), ephemeral: true });
      return;
    case "link": {
      const username = interaction.options.getString("username", true).trim();
      const result = await service.linkUser(guildId, discordUserId, username);
      if (result.status === "already_linked") {
        await sendInteractionResponse(interaction, { content: `You are already linked to AtCoder **${result.user.atcoderUsername}** in this server.`, ephemeral: true });
        return;
      }
      if (result.status === "linked") {
        await sendInteractionResponse(interaction, {
          content: `Linked <@${discordUserId}> to AtCoder **${result.user.atcoderUsername}**. You can remove the verification code from your AtCoder profile. Training rating starts at **${result.user.trainingRating}**.`,
          ephemeral: shouldReplyEphemerally("link")
        });
        return;
      }
      await sendInteractionResponse(interaction, { content: linkChallengeMessage(result.challenge), ephemeral: true });
      return;
    }
    case "gimme": {
      const assignment = await service.gimme(guildId, discordUserId, readProblemFilters(interaction));
      await sendInteractionResponse(interaction, {
        content: "Problem assigned.",
        embeds: [assignmentEmbed(assignment)],
        ephemeral: shouldReplyEphemerally("gimme")
      });
      return;
    }
    case "train":
      await handleTrainCommand(interaction, service, store);
      return;
    case "graphs": {
      await handleGraphCommand(interaction, service, store);
      return;
    }
  }
}

async function handleGraphCommand(interaction: ChatInputCommandInteraction, service: DiscordTrainingBotService, store: DiscordBotStore): Promise<void> {
  const subcommand = interaction.options.getSubcommand();
  if (subcommand === "help") {
    await sendInteractionResponse(interaction, { content: graphsHelpMessage(), ephemeral: shouldReplyEphemerally(interaction.commandName, subcommand) });
    return;
  }
  const guildId = interaction.guildId!;
  const reply = await graphReply(
    subcommand,
    interaction.user,
    interaction.options.getUser("user"),
    guildId,
    service,
    store,
    undefined,
    interaction.options.getString("range")
  );
  await sendInteractionResponse(interaction, reply);
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

async function handleTrainCommand(interaction: ChatInputCommandInteraction, service: DiscordTrainingBotService, store: DiscordBotStore): Promise<void> {
  const guildId = interaction.guildId!;
  const discordUserId = interaction.user.id;
  const subcommand = interaction.options.getSubcommand();
  if (subcommand === "help") {
    await sendInteractionResponse(interaction, { content: trainingHelpMessage(), ephemeral: shouldReplyEphemerally("train", subcommand) });
    return;
  }
  if (subcommand === "status") {
    const target = interaction.options.getUser("user") ?? interaction.user;
    const user = store.getLinkedUserOrThrow(guildId, target.id);
    const month = getUtcMonthKey(Math.floor(Date.now() / 1000));
    await sendInteractionResponse(interaction, profileMessage(
      user,
      store.getPoints(guildId, target.id, month),
      store.getPoints(guildId, target.id),
      store.getActiveAssignment(guildId, target.id),
      store.countPendingVerification(guildId, target.id),
      store.countQueued(guildId, target.id)
    ));
    return;
  }
  if (subcommand === "start") {
    const assignment = await service.startTraining(guildId, discordUserId, interaction.options.getInteger("delta") ?? 0);
    await sendInteractionResponse(interaction, {
      content: "Training assignment started.",
      embeds: [assignmentEmbed(assignment)],
      components: [trainingButtons(assignment.id)],
      ephemeral: shouldReplyEphemerally("train", subcommand)
    });
    return;
  }
  if (subcommand === "current") {
    const assignment = service.getActiveAssignment(guildId, discordUserId);
    if (!assignment) throw new Error("You do not have an active assignment.");
    await sendInteractionResponse(interaction, {
      embeds: [assignmentEmbed(assignment)],
      components: [trainingButtons(assignment.id)],
      ephemeral: shouldReplyEphemerally("train", subcommand)
    });
    return;
  }
  if (subcommand === "completed" || subcommand === "assisted" || subcommand === "skip") {
    const outcome = subcommand === "skip" ? "skipped" : subcommand;
    const result = await service.resolveTraining(guildId, discordUserId, outcome);
    await sendInteractionResponse(interaction, {
      content: trainingResolutionMessage(result),
      ephemeral: shouldReplyEphemerally("train", subcommand)
    });
    return;
  }
  if (subcommand === "verify") {
    const result = await service.verifyPendingAssignmentsForUser(guildId, discordUserId);
    await sendInteractionResponse(interaction, {
      content: pendingVerificationMessage(result),
      ephemeral: shouldReplyEphemerally("train", subcommand)
    });
    return;
  }
  if (subcommand === "queue") {
    await sendInteractionResponse(interaction, {
      content: queueMessage(store.listReviewQueue(guildId, discordUserId, Math.floor(Date.now() / 1000))),
      ephemeral: shouldReplyEphemerally("train", subcommand)
    });
    return;
  }
  if (subcommand === "review") {
    const assignment = await service.startReview(guildId, discordUserId);
    await sendInteractionResponse(interaction, {
      content: "Review assignment started.",
      embeds: [assignmentEmbed(assignment)],
      components: [trainingButtons(assignment.id)],
      ephemeral: shouldReplyEphemerally("train", subcommand)
    });
    return;
  }
  if (subcommand === "leaderboard") {
    const period = interaction.options.getString("period") ?? "month";
    const month = period === "alltime" ? undefined : interaction.options.getString("month") ?? getUtcMonthKey(Math.floor(Date.now() / 1000));
    const entries = store.getLeaderboard(guildId, month, 20);
    await sendInteractionResponse(interaction, leaderboardMessage(entries, month ?? "all time"));
  }
}

async function handleButton(interaction: ButtonInteraction, service: DiscordTrainingBotService): Promise<void> {
  if (!interaction.guildId) {
    await interaction.reply({ content: "Buttons must be used inside a Discord server.", ephemeral: true });
    return;
  }
  const [scope, action, assignmentId] = interaction.customId.split(":");
  if (scope !== "train" || (action !== "completed" && action !== "assisted" && action !== "skip")) return;
  const expectedAssignmentId = Number(assignmentId);
  if (!Number.isSafeInteger(expectedAssignmentId)) {
    await interaction.reply({ content: "That training button is invalid. Use /train current for the active assignment.", ephemeral: true });
    return;
  }
  try {
    await interaction.deferReply({ ephemeral: true });
    const outcome = action === "skip" ? "skipped" : action;
    const result = await service.resolveTraining(interaction.guildId, interaction.user.id, outcome, undefined, expectedAssignmentId);
    await sendInteractionResponse(interaction, { content: trainingResolutionMessage(result), ephemeral: true });
  } catch (error) {
    await sendInteractionResponse(interaction, { content: error instanceof Error ? error.message : "Button action failed.", ephemeral: true });
  }
}

async function deferIfSlowCommand(interaction: ChatInputCommandInteraction): Promise<void> {
  const subcommand = getSubcommandIfPresent(interaction);
  if (!shouldDeferCommand(interaction.commandName, subcommand)) return;
  await interaction.deferReply({ ephemeral: shouldReplyEphemerally(interaction.commandName, subcommand ?? undefined) });
}

function shouldDeferCommand(commandName: string, subcommand: string | null): boolean {
  if (commandName === "link" || commandName === "gimme") return true;
  if (commandName === "graphs") return subcommand !== "help";
  if (commandName !== "train") return false;
  return subcommand === "start" ||
    subcommand === "completed" ||
    subcommand === "assisted" ||
    subcommand === "skip" ||
    subcommand === "verify" ||
    subcommand === "review";
}

function getSubcommandIfPresent(interaction: ChatInputCommandInteraction): string | null {
  try {
    return interaction.options.getSubcommand(false);
  } catch {
    return null;
  }
}

type ReplyableInteraction = ChatInputCommandInteraction | ButtonInteraction;
type InteractionResponse = string | InteractionReplyOptions;

async function sendInteractionResponse(interaction: ReplyableInteraction, response: InteractionResponse): Promise<void> {
  if (interaction.deferred) {
    await interaction.editReply(toEditReply(response));
    return;
  }
  if (interaction.replied) {
    await interaction.followUp(response);
    return;
  }
  await interaction.reply(response);
}

function toEditReply(response: InteractionResponse): string | InteractionEditReplyOptions {
  if (typeof response === "string") return response;
  const { ephemeral: _ephemeral, flags: _flags, ...editable } = response;
  return editable as InteractionEditReplyOptions;
}

export function trainingResolutionMessage(result: TrainingResolutionResult): string {
  if (result.verification === "pending") {
    return [
      `${result.assignment.title}: ${result.outcome} claimed and pending verification.`,
      "I could not verify the AC yet, so no points or rating change were applied.",
      "The assignment was released; you can start another one while I wait for Kenkoooo/AtCoder to show the AC.",
      "Use `/train verify` to check again, or `/train status` to see your pending count."
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
  return {
    minDifficulty: interaction.options.getInteger("min") ?? undefined,
    maxDifficulty: interaction.options.getInteger("max") ?? undefined,
    color: interaction.options.getString("color") as DifficultyColor | null ?? undefined,
    unsolvedOnly: interaction.options.getBoolean("unsolved_only") ?? true
  };
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

function buildGraphCommand(name: "graphs", description: string) {
  return new SlashCommandBuilder()
    .setName(name)
    .setDescription(description)
    .addSubcommand((command) => command.setName("help").setDescription("Explain how graph commands work."))
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
      .addUserOption((option) => option.setName("user").setDescription("Discord user")));
}
