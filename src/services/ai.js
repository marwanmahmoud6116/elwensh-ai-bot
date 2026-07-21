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

// Free-tier router: automatically picks from whatever free models are
// currently available on OpenRouter, instead of us hardcoding one specific
// model slug that can get pulled from the free tier without warning (as
// happened with meta-llama/llama-3.3-70b-instruct:free).
const MODEL = 'openrouter/free';

/**
 * Turns the flat product list from getMenuProducts() into a compact text
 * block the AI can actually match customer words against - each product's
 * Arabic name, category, and its available sizes/prices.
 */
function formatMenuForPrompt(menuProducts) {
  return menuProducts
    .map(p => {
      const sizes = (p.product_sizes || [])
        .map(s => `${s.size_name}: ${s.price} ج.م`)
        .join(', ');
      const category = p.categories?.name_en || '';
      return `- ${p.name_ar} [${category}] (${sizes})`;
    })
    .join('\n');
}

/**
 * Sends the customer's message, the real menu (with prices), and their
 * session state to the model, and asks for a structured JSON result:
 * what the customer wants to order (if anything), plus a friendly Arabic
 * reply to send back. Returns a parsed JS object, not raw text.
 */
async function interpretMessage({ customerMessage, menuProducts, session }) {
  const menuText = formatMenuForPrompt(menuProducts);

  const systemPrompt = `You are a WhatsApp ordering assistant for El-Wensh, an Egyptian restaurant in Aswan.
Customers write in Egyptian Arabic (sometimes mixed with English).

Here is the current menu (Arabic name [category] (sizes/prices)):
${menuText}

The customer's current order step is: ${session.state.step}
Their cart so far: ${JSON.stringify(session.state.cart)}

Match the customer's words to actual menu item names above - do not invent items that
aren't listed. If a size isn't specified and the item has multiple sizes, ask which size.

Respond with ONLY a JSON object (no other text) in exactly this shape:
{
  "intent": "add_to_cart" | "ask_clarification" | "greeting" | "checkout" | "other",
  "items": [ { "name_ar": "<exact menu name>", "size_name": "<size or null>", "quantity": <number> } ],
  "reply_text": "<friendly, brief reply in Egyptian Arabic to send back on WhatsApp>"
}`;

  const response = await client.chat.completions.create({
    model: MODEL,
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: customerMessage },
    ],
    response_format: { type: 'json_object' },
  });

  const rawContent = response.choices[0].message.content;

  try {
    return JSON.parse(rawContent);
  } catch (err) {
    // Free models don't always obey "JSON only" perfectly - if parsing
    // fails, fall back to just showing the customer something reasonable
    // instead of crashing the whole message-handling flow.
    console.error('AI did not return valid JSON:', rawContent);
    return {
      intent: 'other',
      items: [],
      reply_text: 'معلش، ممكن توضح طلبك أكتر؟ 🙏',
    };
  }
}

module.exports = { interpretMessage };
