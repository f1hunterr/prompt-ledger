const path = require('path');
const express = require('express');
const routes = require('./src/routes');

const app = express();
app.use(express.json({ limit: '1mb' }));
app.use(routes);
app.use(express.static(path.join(__dirname, 'public')));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Prompt Ledger server listening on port ${PORT}`);
});
