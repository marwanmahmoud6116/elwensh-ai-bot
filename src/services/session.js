const supabase = require('./supabase');

/**
 * Default state for a brand new customer - no messages exchanged yet,
 * empty cart, nothing selected. Shape this however the OpenAI/order logic
 * ends up needing; it's just a JSON blob so it can evolve freely.
 */
const DEFAULT_STATE = {
  step: 'greeting',
  cart: [],
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
