require('dotenv').config();
const express = require('express');
const webhookRouter = require('./routes/webhook');
const supabase = require('./services/supabase');

const app = express();

// Quick connectivity check on startup - just counts rows in `categories`.
// This isn't used anywhere else; it's only here so the server logs tell us
// immediately if the Supabase credentials are wrong, instead of us finding
// out later when a customer's order silently fails.
async function checkSupabaseConnection() {
  const { count, error } = await supabase
    .from('categories')
    .select('*', { count: 'exact', head: true });

  if (error) {
    console.error('Supabase connection check failed:', error.message);
  } else {
    console.log(`Supabase connected - found ${count} categories.`);
  }
}
checkSupabaseConnection();

app.use(express.json());

app.use('/', webhookRouter);

app.get('/', (req, res) => {
  res.send('El-Wensh AI bot is running');
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server listening on port ${PORT}`);
});
