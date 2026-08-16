import {
  SlashCommandBuilder,
  MessageFlags,
} from 'discord.js';

import { successEmbed } from '../../utils/embeds.js';
import { InteractionHelper } from '../../utils/interactionHelper.js';
import {
  replyUserError,
  ErrorTypes,
} from '../../utils/errorHandler.js';

function buildRoleInfo(role) {
  return successEmbed(
    `Role Information — ${role.name}`,
    [
      `**Role:** ${role}`,
      `**ID:** \`${role.id}\``,
      `**Color:** \`${role.hexColor}\``,
      `**Position:** ${role.position}`,
      `**Members:** ${role.members.size}`,
      `**Mentionable:** ${role.mentionable ? 'Yes' : 'No'}`,
      `**Hoisted:** ${role.hoist ? 'Yes' : 'No'}`,
      `**Managed:** ${role.managed ? 'Yes' : 'No'}`,
      `**Created:** <t:${Math.floor(
        role.createdTimestamp / 1000
      )}:F>`,
    ].join('\n')
  );
}

export default {
  data: new SlashCommandBuilder()
    .setName('roleinfo')
    .setDescription('View information about a role')
    .addRoleOption((option) =>
      option
        .setName('role')
        .setDescription('The role to inspect')
        .setRequired(true)
    ),

  category: 'utility',

  async execute(interaction) {
    const role =
      interaction.options.getRole('role');

    if (!role) {
      return await replyUserError(interaction, {
        type: ErrorTypes.NOT_FOUND,
        message: 'Role not found.',
      });
    }

    await InteractionHelper.safeReply(
      interaction,
      {
        embeds: [
          buildRoleInfo(role),
        ],
        flags: MessageFlags.Ephemeral,
      }
    );
  },

  async messageExecute(message, args) {
    const raw =
      Array.isArray(args)
        ? args[0]
        : args;

    if (!raw) {
      return;
    }

    const role =
      message.mentions.roles.first() ||
      message.guild.roles.cache.get(
        String(raw).replace(/[<@&>]/g, '')
      );

    if (!role) {
      return;
    }

    await message.reply({
      embeds: [
        buildRoleInfo(role),
      ],
    });
  },
};
