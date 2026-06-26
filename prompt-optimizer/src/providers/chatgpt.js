const OpenAI = require('openai');

const SYSTEM_PROMPT = `You are an expert prompt engineer. When a user gives you a rough idea or concept,
your job is to transform it into a highly optimized, clear, and effective prompt that will get the best
results from AI models.

Output format:
1. **Optimized Prompt** — The refined, ready-to-use prompt
2. **Key Improvements** — Bullet list of what you improved and why
3. **Usage Tips** — 2-3 tips for using this prompt effectively

Be concise but thorough. Use markdown formatting.`;

async function optimizeWithChatGPT(idea) {
  const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

  const response = await client.chat.completions.create({
    model: 'gpt-4o-mini',
    max_tokens: 1024,
    messages: [
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'user', content: `Optimize this idea into a prompt: ${idea}` },
    ],
  });

  return response.choices[0].message.content;
}

module.exports = { optimizeWithChatGPT };
