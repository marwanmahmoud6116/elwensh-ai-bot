const express = require('express');
const router = express.Router();
const { getOrCreateSession } = require('../services/session');
const { getMenuProducts } = require('../services/menu');
const { interpretMessage } = require('../services/ai');

const VERIFY_TOKEN = process.env.WHATSAPP_VERIFY_TOKEN;

/**
 * GET /webhook
 * Meta calls this once, when you set up the webhook in the Meta Developer
 * dashboard, to confirm you control this URL. You must echo back the
 * "hub.challenge" value if the verify token matches, or Meta will reject
 * the webhook setup.
 */
router.get('/webhook', (req, res) => {
  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];

  if (mode === 'subscribe' && token === VERIFY_TOKEN) {
    console.log('Webhook verified successfully');
    return res.status(200).send(challenge);
  }

  console.warn('Webhook verification failed - token mismatch');
  return res.sendStatus(403);
});

/**
 * POST /webhook
 * Meta calls this every time a message-related event happens (a customer
 * sends a message, a message status changes, etc). We only care about
 * actual incoming text messages for now.
 */
router.post('/webhook', async (req, res) => {
  // Respond to Meta immediately - they expect a fast 200 OK and will retry
  // (and eventually disable your webhook) if you're slow or don't respond.
  res.sendStatus(200);

  try {
    const entry = req.body.entry?.[0];
    const change = entry?.changes?.[0];
    const value = change?.value;
    const message = value?.messages?.[0];

    if (!message) {
      // This is a status update (delivered/read) or some other event we
      // don't need to act on yet - just ignore it.
      return;
    }

    const from = message.from; // customer's WhatsApp number
    const messageType = message.type; // 'text', 'audio', 'image', etc.
    const textBody = message.text?.body;

    console.log(`Incoming message from ${from} (${messageType}):`, textBody);

    // Load this customer's session (or create one if it's their first message).
    const session = await getOrCreateSession(from);
    console.log(`Session for ${from} - step: ${session.state.step}, cart items: ${session.state.cart.length}`);

    // Pull the actual menu items (with sizes/prices) - this is what the AI
    // needs to match the customer's words to real dishes, not just category names.
    const menuProducts = await getMenuProducts();
    console.log(`Loaded ${menuProducts.length} menu products.`);

    // Ask the AI to interpret what the customer wants, given the real menu
    // and their current session state. Returns structured JSON: intent,
    // items to add to cart, and a reply to send back.
    const result = await interpretMessage({
      customerMessage: textBody,
      menuProducts,
      session,
    });
    console.log(`AI result for ${from}:`, JSON.stringify(result));

    // TODO: use result.intent/result.items to actually update the session's
    // cart in Supabase, and send result.reply_text back via the WhatsApp
    // Cloud API.
  } catch (err) {
    console.error('Error processing incoming webhook payload:', err);
  }
});

module.exports = router;
