const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.warn(
    'SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY is missing - Supabase calls will fail until these are set.'
  );
}

// We use the service_role key (not the public anon key) because this code
// runs only on our own server, never in a browser - it needs full read/write
// access to the database without Row Level Security getting in the way.
const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

module.exports = supabase;
