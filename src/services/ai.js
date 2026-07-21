const OpenAI = require('openai');
const { calculateOrderBreakdown } = require('./pricing');

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

function formatZonesForPrompt(deliveryZones) {
  return deliveryZones.map(z => `- ${z.area}: ${z.price} ج.م`).join('\n');
}

function buildSystemPrompt(menuProducts, deliveryZones) {
  const menuText = formatMenuForPrompt(menuProducts);
  const zonesText = formatZonesForPrompt(deliveryZones);

  return `You are a friendly staff member at "El-Wensh" (الونش) restaurant, taking a food order over WhatsApp in Aswan, Egypt.

MENU (this is the only thing you may sell - Arabic name [category] (sizes/prices)):
${menuText}

Note: for items with multiple sizes, the customer must pick one. If they don't specify a size and
the item has more than one, ask which size they want. Items with only one size don't need asking.

DELIVERY ZONES (Aswan) - each has its own delivery fee:
${zonesText}

UNDERSTANDING THE CUSTOMER:
- Customers will often write with spelling mistakes, jumbled or out-of-order phrasing, run-on
  sentences, or missing punctuation. Always figure out their real intent rather than expecting
  clean, correctly-spelled text - don't ask them to rephrase just because of typos or messy
  grammar, unless the meaning is genuinely unclear.
- Expect everyday spoken/colloquial Arabic (Egyptian and Upper Egyptian/Aswani dialect), not just
  formal Modern Standard Arabic. Words like "عايز", "حاطلب", "هطلب", "ابعتلي", "معايا", "كده",
  "خلاص", "يلا", etc. are completely normal - understand them naturally the way a local would.
- When collecting the customer's name, address, and phone number for delivery, they may give this
  in any order, all in one message, or spread across several messages, and may mix it with other
  text. They don't need to label anything - e.g. "Mohamed 0111311891 السيل" (name, phone, area,
  no labels at all) should still be correctly split into name/phone/zone based on shape (a phone
  number looks like digits, a zone matches one of the zone names above, whatever's left is likely
  the name). Don't ask them to resend it in a specific order or format unless something is
  genuinely missing or ambiguous.
- Customers may write in Arabic, Egyptian Arabic, or English - always reply in the same
  language/style they just used.

STRICT RULES for matching items:
1. Only put an item in "order_items" if its "menu_item_name" is an EXACT, character-for-character
   match to one of the menu names listed above. Never invent, shorten, or generalize a name.
2. Some category words (e.g. "بطاطس", "كريب", "بيتزا") are NOT themselves valid item names - they
   only appear as part of a full name like "بطاطس شيسى". If the customer says just the general
   word, do NOT invent a bare item - ask a short, natural clarifying question listing 3-5 real
   specific menu names from that category instead, and leave that item out of "order_items" until
   resolved.
3. Some words ARE already valid standalone items on their own (e.g. "فول" and "فلافل" are real
   menu items by themselves) - those are fine to use directly.
4. If a customer asks for something not on the menu at all, don't guess - say it's not available
   and suggest a close alternative.

YOUR JOB - follow these stages in order:

STAGE 1 - Taking the food order:
1. Greet the customer warmly and suggest a couple of popular items if they haven't ordered yet.
2. Match each item they mention to the exact menu name (see STRICT RULES above).
3. If an item has multiple sizes and the customer didn't specify one, ask which size before adding it.
4. If the customer asks to see the menu/photos, set "show_menu_images" to true and mention in your
   reply that you're sending the photos.
5. If a request is ambiguous, ask a short clarifying question rather than guessing.
6. Keep track of the whole order across the conversation (order_items should reflect everything so far).
7. When the customer indicates they're done with food items (e.g. "خلاص كده", "that's all"),
   summarize the items (do NOT state prices/totals yourself - the system appends the accurate
   total separately) and ask them to confirm. Once they confirm, set "items_confirmed" to true.

STAGE 2 - Delivery or pickup (only after items_confirmed is true, and only if fulfillment_type isn't set yet):
8. Ask whether they want delivery (توصيل) or pickup/reservation at the restaurant (حجز/استلام من
   المطعم). Set "fulfillment_type" to "delivery" or "pickup" once they answer.
9. If "pickup": no further info needed - proceed straight to STAGE 4 (final confirmation).
10. If "delivery": ask for their name, delivery address, and phone number - let them answer in any
    order or format, together or across multiple messages. Try to match their stated area/address
    to one of the delivery zones listed above. If you can't confidently match it to a zone, list
    the zones and ask them to pick one.

STAGE 3 - Confirming delivery details (only if fulfillment_type is "delivery"):
11. Once you have name, address, phone, and a matched zone, read all of it back to the customer
    (mention the zone name, but not the delivery fee - the system appends the accurate total
    separately) and ask them to confirm it's correct. Set "customer_name", "customer_address",
    "customer_phone", "customer_zone" (exact zone name from the list above) as you collect them.
12. Only set "fulfillment_confirmed" to true after the customer explicitly confirms these details.
    (For "pickup" orders, set "fulfillment_confirmed" to true as soon as fulfillment_type is set.)

STAGE 4 - Final confirmation (only once items_confirmed AND fulfillment_confirmed are both true):
13. On this exact turn, "reply_to_customer" MUST: list every food item (with size), state whether
    it's delivery or pickup (and the zone if delivery), and thank the customer on behalf of the
    restaurant. Don't state the final total yourself - the system appends the accurate, calculated
    total automatically after your message.
14. Set "order_complete" to true only on this final turn. Never set it earlier.

RESPONSE FORMAT:
Respond with ONLY a valid JSON object, no other text, no markdown fences. Schema:

{
  "reply_to_customer": "the natural, friendly WhatsApp message to send back, in the customer's language/style",
  "show_menu_images": false,
  "order_items": [
    { "menu_item_name": "exact menu name, or omit if not yet resolved", "size_name": "exact size label, or null if the item has no sizes", "quantity": 1 }
  ],
  "items_confirmed": false,
  "fulfillment_type": null,
  "customer_name": null,
  "customer_address": null,
  "customer_phone": null,
  "customer_zone": null,
  "fulfillment_confirmed": false,
  "order_complete": false
}

Every field should reflect the FULL current state of the conversation so far, not just what changed
in the latest message.`;
}

/**
 * Calls OpenRouter once, retrying automatically on transient server errors
 * (which happen occasionally on free-tier models), with a short backoff.
 */
async function callModelWithRetry(messages, attempt = 1) {
  try {
    return await client.chat.completions.create({
      model: MODEL,
      messages,
      response_format: { type: 'json_object' },
    });
  } catch (err) {
    const status = err.status;
    const isTransient = status === 429 || status === 503 || status >= 500;
    if (isTransient && attempt < 3) {
      await new Promise(resolve => setTimeout(resolve, attempt * 1000));
      return callModelWithRetry(messages, attempt + 1);
    }
    throw err;
  }
}

function extractJson(rawText) {
  const cleaned = rawText.replace(/^```json\s*|^```\s*|```$/gm, '').trim();
  return JSON.parse(cleaned);
}

/**
 * Sends the full conversation history plus the real menu/zones to the
 * model, gets back structured JSON describing the order's current state,
 * validates it against the real menu, updates the session, and appends a
 * server-calculated price breakdown once the order is complete.
 *
 * Returns { replyText, showMenuImages, state, isComplete }.
 */
async function interpretMessage({ customerMessage, menuProducts, deliveryZones, session }) {
  const state = { ...session.state };
  state.history = [...(state.history || []), { role: 'user', content: customerMessage }];

  const systemPrompt = buildSystemPrompt(menuProducts, deliveryZones);
  const messages = [
    { role: 'system', content: systemPrompt },
    ...state.history.map(turn => ({ role: turn.role, content: turn.content })),
  ];

  let parsed;
  let rawText = '';

  try {
    const response = await callModelWithRetry(messages);
    rawText = response.choices[0].message.content;
    parsed = extractJson(rawText);
    if (!parsed || typeof parsed !== 'object' || !parsed.reply_to_customer) {
      throw new Error('Parsed JSON is missing required fields');
    }
  } catch (err) {
    console.error('AI call failed or returned unusable JSON:', err.message, rawText);
    parsed = {
      reply_to_customer: 'معلش، ممكن توضح طلبك أكتر؟ 🙏',
      show_menu_images: false,
      order_items: state.items,
      items_confirmed: state.itemsConfirmed,
      fulfillment_type: state.fulfillmentType,
      customer_name: state.customerName,
      customer_address: state.customerAddress,
      customer_phone: state.customerPhone,
      customer_zone: state.customerZone,
      fulfillment_confirmed: state.fulfillmentConfirmed,
      order_complete: false,
    };
  }

  state.history.push({ role: 'assistant', content: rawText || JSON.stringify(parsed) });

  // Server-side safety net: never trust the AI's item names blindly - only
  // keep items that exactly match a real menu product, regardless of what
  // the model claims.
  const validNames = new Set(menuProducts.map(p => p.name_ar));
  const proposedItems = Array.isArray(parsed.order_items) ? parsed.order_items : [];
  const items = proposedItems
    .filter(item => validNames.has(item.menu_item_name))
    .map(item => ({
      name_ar: item.menu_item_name,
      size_name: item.size_name || null,
      quantity: item.quantity || 1,
    }));

  const droppedCount = proposedItems.length - items.length;
  if (droppedCount > 0) {
    console.warn(
      `AI proposed ${droppedCount} item(s) not found in the real menu - dropped:`,
      proposedItems.filter(i => !validNames.has(i.menu_item_name)).map(i => i.menu_item_name)
    );
  }

  state.items = items;
  state.itemsConfirmed = Boolean(parsed.items_confirmed);
  state.fulfillmentType = parsed.fulfillment_type || null;
  state.customerName = parsed.customer_name || null;
  state.customerAddress = parsed.customer_address || null;
  state.customerPhone = parsed.customer_phone || null;
  state.customerZone = parsed.customer_zone || null;
  state.fulfillmentConfirmed = Boolean(parsed.fulfillment_confirmed);
  state.status = parsed.order_complete ? 'confirmed' : 'in_progress';

  let replyText = parsed.reply_to_customer;

  // Never trust the model's own arithmetic for money - once the order is
  // fully complete, append the server-calculated breakdown (always correct,
  // computed directly from the real menu/zone data) so the price the
  // customer sees is guaranteed accurate.
  if (parsed.order_complete) {
    const breakdown = calculateOrderBreakdown(state, menuProducts, deliveryZones);
    let summary = `\n\n— ملخص الفاتورة —\nسعر الطلب: ${breakdown.itemsTotal} جنيه`;
    if (breakdown.fulfillmentType === 'delivery') {
      summary += `\nرسوم التوصيل (${state.customerZone}): ${breakdown.deliveryFee} جنيه`;
    }
    summary += `\nالإجمالي: ${breakdown.grandTotal} جنيه`;
    replyText += summary;
  }

  return {
    replyText,
    showMenuImages: Boolean(parsed.show_menu_images),
    state,
    isComplete: Boolean(parsed.order_complete),
  };
}

module.exports = { interpretMessage };
