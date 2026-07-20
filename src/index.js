require('dotenv').config();
const express = require('express');
const webhookRouter = require('./routes/webhook');

const app = express();

app.use(express.json());

app.use('/', webhookRouter);

app.get('/', (req, res) => {
  res.send('El-Wensh AI bot is running');
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server listening on port ${PORT}`);
});
