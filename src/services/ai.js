const OpenAI = require('openai');

const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY;

if (!OPENROUTER_API_KEY) {
  console.warn('OPENROUTER_API_KEY is missing - AI calls will fail until this is set.');
}

// OpenRouter exposes an OpenAI-compatible API, so we reuse the official
// OpenAI SDK and just point it at OpenRouter's URL instead.
const client = new OpenAI({
  apiKey: OPENROUTER_API_KEY,
  baseURL: 'https://openrouter.ai/api/v1',
});

// Free-tier model, good for multilingual/dialogue use cases. Free model
// availability on OpenRouter rotates over time - if this one disappears,
// check https://openrouter.ai/models?max_price=0 for a current replacement.
const MODEL = 'meta-llama/llama-3.3-70b-instruct:free';

/**
 * Sends the customer's message, along with the menu categories and their
 * current session state, to the model and asks it to interpret what the
 * customer wants. For now this returns the model's raw text reply -
 * structured JSON output (so we can act on it programmatically) comes next.
 */
async function interpretMessage({ customerMessage, categories, session }) {
  const categoryList = categories.map(c => `${c.name_ar} (${c.name_en})`).join('\n');

  const systemPrompt = `You are a WhatsApp ordering assistant for El-Wensh, an Egyptian restaurant in Aswan.
Customers write in Egyptian Arabic (sometimes mixed with English). Here are the current menu categories:
${categoryList}

The customer's current order step is: ${session.state.step}
Their cart so far: ${JSON.stringify(session.state.cart)}

Reply in Egyptian Arabic, in a friendly, brief WhatsApp style.`;

  const response = await client.chat.completions.create({
    model: MODEL,
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: customerMessage },
    ],
  });

  return response.choices[0].message.content;
}

module.exports = { interpretMessage };
