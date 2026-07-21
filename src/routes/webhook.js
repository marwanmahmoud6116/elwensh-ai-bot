const express = require('express');
const router = express.Router();
const { getOrCreateSession } = require('../services/session');
const { getCategories } = require('../services/menu');
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

    // Pull the current menu categories - this is the data the OpenAI step
    // will eventually use to understand what the customer is asking for.
    const categories = await getCategories();
    console.log(`Loaded ${categories.length} categories:`, categories.map(c => c.name_en).join(', '));

    // Ask the AI to interpret what the customer wants, given the menu and
    // their current session state. For now we just log the reply - actually
    // sending it back via WhatsApp, and updating the session based on it,
    // come next.
    const aiReply = await interpretMessage({
      customerMessage: textBody,
      categories,
      session,
    });
    console.log(`AI reply for ${from}:`, aiReply);

    // TODO: send aiReply back to the customer via the WhatsApp Cloud API,
    // and update the session state based on what was understood.
  } catch (err) {
    console.error('Error processing incoming webhook payload:', err);
  }
});

module.exports = router;
