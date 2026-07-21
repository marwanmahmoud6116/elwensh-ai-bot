const WHATSAPP_ACCESS_TOKEN = process.env.WHATSAPP_ACCESS_TOKEN;
const WHATSAPP_PHONE_NUMBER_ID = process.env.WHATSAPP_PHONE_NUMBER_ID;

if (!WHATSAPP_ACCESS_TOKEN || !WHATSAPP_PHONE_NUMBER_ID) {
  console.warn(
    'WHATSAPP_ACCESS_TOKEN or WHATSAPP_PHONE_NUMBER_ID is missing - sending replies will fail until these are set.'
  );
}

/**
 * Sends a plain text WhatsApp message to a customer via the Cloud API.
 * `to` is the customer's phone number exactly as WhatsApp sent it to us
 * in the incoming webhook (e.g. "201103061032") - no "+" needed.
 */
async function sendTextMessage(to, text) {
  const url = `https://graph.facebook.com/v22.0/${WHATSAPP_PHONE_NUMBER_ID}/messages`;

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${WHATSAPP_ACCESS_TOKEN}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      messaging_product: 'whatsapp',
      to,
      type: 'text',
      text: { body: text },
    }),
  });

  const data = await response.json();

  if (!response.ok) {
    // Log the full error from Meta - this is usually the fastest way to
    // diagnose token/permission/phone-number-id problems.
    console.error('Failed to send WhatsApp message:', JSON.stringify(data));
    throw new Error(`WhatsApp send failed: ${data.error?.message || response.statusText}`);
  }

  return data;
}

module.exports = { sendTextMessage };
