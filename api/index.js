if (process.env.NODE_ENV !== 'production') require('dotenv').config({ path: require('path').resolve(__dirname, '../.env') });

const path = require('path');
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const fs = require('fs');
const pool = require('./db');
const { authenticate } = require('./middleware/auth');

const app = express();

const clientPath = path.resolve(__dirname, '../client');

// Phase 7: Security Headers
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", "'unsafe-inline'"],
      styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
      fontSrc: ["'self'", "https://fonts.gstatic.com"],
      imgSrc: ["'self'", "data:", "blob:", "https:"],
      connectSrc: ["'self'", "https://api.github.com"],
    },
  },
  crossOriginEmbedderPolicy: false,
}));

const defaultOrigins = ['http://localhost:3000', 'http://127.0.0.1:3000', 'http://localhost:4000', 'http://127.0.0.1:4000'];
const allowedOrigins = process.env.FRONTEND_URL
  ? [...process.env.FRONTEND_URL.split(',').map(s => s.trim()), ...defaultOrigins]
  : defaultOrigins;

app.use(cors({
  origin: (origin, callback) => {
    if (!origin || allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      callback(null, false);
    }
  },
  credentials: true,
}));

app.use(express.json({ limit: '15mb' }));
app.use(express.text({ limit: '15mb', type: 'text/plain' }));

app.options('/{*path}', (req, res) => {
  res.sendStatus(204);
});

app.get('/api/config/public', (req, res) => {
  res.json({
    supabaseUrl: process.env.SUPABASE_URL || '',
  });
});

// Phase 4: Protected File Endpoints
app.get('/api/files/uploads/:id', authenticate, async (req, res) => {
  try {
    const { id } = req.params;
    const fileRes = await pool.query(`
      SELECT pu.file_data, pu.file_name, pu.file_type, pu.project_id, g.teacher_id, g.id AS group_id
      FROM project_uploads pu
      JOIN projects p ON p.id = pu.project_id
      JOIN groups g ON g.id = p.group_id
      WHERE pu.id = $1
    `, [id]);

    if (!fileRes.rows.length) return res.status(404).json({ error: 'File not found' });
    const file = fileRes.rows[0];

    // Authorization check
    if (req.user.role === 'admin') {
      // Admin allowed
    } else if (req.user.role === 'teacher') {
      if (file.teacher_id !== req.user.id)
        return res.status(403).json({ error: 'Access denied' });
    } else if (req.user.role === 'student') {
      const studentAssigned = await pool.query(
        'SELECT 1 FROM teacher_student_assignments WHERE student_id = $1 AND group_id = $2',
        [req.user.id, file.group_id]
      );
      if (!studentAssigned.rows.length)
        return res.status(403).json({ error: 'Access denied' });
    } else {
      return res.status(403).json({ error: 'Access denied' });
    }

    if (!file.file_data) return res.status(404).json({ error: 'File data not available' });
    const buf = Buffer.from(file.file_data, 'base64');
    const safeName = (file.file_name || 'download').replace(/[^a-zA-Z0-9._-]/g, '_');
    res.set('Content-Disposition', 'inline; filename="' + safeName + '"');
    res.set('Content-Type', file.file_type || 'application/octet-stream');
    res.send(buf);
  } catch (err) {
    res.status(500).json({ error: 'Failed to serve file' });
  }
});

app.get('/api/files/photos/:id', authenticate, async (req, res) => {
  try {
    const { id } = req.params;
    const photoRes = await pool.query(`
      SELECT ph.file_data, ph.file_type, ph.project_id, g.teacher_id, g.id AS group_id
      FROM project_photos ph
      JOIN projects p ON p.id = ph.project_id
      JOIN groups g ON g.id = p.group_id
      WHERE ph.id = $1
    `, [id]);

    if (!photoRes.rows.length) return res.status(404).json({ error: 'Photo not found' });
    const photo = photoRes.rows[0];

    // Authorization check
    if (req.user.role === 'admin') {
      // Admin allowed
    } else if (req.user.role === 'teacher') {
      if (photo.teacher_id !== req.user.id)
        return res.status(403).json({ error: 'Access denied' });
    } else if (req.user.role === 'student') {
      const studentAssigned = await pool.query(
        'SELECT 1 FROM teacher_student_assignments WHERE student_id = $1 AND group_id = $2',
        [req.user.id, photo.group_id]
      );
      if (!studentAssigned.rows.length)
        return res.status(403).json({ error: 'Access denied' });
    } else {
      return res.status(403).json({ error: 'Access denied' });
    }

    if (!photo.file_data) return res.status(404).json({ error: 'Photo data not available' });
    const buf = Buffer.from(photo.file_data, 'base64');
    res.set('Cache-Control', 'private, max-age=3600');
    res.set('Content-Type', photo.file_type || 'image/jpeg');
    res.send(buf);
  } catch (err) {
    res.status(500).json({ error: 'Failed to serve photo' });
  }
});

app.get('/api/files/resources/:id', authenticate, async (req, res) => {
  try {
    const { id } = req.params;
    const resourceRes = await pool.query(
      'SELECT file_data, title, file_type, teacher_id FROM resource_files WHERE id = $1',
      [id]
    );

    if (!resourceRes.rows.length) return res.status(404).json({ error: 'Resource not found' });
    const resource = resourceRes.rows[0];

    // Authorization check: resource uploader teacher must supervise student's group
    if (req.user.role === 'admin') {
      // Admin allowed
    } else if (req.user.role === 'teacher') {
      if (resource.teacher_id !== req.user.id)
        return res.status(403).json({ error: 'Access denied' });
    } else if (req.user.role === 'student') {
      const studentAssigned = await pool.query(
        'SELECT 1 FROM teacher_student_assignments WHERE student_id = $1 AND teacher_id = $2 AND group_id IS NOT NULL',
        [req.user.id, resource.teacher_id]
      );
      if (!studentAssigned.rows.length)
        return res.status(403).json({ error: 'Access denied' });
    } else {
      return res.status(403).json({ error: 'Access denied' });
    }

    if (!resource.file_data) return res.status(404).json({ error: 'File data not available' });
    const buf = Buffer.from(resource.file_data, 'base64');
    const safeTitle = (resource.title || 'resource').replace(/[^a-zA-Z0-9._-]/g, '_');
    res.set('Content-Disposition', 'inline; filename="' + safeTitle + '"');
    res.set('Content-Type', resource.file_type || 'application/octet-stream');
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
  const status = err.status || 500;
  const message = process.env.NODE_ENV === 'production' ? 'Internal server error' : (err.message || 'Internal server error');
  res.status(status).json({ error: message });
});

module.exports = app;

