import {
  SlashCommandBuilder,
  MessageFlags,
} from 'discord.js';

import { successEmbed } from '../../utils/embeds.js';
import { InteractionHelper } from '../../utils/interactionHelper.js';

const AUE_ROLE_ID =
  '1537848681728835635';

export default {
  data: new SlashCommandBuilder()
    .setName('auelist')
    .setDescription('List everyone with AU Exempt'),

  category: 'utility',

  async execute(interaction) {
    const role =
      interaction.guild.roles.cache.get(
        AUE_ROLE_ID
      );

    if (!role) {
      return InteractionHelper.safeReply(
        interaction,
        {
          content:
            'The AU Exempt role could not be found.',
          flags: MessageFlags.Ephemeral,
        }
      );
    }

    const members =
      [...role.members.values()]
        .sort((a, b) =>
          a.user.username.localeCompare(
            b.user.username
          )
        );

    const list =
      members.length
        ? members
            .map(
              (member) =>
                `• ${member} — \`${member.id}\``
            )
            .join('\n')
        : 'Nobody currently has AU Exempt.';

    const embed =
      successEmbed(
        'AU Exempt',
        `**Total:** ${members.length}\n\n${list.slice(
          0,
          3900
        )}`
      );

    await InteractionHelper.safeReply(
      interaction,
      {
        embeds: [embed],
        flags: MessageFlags.Ephemeral,
      }
    );
  },

  async messageExecute(message) {
    const role =
      message.guild.roles.cache.get(
        AUE_ROLE_ID
      );

    if (!role) {
      return;
    }

    const members =
      [...role.members.values()]
        .sort((a, b) =>
          a.user.username.localeCompare(
            b.user.username
          )
        );

    const list =
      members.length
        ? members
            .map(
              (member) =>
                `• ${member} — \`${member.id}\``
            )
            .join('\n')
        : 'Nobody currently has AU Exempt.';

    await message.reply({
      embeds: [
        successEmbed(
          'AU Exempt',
          `**Total:** ${members.length}\n\n${list.slice(
            0,
            3900
          )}`
        ),
      ],
    });
  },
};
