const Anthropic = require('@anthropic-ai/sdk');

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

async function sendMessage(userMessage, systemPrompt = '') {
  try {
    const message = await anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 1024,
      system: systemPrompt || 'You are a helpful assistant for keyword automation.',
      messages: [
        {
          role: 'user',
          content: userMessage
        }
      ]
    });

    return message.content[0].text;
  } catch (error) {
    console.error('Anthropic API error:', error);
    throw error;
  }
}

async function analyzeKeywords(text) {
  const prompt = `Analyze the following text and extract key keywords and their intent:

${text}

Provide a JSON response with:
- keywords: array of identified keywords
- intent: the primary intent (question, command, information, etc.)
- sentiment: positive, negative, or neutral`;

  return await sendMessage(prompt);
}

module.exports = {
  sendMessage,
  analyzeKeywords
};