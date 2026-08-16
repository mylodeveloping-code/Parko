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
import { logger } from '../../utils/logger.js';

async function findFirstMessage(
  channel,
  userId
) {
  let before;
  let firstMessage = null;

  while (true) {
    const options = {
      limit: 100,
    };

    if (before) {
      options.before = before;
    }

    const messages =
      await channel.messages.fetch(options);

    if (messages.size === 0) {
      break;
    }

    for (const message of messages.values()) {
      if (message.author.id === userId) {
        firstMessage = message;
      }
    }

    const oldest =
      messages.last();

    if (!oldest) {
      break;
    }

    before = oldest.id;

    if (messages.size < 100) {
      break;
    }
  }

  return firstMessage;
}

function buildFirstMessageEmbed(
  user,
  message
) {
  if (!message) {
    return successEmbed(
      'First Message',
      `I couldn't find a message from ${user} in this channel.`
    );
  }

  return successEmbed(
    `First Message — ${user.tag}`,
    [
      `**Author:** ${user}`,
      `**Sent:** <t:${Math.floor(
        message.createdTimestamp / 1000
      )}:F>`,
      `**Message ID:** \`${message.id}\``,
      `**Jump:** [Go to message](${message.url})`,
      '',
      `**Content:**`,
      message.content
        ? `> ${message.content.slice(0, 1000)}`
        : '> *(No text content)*',
    ].join('\n')
  );
}

export default {
  data: new SlashCommandBuilder()
    .setName('fm')
    .setDescription('Find a user\'s first message in this channel')
    .addUserOption((option) =>
      option
        .setName('user')
        .setDescription('The user to search for')
        .setRequired(false)
    ),

  category: 'utility',

  async execute(interaction) {
    const user =
      interaction.options.getUser('user') ||
      interaction.user;

    await InteractionHelper.safeDefer(
      interaction,
      {
        flags: MessageFlags.Ephemeral,
      }
    );

    try {
      const message =
        await findFirstMessage(
          interaction.channel,
          user.id
        );

      await InteractionHelper.safeEditReply(
        interaction,
        {
          embeds: [
            buildFirstMessageEmbed(
              user,
              message
            ),
          ],
        }
      );
    } catch (error) {
      logger.error(
        'FM command error:',
        error
      );

      await replyUserError(interaction, {
        type: ErrorTypes.UNKNOWN,
        message:
          'I could not search this channel\'s message history.',
      });
    }
  },

  async messageExecute(message, args) {
    const user =
      message.mentions.users.first() ||
      message.author;

    try {
      const found =
        await findFirstMessage(
          message.channel,
          user.id
        );

      await message.reply({
        embeds: [
          buildFirstMessageEmbed(
            user,
            found
          ),
        ],
      });
    } catch (error) {
      logger.error(
        'Prefix FM command error:',
        error
      );
    }
  },
};
