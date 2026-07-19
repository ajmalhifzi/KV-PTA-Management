if (process.env.NODE_ENV !== 'production') require('dotenv').config({ path: require('path').resolve(__dirname, '../.env') });
const express = require('express');
const { Pool } = require('pg');
const cors = require('cors');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
  family: 4
});

const app = express();

app.use(cors({ origin: process.env.FRONTEND_URL || 'http://localhost:3000' }));
app.use(express.json({ limit: '10mb' }));
app.use(express.text({ limit: '10mb', type: 'text/plain' }));

app.options('/{*path}', (req, res) => {
  res.sendStatus(204);
});

app.get('/api/health', async (req, res) => {
  try {
    await pool.query('SELECT 1');
    res.json({ status: 'ok', db: 'connected' });
  } catch {
    res.status(503).json({ status: 'error', db: 'disconnected' });
  }
});

module.exports = app;
