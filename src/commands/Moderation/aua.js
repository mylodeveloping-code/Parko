import {
  SlashCommandBuilder,
  PermissionFlagsBits,
} from 'discord.js';

import { successEmbed } from '../../utils/embeds.js';
import { logger } from '../../utils/logger.js';
import { replyUserError, ErrorTypes } from '../../utils/errorHandler.js';

const AUA_ROLE_ID = '1537847398746030100';

export default {
  data: new SlashCommandBuilder()
    .setName('aua')
    .setDescription('Toggle AU Access for a user')
    .addUserOption((option) =>
      option
        .setName('user')
        .setDescription('The user to toggle AU Access for')
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
      return replyUserError(interaction, {
        type: ErrorTypes.NOT_FOUND,
        message: 'That user is not in this server.',
      });
    }

    const role =
      interaction.guild.roles.cache.get(AUA_ROLE_ID);

    if (!role) {
      return replyUserError(interaction, {
        type: ErrorTypes.UNKNOWN,
        message: 'The AU Access role could not be found.',
      });
    }

    if (!role.editable) {
      return replyUserError(interaction, {
        type: ErrorTypes.PERMISSION,
        message:
          'I cannot manage the AU Access role. Make sure my highest role is above it.',
      });
    }

    try {
      const hasRole =
        member.roles.cache.has(AUA_ROLE_ID);

      if (hasRole) {
        await member.roles.remove(
          role,
          `AU Access removed by ${interaction.user.tag}`
        );

        await interaction.reply({
          embeds: [
            successEmbed(
              'AU Access Removed',
              `Removed the **AU Access** role from ${member}.`
            ),
          ],
        });

        logger.info(
          `Removed AU Access from ${member.user.tag} (${member.id}) by ${interaction.user.tag}`
        );
      } else {
        await member.roles.add(
          role,
          `AU Access granted by ${interaction.user.tag}`
        );

        await interaction.reply({
          embeds: [
            successEmbed(
              'AU Access Granted',
              `Gave **AU Access** to ${member}.`
            ),
          ],
        });

        logger.info(
          `Granted AU Access to ${member.user.tag} (${member.id}) by ${interaction.user.tag}`
        );
      }
    } catch (error) {
      logger.error(
        'Error toggling AU Access:',
        error
      );

      return replyUserError(interaction, {
        type: ErrorTypes.UNKNOWN,
        message:
          'I could not change the AU Access role.',
      });
    }
  },

  async messageExecute(message, args) {
    if (!message?.guild) {
      return;
    }

    if (
      !message.member?.permissions.has(
        PermissionFlagsBits.ManageRoles
      )
    ) {
      return;
    }

    const userId = args?.[0]?.replace(/[<@!>]/g, '');

    if (!userId || !/^\d+$/.test(userId)) {
      return;
    }

    const member =
      await message.guild.members
        .fetch(userId)
        .catch(() => null);

    if (!member) {
      return;
    }

    const role =
      message.guild.roles.cache.get(AUA_ROLE_ID);

    if (!role || !role.editable) {
      return;
    }

    try {
      const hasRole =
        member.roles.cache.has(AUA_ROLE_ID);

      if (hasRole) {
        await member.roles.remove(
          role,
          `AU Access removed by ${message.author.tag}`
        );

        await message.react('👍').catch(() => {});

        logger.info(
          `Removed AU Access from ${member.user.tag} (${member.id}) by ${message.author.tag}`
        );
      } else {
        await member.roles.add(
          role,
          `AU Access granted by ${message.author.tag}`
        );

        await message.react('👍').catch(() => {});

        logger.info(
          `Granted AU Access to ${member.user.tag} (${member.id}) by ${message.author.tag}`
        );
      }
    } catch (error) {
      logger.error(
        'Error toggling AU Access:',
        error
      );
    }
  },
};
