import {
  SlashCommandBuilder,
  PermissionFlagsBits,
  MessageFlags,
} from 'discord.js';

import { successEmbed } from '../../utils/embeds.js';
import { InteractionHelper } from '../../utils/interactionHelper.js';
import {
  replyUserError,
  ErrorTypes,
} from '../../utils/errorHandler.js';
import { logger } from '../../utils/logger.js';

export default {
  data: new SlashCommandBuilder()
    .setName('strip')
    .setDescription('Remove all removable roles from a member')
    .addUserOption((option) =>
      option
        .setName('user')
        .setDescription('The member to strip')
        .setRequired(true)
    )
    .setDefaultMemberPermissions(
      PermissionFlagsBits.ManageRoles
    ),

  category: 'moderation',

  async execute(interaction) {
    const user =
      interaction.options.getUser('user');

    const member =
      await interaction.guild.members
        .fetch(user.id)
        .catch(() => null);

    if (!member) {
      return await replyUserError(interaction, {
        type: ErrorTypes.NOT_FOUND,
        message: 'That member could not be found.',
      });
    }

    try {
      const removableRoles =
        member.roles.cache.filter(
          (role) =>
            role.id !== interaction.guild.id &&
            !role.managed &&
            role.editable
        );

      if (removableRoles.size === 0) {
        return await InteractionHelper.safeReply(
          interaction,
          {
            embeds: [
              successEmbed(
                'No Roles Removed',
                `${member.user} does not have any removable roles.`
              ),
            ],
            flags: MessageFlags.Ephemeral,
          }
        );
      }

      await member.roles.remove(
        removableRoles,
        `Roles stripped by ${interaction.user.tag}`
      );

      await InteractionHelper.safeReply(
        interaction,
        {
          embeds: [
            successEmbed(
              'Roles Stripped',
              `Removed **${removableRoles.size}** role(s) from ${member.user}.`
            ),
          ],
          flags: MessageFlags.Ephemeral,
        }
      );
    } catch (error) {
      logger.error(
        'Strip command error:',
        error
      );

      await replyUserError(interaction, {
        type: ErrorTypes.UNKNOWN,
        message:
          'I could not remove that member\'s roles. Make sure my highest role is above the roles I am trying to remove.',
      });
    }
  },

  async messageExecute(message, args) {
    const raw =
      Array.isArray(args)
        ? args[0]
        : args;

    if (!raw) {
      return;
    }

    const member =
      message.mentions.members.first() ||
      await message.guild.members
        .fetch(String(raw).replace(/[<@!>]/g, ''))
        .catch(() => null);

    if (!member) {
      return;
    }

    try {
      const removableRoles =
        member.roles.cache.filter(
          (role) =>
            role.id !== message.guild.id &&
            !role.managed &&
            role.editable
        );

      if (removableRoles.size === 0) {
        return;
      }

      await member.roles.remove(
        removableRoles,
        `Roles stripped by ${message.author.tag}`
      );

      await message.react('👍').catch(() => {});
    } catch (error) {
      logger.error(
        'Prefix strip command error:',
        error
      );
    }
  },
};
