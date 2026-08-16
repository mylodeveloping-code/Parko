import OpenAI from 'openai';
import { logger } from '../utils/logger.js';

let openai = null;

function getClient() {
  if (openai) {
    return openai;
  }

  if (!process.env.OPENAI_API_KEY) {
    return null;
  }

  openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
  });

  return openai;
}

export async function askAI(question) {
  const client = getClient();

  if (!client) {
    throw new Error(
      'OPENAI_API_KEY is not configured.'
    );
  }

  const response =
    await client.responses.create({
      model: 'gpt-5.6',
      input: [
        {
          role: 'system',
          content:
            'You are Vyro, a helpful Discord bot. Give clear, friendly, concise answers. Do not claim to be human. Keep responses appropriate for a general Discord server.',
        },
        {
          role: 'user',
          content: question,
        },
      ],
    });

  return (
    response.output_text ||
    'I was unable to generate a response.'
  );
}

export function isAIConfigured() {
  return Boolean(
    process.env.OPENAI_API_KEY
  );
}

export function logAIError(error) {
  logger.error(
    'OpenAI request failed:',
    error
  );
}
