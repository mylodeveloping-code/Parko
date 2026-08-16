import {
  SlashCommandBuilder,
  PermissionFlagsBits,
} from 'discord.js';

import { createEmbed } from '../../utils/embeds.js';
import { logger } from '../../utils/logger.js';
import { logEvent } from '../../utils/moderation.js';

const AUE_ROLE_ID = '1537848681728835635';

export default {
  data: new SlashCommandBuilder()
    .setName('aue')
    .setDescription('Give a user the AU Exempt role.')
    .addUserOption((option) =>
      option
        .setName('user')
        .setDescription('The user to give AU Exempt to.')
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
          AUE_ROLE_ID
        );

      if (!role) {
        logger.error(
          `AU Exempt role ${AUE_ROLE_ID} was not found in guild ${interaction.guild.id}.`
        );

        return interaction.reply({
          embeds: [
            createEmbed({
              title: 'Role Not Found',
              description:
                'The AU Exempt role could not be found.',
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
                'I cannot manage the AU Exempt role. Make sure my bot role is above it.',
              color: 'error',
            }),
          ],
        });
      }

      if (member.roles.cache.has(AUE_ROLE_ID)) {
        return interaction.reply({
          embeds: [
            createEmbed({
              title: 'Already Exempt',
              description:
                `${user} already has the **AU Exempt** role.`,
              color: 'info',
            }),
          ],
        });
      }

      await member.roles.add(
        role,
        `AU Exempt granted by ${interaction.user.tag}`
      );

      await logEvent({
        client,
        guild: interaction.guild,
        event: {
          action: 'AU Exempt Granted',
          target:
            `${user.tag} (${user.id})`,
          executor:
            `${interaction.user.tag} (${interaction.user.id})`,
          reason:
            'AU Exempt role granted.',
          metadata: {
            userId: user.id,
            moderatorId:
              interaction.user.id,
            roleId: AUE_ROLE_ID,
            roleName: 'AU Exempt',
          },
        },
      });

      return interaction.reply({
        embeds: [
          createEmbed({
            title: 'AU Exempt Granted',
            description:
              `${user} has been given the **AU Exempt** role.\n\n` +
              'They are now exempt from normal moderation actions, while your existing automoderation rules for AU Exempt users remain in effect.',
            color: 'success',
          }),
        ],
      });
    } catch (error) {
      logger.error(
        'AU Exempt command error:',
        error
      );

      return interaction.reply({
        embeds: [
          createEmbed({
            title: 'Error',
            description:
              'An unexpected error occurred while giving AU Exempt.',
            color: 'error',
          }),
        ],
      }).catch(() => {});
    }
  },
};
