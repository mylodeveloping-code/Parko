import {
  SlashCommandBuilder,
  PermissionFlagsBits,
} from 'discord.js';

import { createEmbed } from '../../utils/embeds.js';
import { logger } from '../../utils/logger.js';
import { logEvent } from '../../utils/moderation.js';

const AUA_ROLE_ID = '1537847398746030100';

export default {
  data: new SlashCommandBuilder()
    .setName('aua')
    .setDescription('Give a user the AU Access role.')
    .addUserOption((option) =>
      option
        .setName('user')
        .setDescription('The user to give AU Access to.')
        .setRequired(true)
    )
    .setDefaultMemberPermissions(
      PermissionFlagsBits.ManageRoles
    ),

  category: 'moderation',

  abuseProtection: {
    maxAttempts: 10,
    windowMs: 60_000,
  },

  async execute(interaction, config, client) {
    try {
      const user =
        interaction.options.getUser('user');

      const member =
        await interaction.guild.members
          .fetch(user.id)
          .catch(() => null);

      if (!member) {
        return interaction.reply({
          embeds: [
            createEmbed({
              title: 'User Not Found',
              description:
                'That user is not currently in this server.',
              color: 'error',
            }),
          ],
        });
      }

      const role =
        interaction.guild.roles.cache.get(
          AUA_ROLE_ID
        );

      if (!role) {
        logger.error(
          `AU Access role ${AUA_ROLE_ID} was not found in guild ${interaction.guild.id}.`
        );

        return interaction.reply({
          embeds: [
            createEmbed({
              title: 'Role Not Found',
              description:
                'The AU Access role could not be found.',
              color: 'error',
            }),
          ],
        });
      }

      if (!role.editable) {
        return interaction.reply({
          embeds: [
            createEmbed({
              title: 'Cannot Give Role',
              description:
                'I cannot manage the AU Access role. Make sure my bot role is above it.',
              color: 'error',
            }),
          ],
        });
      }

      if (member.roles.cache.has(AUA_ROLE_ID)) {
        return interaction.reply({
          embeds: [
            createEmbed({
              title: 'Already Has AU Access',
              description:
                `${user} already has the **AU Access** role.`,
              color: 'info',
            }),
          ],
        });
      }

      await member.roles.add(
        role,
        `AU Access granted by ${interaction.user.tag}`
      );

      await logEvent({
        client,
        guild: interaction.guild,
        event: {
          action: 'AU Access Granted',
          target:
            `${user.tag} (${user.id})`,
          executor:
            `${interaction.user.tag} (${interaction.user.id})`,
          reason:
            'AU Access role granted.',
          metadata: {
            userId: user.id,
            moderatorId:
              interaction.user.id,
            roleId: AUA_ROLE_ID,
            roleName: 'AU Access',
          },
        },
      });

      return interaction.reply({
        embeds: [
          createEmbed({
            title: 'AU Access Granted',
            description:
              `${user} has been given the **AU Access** role.\n\n` +
              'They can now use commands without normal command restrictions, except commands with your specific name permission.',
            color: 'success',
          }),
        ],
      });
    } catch (error) {
      logger.error(
        'AU Access command error:',
        error
      );

      return interaction.reply({
        embeds: [
          createEmbed({
            title: 'Error',
            description:
              'An unexpected error occurred while giving AU Access.',
            color: 'error',
          }),
        ],
      }).catch(() => {});
    }
  },
};
