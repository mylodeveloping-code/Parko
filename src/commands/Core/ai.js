import {
  SlashCommandBuilder,
  MessageFlags,
} from 'discord.js';

import OpenAI from 'openai';

import { logger } from '../../utils/logger.js';
import { InteractionHelper } from '../../utils/interactionHelper.js';
import {
  replyUserError,
  ErrorTypes,
} from '../../utils/errorHandler.js';

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

export default {
  data: new SlashCommandBuilder()
    .setName('ai')
    .setDescription('Ask AI a question')
    .addStringOption((option) =>
      option
        .setName('question')
        .setDescription('What would you like to ask?')
        .setRequired(true)
        .setMaxLength(4000)
    ),

  category: 'core',

  async execute(interaction) {
    const question =
      interaction.options.getString('question');

    if (!process.env.OPENAI_API_KEY) {
      logger.error(
        'OPENAI_API_KEY is not configured.'
      );

      return await replyUserError(interaction, {
        type: ErrorTypes.UNKNOWN,
        message:
          'The AI system is not configured right now.',
      });
    }

    const deferSuccess =
      await InteractionHelper.safeDefer(
        interaction,
        {
          flags: MessageFlags.Ephemeral,
        }
      );

    if (!deferSuccess) {
      logger.warn(
        'AI interaction defer failed',
        {
          userId: interaction.user.id,
          guildId: interaction.guildId,
        }
      );

      return;
    }

    try {
      const response =
        await openai.responses.create({
          model: 'gpt-5-mini',

          instructions:
            'You are the AI assistant for a Discord bot. Give helpful, accurate, concise answers. Do not claim to have abilities you do not have.',

          input: question,
        });

      const answer =
        response.output_text?.trim();

      if (!answer) {
        throw new Error(
          'OpenAI returned an empty response.'
        );
      }

      // Discord messages have a 2000-character limit.
      const chunks = [];

      for (
        let i = 0;
        i < answer.length;
        i += 1900
      ) {
        chunks.push(
          answer.substring(i, i + 1900)
        );
      }

      await InteractionHelper.safeEditReply(
        interaction,
        {
          content: chunks[0],
          flags: MessageFlags.Ephemeral,
        }
      );

      for (let i = 1; i < chunks.length; i++) {
        await interaction.followUp({
          content: chunks[i],
          flags: MessageFlags.Ephemeral,
        });
      }
    } catch (error) {
      logger.error(
        'AI command error:',
        error
      );

      await replyUserError(interaction, {
        type: ErrorTypes.UNKNOWN,
        message:
          'I could not get a response from the AI right now. Please try again later.',
      });
    }
  },
};
