const { Router } = require('express');
const pool = require('../db');
const { authenticate, authorize } = require('../middleware/auth');

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

module.exports = router;
