const fs = require('fs');
const path = require('path');

const WHATSAPP_ACCESS_TOKEN = process.env.WHATSAPP_ACCESS_TOKEN;
const WHATSAPP_PHONE_NUMBER_ID = process.env.WHATSAPP_PHONE_NUMBER_ID;

if (!WHATSAPP_ACCESS_TOKEN || !WHATSAPP_PHONE_NUMBER_ID) {
  console.warn(
    'WHATSAPP_ACCESS_TOKEN or WHATSAPP_PHONE_NUMBER_ID is missing - sending replies will fail until these are set.'
  );
}

const GRAPH_BASE = `https://graph.facebook.com/v22.0/${WHATSAPP_PHONE_NUMBER_ID}`;

/**
 * Sends a plain text WhatsApp message to a customer via the Cloud API.
 * `to` is the customer's phone number exactly as WhatsApp sent it to us
 * in the incoming webhook (e.g. "201103061032") - no "+" needed.
 */
async function sendTextMessage(to, text) {
  const response = await fetch(`${GRAPH_BASE}/messages`, {
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
    console.error('Failed to send WhatsApp message:', JSON.stringify(data));
    throw new Error(`WhatsApp send failed: ${data.error?.message || response.statusText}`);
  }

  return data;
}

/**
 * Uploads a local image file to Meta's servers and returns a media_id that
 * can then be referenced in an image message. This is a separate step from
 * actually sending - WhatsApp doesn't accept raw image bytes in the message
 * itself, only a media_id you got from this upload endpoint beforehand.
 */
async function uploadMedia(filePath) {
  const fileBuffer = fs.readFileSync(filePath);
  const blob = new Blob([fileBuffer], { type: 'image/png' });

  const form = new FormData();
  form.append('messaging_product', 'whatsapp');
  form.append('file', blob, path.basename(filePath));
  form.append('type', 'image/png');

  const response = await fetch(`${GRAPH_BASE}/media`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${WHATSAPP_ACCESS_TOKEN}`,
    },
    body: form,
  });

  const data = await response.json();

  if (!response.ok) {
    console.error('Failed to upload media:', JSON.stringify(data));
    throw new Error(`WhatsApp media upload failed: ${data.error?.message || response.statusText}`);
  }

  return data.id; // this is the media_id
}

/**
 * Sends a previously-uploaded image (by media_id) to a customer, with an
 * optional caption.
 */
async function sendImageMessage(to, mediaId, caption) {
  const response = await fetch(`${GRAPH_BASE}/messages`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${WHATSAPP_ACCESS_TOKEN}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      messaging_product: 'whatsapp',
      to,
      type: 'image',
      image: caption ? { id: mediaId, caption } : { id: mediaId },
    }),
  });

  const data = await response.json();

  if (!response.ok) {
    console.error('Failed to send WhatsApp image:', JSON.stringify(data));
    throw new Error(`WhatsApp image send failed: ${data.error?.message || response.statusText}`);
  }

  return data;
}

// The 4 menu page images, in the order they should be sent.
const MENU_IMAGE_FILENAMES = [
  'menu-1-oriental-pizza.png',
  'menu-2-fatir.png',
  'menu-3-foul-falafel.png',
  'menu-4-pizza-pasta-crepe.png',
];

// Cache of filename -> media_id, so we only upload each image to Meta once
// per server run instead of re-uploading every time a customer asks for the menu.
const menuMediaIdCache = {};

async function getOrUploadMenuMediaId(filename) {
  if (menuMediaIdCache[filename]) {
    return menuMediaIdCache[filename];
  }
  const filePath = path.join(__dirname, '..', 'assets', 'menu', filename);
  const mediaId = await uploadMedia(filePath);
  menuMediaIdCache[filename] = mediaId;
  return mediaId;
}

/**
 * Sends all menu page images to a customer, in order, one after another.
 */
async function sendMenuImages(to) {
  for (const filename of MENU_IMAGE_FILENAMES) {
    const mediaId = await getOrUploadMenuMediaId(filename);
    await sendImageMessage(to, mediaId);
  }
}

module.exports = { sendTextMessage, sendImageMessage, sendMenuImages };

