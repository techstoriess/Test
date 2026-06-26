const Anthropic = require('@anthropic-ai/sdk');

const SYSTEM_PROMPT = `You are an expert prompt engineer. When a user gives you a rough idea or concept,
your job is to transform it into a highly optimized, clear, and effective prompt that will get the best
results from AI models.

Output format:
1. **Optimized Prompt** — The refined, ready-to-use prompt
2. **Key Improvements** — Bullet list of what you improved and why
3. **Usage Tips** — 2-3 tips for using this prompt effectively

Be concise but thorough. Use markdown formatting.`;

async function optimizeWithClaude(idea) {
  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

  const message = await client.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 1024,
    system: SYSTEM_PROMPT,
    messages: [{ role: 'user', content: `Optimize this idea into a prompt: ${idea}` }],
  });

  return message.content[0].text;
}

module.exports = { optimizeWithClaude };
