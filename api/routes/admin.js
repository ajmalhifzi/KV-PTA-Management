const { Router } = require('express');
const bcrypt = require('bcrypt');
const pool = require('../db');
const { authenticate, authorize } = require('../middleware/auth');
const { deleteFromSupabase } = require('../storage');

const router = Router();
router.use(authenticate, authorize('admin'));

router.get('/users', async (req, res) => {
  const { rows } = await pool.query(
    'SELECT id, email, full_name, role, created_at FROM users ORDER BY created_at'
  );
  res.json(rows);
});

router.get('/teachers', async (req, res) => {
  const { rows } = await pool.query(
    "SELECT id, email, full_name, created_at FROM users WHERE role = 'teacher' ORDER BY full_name"
  );
  res.json(rows);
});

router.get('/students', async (req, res) => {
  const { rows } = await pool.query(
    "SELECT id, email, full_name, created_at FROM users WHERE role = 'student' ORDER BY full_name"
  );
  res.json(rows);
});

router.put('/users/:id', async (req, res) => {
  const { id } = req.params;
  const { email, full_name, role, password } = req.body;

  const fields = [];
  const values = [];
  let idx = 1;

  if (email) { fields.push(`email = $${idx++}`); values.push(email); }
  if (full_name) { fields.push(`full_name = $${idx++}`); values.push(full_name); }
  if (role) {
    if (!['admin', 'teacher', 'student'].includes(role))
      return res.status(400).json({ error: 'Invalid role' });
    fields.push(`role = $${idx++}`);
    values.push(role);
  }
  if (password) {
    const password_hash = await bcrypt.hash(password, 10);
    fields.push(`password_hash = $${idx++}`);
    values.push(password_hash);
  }

  if (!fields.length) return res.status(400).json({ error: 'No fields to update' });

  values.push(id);
  const { rowCount, rows } = await pool.query(
    `UPDATE users SET ${fields.join(', ')} WHERE id = $${idx} RETURNING id, email, full_name, role, created_at`,
    values
  );

  if (!rowCount) return res.status(404).json({ error: 'User not found' });
  res.json(rows[0]);
});

router.delete('/users/:id', async (req, res) => {
  const { id } = req.params;
  const { rowCount } = await pool.query('DELETE FROM users WHERE id = $1', [id]);
  if (!rowCount) return res.status(404).json({ error: 'User not found' });
  res.json({ message: 'User deleted' });
});

router.post('/assign', async (req, res) => {
  const { student_id, teacher_id } = req.body;
  if (!student_id || !teacher_id)
    return res.status(400).json({ error: 'Missing student_id or teacher_id' });

  try {
    await pool.query(
      'INSERT INTO teacher_student_assignments (teacher_id, student_id) VALUES ($1, $2) ON CONFLICT (student_id) DO UPDATE SET teacher_id = $1',
      [teacher_id, student_id]
    );
    res.json({ message: 'Assigned successfully' });
  } catch (err) {
    res.status(500).json({ error: 'Assignment failed' });
  }
});

router.post('/assign-bulk', async (req, res) => {
  const { assignments } = req.body;
  if (!Array.isArray(assignments) || !assignments.length)
    return res.status(400).json({ error: 'Assignments array required' });

  try {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      for (const { student_id, teacher_id } of assignments) {
        await client.query(
          'INSERT INTO teacher_student_assignments (teacher_id, student_id) VALUES ($1, $2) ON CONFLICT (student_id) DO UPDATE SET teacher_id = $1',
          [teacher_id, student_id]
        );
      }
      await client.query('COMMIT');
      res.json({ message: `${assignments.length} assignments saved` });
    } catch {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  } catch {
    res.status(500).json({ error: 'Bulk assignment failed' });
  }
});

router.get('/overview', async (req, res) => {
  const [users, projects, teachers] = await Promise.all([
    pool.query("SELECT role, COUNT(*)::int FROM users GROUP BY role"),
    pool.query("SELECT status, COUNT(*)::int FROM projects GROUP BY status"),
    pool.query(`
      SELECT u.id, u.full_name, COUNT(DISTINCT tsa.student_id)::int AS student_count
      FROM users u
      LEFT JOIN teacher_student_assignments tsa ON u.id = tsa.teacher_id
      WHERE u.role = 'teacher'
      GROUP BY u.id, u.full_name
      ORDER BY u.full_name
    `),
  ]);
  res.json({
    user_stats: users.rows,
    project_stats: projects.rows,
    teachers: teachers.rows,
  });
});

router.get('/error-logs', async (req, res) => {
  const { rows } = await pool.query(
    'SELECT * FROM error_logs ORDER BY created_at DESC LIMIT 100'
  );
  res.json(rows);
});

router.post('/seed-fyp', async (req, res) => {
  const { data } = req.body;
  if (!Array.isArray(data) || !data.length)
    return res.status(400).json({ error: 'Data array required' });

  try {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query('DELETE FROM old_fyp_data');
      for (const item of data) {
        await client.query(
          'INSERT INTO old_fyp_data (title, objective, purpose, scope, keywords, category) VALUES ($1, $2, $3, $4, $5, $6)',
          [item.title, item.objective, item.purpose, item.scope, item.keywords || [], item.category || null]
        );
      }
      await client.query('COMMIT');
      res.json({ message: `${data.length} records seeded` });
    } catch {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  } catch {
    res.status(500).json({ error: 'Seeding failed' });
  }
});

router.get('/uploads', async (req, res) => {
  const { rows } = await pool.query(`
    SELECT pu.*, u.full_name AS student_name, u.email AS student_email
    FROM project_uploads pu
    JOIN users u ON u.id = pu.student_id
    ORDER BY pu.uploaded_at DESC
  `);
  res.json(rows);
});

router.delete('/uploads/:id', async (req, res) => {
  const { id } = req.params;
  const { rows } = await pool.query(
    'DELETE FROM project_uploads WHERE id = $1 RETURNING file_url',
    [id]
  );
  if (!rows.length) return res.status(404).json({ error: 'Upload not found' });
  try { await deleteFromSupabase(rows[0].file_url); } catch {}
  res.json({ message: 'Upload deleted' });
});

router.get('/resources', async (req, res) => {
  const { rows } = await pool.query(`
    SELECT rf.*, u.full_name AS teacher_name
    FROM resource_files rf
    JOIN users u ON u.id = rf.teacher_id
    ORDER BY rf.created_at DESC
  `);
  res.json(rows);
});

router.delete('/resources/:id', async (req, res) => {
  const { id } = req.params;
  const { rows } = await pool.query(
    'DELETE FROM resource_files WHERE id = $1 RETURNING file_url',
    [id]
  );
  if (!rows.length) return res.status(404).json({ error: 'Resource not found' });
  try { await deleteFromSupabase(rows[0].file_url); } catch {}
  res.json({ message: 'Resource deleted' });
});

module.exports = router;
