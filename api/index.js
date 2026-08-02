if (process.env.NODE_ENV !== 'production') require('dotenv').config({ path: require('path').resolve(__dirname, '../.env') });

const path = require('path');
const express = require('express');
const cors = require('cors');
const fs = require('fs');
const pool = require('./db');

const app = express();

const clientPath = path.resolve(__dirname, '../client');

app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.text({ limit: '50mb', type: 'text/plain' }));

app.options('/{*path}', (req, res) => {
  res.sendStatus(204);
});

app.get('/api/config/public', (req, res) => {
  res.json({
    supabaseUrl: process.env.SUPABASE_URL,
    supabaseAnonKey: process.env.SUPABASE_ANON_KEY,
  });
});

app.get('/api/files/uploads/:id', async (req, res) => {
  try {
    const { rows } = await pool.query(
      'SELECT file_data, file_name, file_type FROM project_uploads WHERE id = $1',
      [req.params.id]
    );
    if (!rows.length) return res.status(404).json({ error: 'File not found' });
    const { file_data, file_name, file_type } = rows[0];
    if (!file_data) return res.status(404).json({ error: 'File data not available' });
    const buf = Buffer.from(file_data, 'base64');
    res.set('Content-Disposition', 'inline; filename="' + file_name + '"');
    res.set('Content-Type', file_type || 'application/octet-stream');
    res.send(buf);
  } catch (err) {
    res.status(500).json({ error: 'Failed to serve file' });
  }
});

app.get('/api/files/photos/:id', async (req, res) => {
  try {
    const { rows } = await pool.query(
      'SELECT file_data, file_type FROM project_photos WHERE id = $1',
      [req.params.id]
    );
    if (!rows.length) return res.status(404).json({ error: 'Photo not found' });
    const { file_data, file_type } = rows[0];
    if (!file_data) return res.status(404).json({ error: 'Photo data not available' });
    const buf = Buffer.from(file_data, 'base64');
    res.set('Cache-Control', 'private, max-age=3600');
    res.set('Content-Type', file_type || 'image/jpeg');
    res.send(buf);
  } catch (err) {
    res.status(500).json({ error: 'Failed to serve photo' });
  }
});

app.get('/api/files/resources/:id', async (req, res) => {
  try {
    const { rows } = await pool.query(
      'SELECT file_data, title, file_type FROM resource_files WHERE id = $1',
      [req.params.id]
    );
    if (!rows.length) return res.status(404).json({ error: 'File not found' });
    const { file_data, title, file_type } = rows[0];
    if (!file_data) return res.status(404).json({ error: 'File data not available' });
    const buf = Buffer.from(file_data, 'base64');
    res.set('Content-Disposition', 'inline; filename="' + title + '"');
    res.set('Content-Type', file_type || 'application/octet-stream');
    res.send(buf);
  } catch (err) {
    res.status(500).json({ error: 'Failed to serve file' });
  }
});

app.get('/api/health', async (req, res) => {
  try {
    await pool.query('SELECT 1');
    res.json({ status: 'ok', db: 'connected' });
  } catch {
    res.status(503).json({ status: 'error', db: 'disconnected' });
  }
});

app.use('/api/auth', require('./routes/auth'));
app.use('/api/admin', require('./routes/admin'));
app.use('/api/teacher', require('./routes/teacher'));
app.use('/api/student', require('./routes/student'));
app.use('/api/notifications', require('./routes/notifications'));
app.use('/api/github', require('./routes/github'));

app.use(express.static(clientPath));

app.get('/{*path}', (req, res) => {
  const filePath = path.join(clientPath, req.path === '/' ? 'index.html' : req.path);
  if (fs.existsSync(filePath)) return res.sendFile(filePath);
  res.sendFile(path.join(clientPath, 'index.html'));
});

app.use((err, req, res, next) => {
  console.error('Unhandled error:', err);
  res.status(err.status || 500).json({ error: err.message || 'Internal server error' });
});

module.exports = app;
