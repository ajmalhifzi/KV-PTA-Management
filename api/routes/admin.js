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
  const { rows } = await pool.query(`
    SELECT u.id, u.email, u.full_name, u.created_at,
           tsa.group_id, g.group_name, t.full_name AS teacher_name
    FROM users u
    LEFT JOIN teacher_student_assignments tsa ON tsa.student_id = u.id
    LEFT JOIN groups g ON g.id = tsa.group_id
    LEFT JOIN users t ON t.id = g.teacher_id
    WHERE u.role = 'student'
    ORDER BY u.full_name
  `);
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
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  } catch (err) {
    res.status(500).json({ error: 'Bulk assignment failed' });
  }
});

router.get('/groups', async (req, res) => {
  const { rows } = await pool.query(`
    SELECT g.id, g.group_name, g.teacher_id, g.created_at,
           u.full_name AS teacher_name,
           COUNT(tsa.student_id)::int AS student_count,
           COALESCE(
             json_agg(json_build_object('id', s.id, 'full_name', s.full_name, 'email', s.email))
             FILTER (WHERE s.id IS NOT NULL),
             '[]'
           ) AS students
    FROM groups g
    JOIN users u ON u.id = g.teacher_id
    LEFT JOIN teacher_student_assignments tsa ON tsa.group_id = g.id
    LEFT JOIN users s ON s.id = tsa.student_id
    GROUP BY g.id, g.group_name, g.teacher_id, g.created_at, u.full_name
    ORDER BY g.created_at DESC
  `);
  res.json(rows);
});

router.post('/groups', async (req, res) => {
  const { group_name, teacher_id } = req.body;
  if (!group_name || !teacher_id)
    return res.status(400).json({ error: 'group_name and teacher_id required' });

  const { rows } = await pool.query(
    'INSERT INTO groups (group_name, teacher_id) VALUES ($1, $2) RETURNING *',
    [group_name, teacher_id]
  );
  res.status(201).json(rows[0]);
});

router.delete('/groups/:id', async (req, res) => {
  const { id } = req.params;
  const { rowCount } = await pool.query('DELETE FROM groups WHERE id = $1', [id]);
  if (!rowCount) return res.status(404).json({ error: 'Group not found' });
  res.json({ message: 'Group deleted' });
});

router.get('/groups/:id/students', async (req, res) => {
  const { rows } = await pool.query(`
    SELECT u.id, u.email, u.full_name
    FROM teacher_student_assignments tsa
    JOIN users u ON u.id = tsa.student_id
    WHERE tsa.group_id = $1
    ORDER BY u.full_name
  `, [req.params.id]);
  res.json(rows);
});

router.post('/groups/:id/students', async (req, res) => {
  const { id } = req.params;
  const { student_ids } = req.body;
  if (!Array.isArray(student_ids))
    return res.status(400).json({ error: 'student_ids array required' });

  const group = await pool.query('SELECT * FROM groups WHERE id = $1', [id]);
  if (!group.rows.length) return res.status(404).json({ error: 'Group not found' });

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    // Remove students from this group
    await client.query('UPDATE teacher_student_assignments SET group_id = NULL WHERE group_id = $1', [id]);
    // Clear group_id from their projects
    await client.query("UPDATE projects SET group_id = NULL WHERE group_id = $1 AND status = 'draft'", [id]);
    // Add new students
    for (const student_id of student_ids) {
      await client.query(
        `INSERT INTO teacher_student_assignments (teacher_id, student_id, group_id)
         VALUES ($1, $2, $3)
         ON CONFLICT (student_id) DO UPDATE SET teacher_id = $1, group_id = $3`,
        [group.rows[0].teacher_id, student_id, id]
      );
      // Projects are now per-group, no need to update student_id
    }
    await client.query('COMMIT');
    res.json({ message: `${student_ids.length} students assigned to group` });
  } catch (err) {
    await client.query('ROLLBACK');
    res.status(500).json({ error: 'Failed to assign students' });
  } finally {
    client.release();
  }
});

router.get('/overview', async (req, res) => {
  const [users, projects, teachers, groups] = await Promise.all([
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
    pool.query("SELECT COUNT(*)::int FROM groups"),
  ]);
  res.json({
    user_stats: users.rows,
    project_stats: projects.rows,
    teachers: teachers.rows,
    group_count: groups.rows[0].count,
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
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  } catch (err) {
    res.status(500).json({ error: 'Seeding failed' });
  }
});

router.get('/uploads', async (req, res) => {
  const { rows } = await pool.query(`
    SELECT pu.id, pu.project_id, pu.student_id, pu.teacher_id, pu.file_name, pu.file_type, pu.category, pu.uploaded_at,
           CASE WHEN pu.student_id IS NOT NULL THEN u.full_name ELSE ut.full_name END AS uploader_name
    FROM project_uploads pu
    LEFT JOIN users u ON u.id = pu.student_id
    LEFT JOIN users ut ON ut.id = pu.teacher_id
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
  if (rows[0].file_url) try { await deleteFromSupabase(rows[0].file_url); } catch {}
  res.json({ message: 'Upload deleted' });
});

router.get('/resources', async (req, res) => {
  const { rows } = await pool.query(`
    SELECT rf.id, rf.teacher_id, rf.title, rf.file_type, rf.created_at, u.full_name AS teacher_name
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
  if (rows[0].file_url) try { await deleteFromSupabase(rows[0].file_url); } catch {}
  res.json({ message: 'Resource deleted' });
});

router.get('/github-activity', async (req, res) => {
  const [connectedCount, linkedCount, activityCount, teacherCount, connections, events] = await Promise.all([
    pool.query('SELECT COUNT(*)::int FROM github_connections'),
    pool.query("SELECT COUNT(*)::int FROM projects WHERE github_repo_url IS NOT NULL"),
    pool.query(`
      SELECT COUNT(*)::int FROM notifications
      WHERE type = 'upload' AND title LIKE 'New Commits%'
        AND created_at > NOW() - INTERVAL '7 days'
    `),
    pool.query(`
      SELECT COUNT(DISTINCT g.teacher_id)::int AS count
      FROM notifications n
      JOIN teacher_student_assignments tsa ON tsa.student_id = n.user_id
      JOIN groups g ON g.id = tsa.group_id
      WHERE n.type = 'comment' AND n.title = 'New Comment on Commit'
    `),
    pool.query(`
      SELECT u.id AS student_id, u.full_name, u.email,
             gc.github_username, gc.created_at AS connected_at,
             p.title AS project_title, p.github_repo_url,
             p.updated_at AS repo_updated_at,
             g.group_name, t.full_name AS teacher_name
      FROM github_connections gc
      JOIN users u ON u.id = gc.user_id
      LEFT JOIN teacher_student_assignments tsa ON tsa.student_id = u.id
      LEFT JOIN groups g ON g.id = tsa.group_id
      LEFT JOIN projects p ON p.group_id = g.id
      LEFT JOIN users t ON t.id = g.teacher_id
      ORDER BY gc.created_at DESC
    `),
    pool.query(`
      SELECT n.type, n.title, n.message, n.created_at,
             COALESCE(g.group_name, '(unknown)') AS group_name,
             COALESCE(p.title, '(unknown)') AS project_title,
             COALESCE(t.full_name, '(unknown)') AS teacher_name
      FROM notifications n
      LEFT JOIN teacher_student_assignments tsa ON
        ((n.type = 'comment') AND tsa.student_id = n.user_id)
        OR ((n.type IN ('project_status', 'upload')) AND tsa.teacher_id = n.user_id)
      LEFT JOIN groups g ON g.id = tsa.group_id
      LEFT JOIN projects p ON p.group_id = g.id
      LEFT JOIN users t ON t.id = g.teacher_id
      WHERE n.type IN ('project_status', 'upload', 'comment')
        AND ((n.type = 'project_status' AND n.title = 'GitHub Repo Linked')
          OR (n.type = 'upload' AND n.title LIKE 'New Commits%')
          OR (n.type = 'comment' AND n.title = 'New Comment on Commit'))
      ORDER BY n.created_at DESC
      LIMIT 50
    `),
  ]);

  res.json({
    summary: {
      connected_students: connectedCount.rows[0].count,
      linked_repos: linkedCount.rows[0].count,
      active_last_7d: activityCount.rows[0].count,
      teachers_with_engagement: teacherCount.rows[0].count,
    },
    connections: connections.rows,
    recent_events: events.rows,
  });
});

module.exports = router;
