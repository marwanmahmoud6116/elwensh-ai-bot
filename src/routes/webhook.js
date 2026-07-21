const express = require('express');
const router = express.Router();
const { getOrCreateSession, updateSessionState } = require('../services/session');
const { getMenuProducts, getDeliveryZones } = require('../services/menu');
const { interpretMessage } = require('../services/ai');
const { sendTextMessage, sendMenuImages } = require('../services/whatsapp');

const VERIFY_TOKEN = process.env.WHATSAPP_VERIFY_TOKEN;

// WhatsApp sometimes delivers the same message event more than once (it
// retries if it isn't fully sure the first delivery succeeded). Each
// message has a unique `id` - we remember recently-seen ids and skip
// anything we've already processed, so customers never get a doubled
// reply or a doubled order. This resets if the server restarts, which is
// an acceptable tradeoff for now (a rare double-process on restart is far
// better than doubling every retry).
const processedMessageIds = new Set();
const processedMessageOrder = [];
const MAX_TRACKED_IDS = 1000;

function alreadyProcessed(messageId) {
  if (processedMessageIds.has(messageId)) {
    return true;
  }
  processedMessageIds.add(messageId);
  processedMessageOrder.push(messageId);
  if (processedMessageOrder.length > MAX_TRACKED_IDS) {
    const oldest = processedMessageOrder.shift();
    processedMessageIds.delete(oldest);
  }
  return false;
}

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

    if (alreadyProcessed(message.id)) {
      console.log(`Skipping duplicate delivery of message ${message.id} from ${from}`);
      return;
    }

    console.log(`Incoming message from ${from} (${messageType}):`, textBody);

    // Load this customer's session (or create one if it's their first message).
    const session = await getOrCreateSession(from);

    // Pull the real menu and delivery zones - what the AI needs to match
    // the customer's words to actual products/areas instead of guessing.
    const [menuProducts, deliveryZones] = await Promise.all([
      getMenuProducts(),
      getDeliveryZones(),
    ]);

    // Ask the AI to interpret the message in the context of the full
    // conversation so far, and advance the order through its stages.
    const result = await interpretMessage({
      customerMessage: textBody,
      menuProducts,
      deliveryZones,
      session,
    });

    console.log(
      `Result for ${from} - items: ${result.state.items.length}, ` +
      `itemsConfirmed: ${result.state.itemsConfirmed}, fulfillment: ${result.state.fulfillmentType}, ` +
      `fulfillmentConfirmed: ${result.state.fulfillmentConfirmed}, complete: ${result.isComplete}`
    );

    // Persist the updated state so the next message picks up where this left off.
    await updateSessionState(from, result.state);

    // Send the AI's reply back to the customer on WhatsApp.
    await sendTextMessage(from, result.replyText);
    console.log(`Sent reply to ${from}`);

    // If the customer asked for the menu, follow up with the actual menu photos.
    if (result.showMenuImages) {
      await sendMenuImages(from);
      console.log(`Sent menu images to ${from}`);
    }

    // TODO: once result.isComplete is true, persist the order into the
    // `orders`/`order_items` tables (and reset the session for their next order).
  } catch (err) {
    console.error('Error processing incoming webhook payload:', err);
  }
});

module.exports = router;
