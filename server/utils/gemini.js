const { GoogleGenAI } = require('@google/genai');

const SUMMARY_PROMPT = `Summarize the following conversation in concise bullet points.
Prioritize urgent messages, decisions, and important updates.
Ignore small talk and repetition.
Format each point with a bullet (•).`;

/**
 * Generate a summary of conversation messages using Gemini.
 * @param {string} messagesText - Formatted conversation text
 * @returns {Promise<string>} Summary text
 */
async function generateSummary(messagesText) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey || apiKey === 'YOUR_API_KEY_HERE') {
    throw new Error('GEMINI_API_KEY is not configured. Add your key to server/.env');
  }

  if (!messagesText || !messagesText.trim()) {
    return '• No content to summarize.';
  }

  try {
    const ai = new GoogleGenAI({ apiKey });

    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: `${SUMMARY_PROMPT}\n\n${messagesText}`,
    });

    const text = response.text;
    if (!text || !text.trim()) {
      return '• No meaningful summary could be generated.';
    }

    return text;
  } catch (err) {
    console.error('Gemini API error:', err?.message || err);
    // Return graceful fallback instead of crashing
    if (err?.message?.includes('429') || err?.message?.includes('RESOURCE_EXHAUSTED')) {
      return '• Summary temporarily unavailable — API rate limit reached. Please try again in a moment.';
    }
    if (err?.message?.includes('404')) {
      return '• Summary unavailable — AI model not found. Please check server configuration.';
    }
    return '• AI summary temporarily unavailable. Please try again later.';
  }
}

module.exports = { generateSummary };
