import {
  SlashCommandBuilder,
  MessageFlags,
} from 'discord.js';

import OpenAI from 'openai';

import { logger } from '../../utils/logger.js';
import { InteractionHelper } from '../../utils/interactionHelper.js';

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
      return await interaction.reply({
        content:
          '❌ OPENAI_API_KEY is missing from the bot configuration.',
        flags: MessageFlags.Ephemeral,
      });
    }

    try {
      await interaction.deferReply({
        flags: MessageFlags.Ephemeral,
      });

      const response = await openai.responses.create({
        model: 'gpt-5-mini',
        instructions:
          'You are the AI assistant for a Discord bot. Give helpful, accurate, concise answers. Do not claim to have abilities you do not have.',
        input: question,
      });

      const answer = response.output_text?.trim();

      if (!answer) {
        throw new Error(
          'OpenAI returned an empty response.'
        );
      }

      const chunks = [];

      for (let i = 0; i < answer.length; i += 1900) {
        chunks.push(answer.substring(i, i + 1900));
      }

      await interaction.editReply({
        content: chunks[0],
      });

      for (let i = 1; i < chunks.length; i++) {
        await interaction.followUp({
          content: chunks[i],
          flags: MessageFlags.Ephemeral,
        });
      }

    } catch (error) {
      logger.error('OPENAI ERROR', error);

      let errorMessage = 'Unknown OpenAI error.';

      if (error?.message) {
        errorMessage = error.message;
      }

      if (error?.status) {
        errorMessage += ` (Status: ${error.status})`;
      }

      if (interaction.deferred || interaction.replied) {
        await interaction.editReply({
          content: `❌ AI Error:\n\`\`\`\n${errorMessage.substring(
            0,
            1800
          )}\n\`\`\``,
        });
      } else {
        await interaction.reply({
          content: `❌ AI Error:\n\`\`\`\n${errorMessage.substring(
            0,
            1800
          )}\n\`\`\``,
          flags: MessageFlags.Ephemeral,
        });
      }
    }
  },
};
