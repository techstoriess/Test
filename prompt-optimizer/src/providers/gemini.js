const { GoogleGenerativeAI } = require('@google/generative-ai');

const SYSTEM_PROMPT = `You are an expert prompt engineer. When a user gives you a rough idea or concept,
your job is to transform it into a highly optimized, clear, and effective prompt that will get the best
results from AI models.

Output format:
1. **Optimized Prompt** — The refined, ready-to-use prompt
2. **Key Improvements** — Bullet list of what you improved and why
3. **Usage Tips** — 2-3 tips for using this prompt effectively

Be concise but thorough. Use markdown formatting.`;

async function optimizeWithGemini(idea) {
  const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
  const model = genAI.getGenerativeModel({
    model: 'gemini-1.5-flash',
    systemInstruction: SYSTEM_PROMPT,
  });

  const result = await model.generateContent(`Optimize this idea into a prompt: ${idea}`);
  return result.response.text();
}

module.exports = { optimizeWithGemini };
