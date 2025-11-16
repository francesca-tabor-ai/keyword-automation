const Anthropic = require('@anthropic-ai/sdk');

class IntentDetector {
    constructor(apiKey) {
        this.client = new Anthropic({ apiKey });
    }

    async detectIntent(message, availableFlows) {
        const flowDescriptions = availableFlows.map(f => 
            `- ${f.name}: ${f.description}`
        ).join('\n');

        const prompt = `You are an intent classifier for a chatbot system. 

Available flows:
${flowDescriptions}

User message: "${message}"

Analyze the user's intent and respond with ONLY a JSON object in this exact format:
{
  "flowName": "the most appropriate flow name or null",
  "confidence": 0.0 to 1.0,
  "reasoning": "brief explanation"
}

If no flow matches well (confidence < 0.5), set flowName to null.`;

        try {
            const response = await this.client.messages.create({
                model: 'claude-sonnet-4-20250514',
                max_tokens: 500,
                messages: [{ role: 'user', content: prompt }]
            });

            const text = response.content[0].text.trim();
            const json = JSON.parse(text);

            return {
                flowName: json.confidence >= 0.5 ? json.flowName : null,
                confidence: json.confidence,
                reasoning: json.reasoning
            };
        } catch (error) {
            console.error('Intent detection error:', error);
            return { flowName: null, confidence: 0, reasoning: 'Error' };
        }
    }
}

module.exports = IntentDetector;