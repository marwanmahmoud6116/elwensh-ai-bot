const supabase = require('./supabase');

/**
 * Default state for a brand new customer: no conversation yet, and an
 * empty draft order following the full stage-based flow (items -> confirm
 * items -> delivery/pickup -> collect info -> confirm -> complete).
 */
const DEFAULT_STATE = {
  history: [], // [{ role: 'user'|'assistant', content: '...' }, ...]
  items: [], // [{ name_ar, size_name, quantity }, ...]
  itemsConfirmed: false,
  fulfillmentType: null, // 'delivery' | 'pickup'
  customerName: null,
  customerAddress: null,
  customerPhone: null,
  customerZone: null,
  fulfillmentConfirmed: false,
  status: 'in_progress', // 'in_progress' | 'confirmed'
};

/**
 * Looks up a session by phone number. If none exists yet (first message
 * ever from this customer, or their old session was cleared), creates a
 * fresh one with default state and returns that instead.
 */
async function getOrCreateSession(phone) {
  const { data: existing, error: fetchError } = await supabase
    .from('sessions')
    .select('*')
    .eq('phone', phone)
    .maybeSingle();

  if (fetchError) {
    throw new Error(`Failed to fetch session for ${phone}: ${fetchError.message}`);
  }

  if (existing) {
    return existing;
  }

  const { data: created, error: insertError } = await supabase
    .from('sessions')
    .insert({ phone, state: DEFAULT_STATE })
    .select()
    .single();

  if (insertError) {
    throw new Error(`Failed to create session for ${phone}: ${insertError.message}`);
  }

  return created;
}

/**
 * Overwrites a session's state (and bumps updated_at via Supabase's
 * default). Call this after each step of the conversation so the next
 * incoming message picks up where the customer left off.
 */
async function updateSessionState(phone, newState) {
  const { data, error } = await supabase
    .from('sessions')
    .update({ state: newState, updated_at: new Date().toISOString() })
    .eq('phone', phone)
    .select()
    .single();

  if (error) {
    throw new Error(`Failed to update session for ${phone}: ${error.message}`);
  }

  return data;
}

module.exports = { getOrCreateSession, updateSessionState };
