const { Router } = require('express');
const pool = require('../db');
const { authenticate } = require('../middleware/auth');

const router = Router();
router.use(authenticate);

async function createNotification({ userId, type, title, message, relatedUrl }) {
  try {
    const existing = await pool.query(
      `SELECT id FROM notifications
       WHERE user_id = $1 AND type = $2 AND title = $3
         AND (message = $4 OR ($4 IS NULL AND message IS NULL))
         AND is_read = false
       LIMIT 1`,
      [userId, type, title, message || null]
    );
    if (existing.rows.length) return;
    await pool.query(
      `INSERT INTO notifications (user_id, type, title, message, related_url)
       VALUES ($1, $2, $3, $4, $5)`,
      [userId, type, title, message || null, relatedUrl || null]
    );
  } catch (err) {
    console.error('Failed to create notification:', err.message);
  }
}

router.get('/', async (req, res) => {
  const { rows } = await pool.query(
    `SELECT id, type, title, message, related_url, is_read, created_at
     FROM notifications
     WHERE user_id = $1
     ORDER BY created_at DESC
     LIMIT 50`,
    [req.user.id]
  );
  res.json(rows);
});

router.get('/unread-count', async (req, res) => {
  const { rows } = await pool.query(
    `SELECT COUNT(*)::int AS count FROM notifications
     WHERE user_id = $1 AND is_read = false`,
    [req.user.id]
  );
  res.json({ count: rows[0].count });
});

router.patch('/:id/read', async (req, res) => {
  const { rowCount } = await pool.query(
    `UPDATE notifications SET is_read = true
     WHERE id = $1 AND user_id = $2`,
    [req.params.id, req.user.id]
  );
  if (!rowCount) return res.status(404).json({ error: 'Notification not found' });
  res.json({ ok: true });
});

router.put('/read-all', async (req, res) => {
  await pool.query(
    `UPDATE notifications SET is_read = true
     WHERE user_id = $1 AND is_read = false`,
    [req.user.id]
  );
  res.json({ ok: true });
});

module.exports = router;
module.exports.createNotification = createNotification;
