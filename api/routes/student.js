const { Router } = require('express');
const pool = require('../db');
const { authenticate, authorize } = require('../middleware/auth');


const router = Router();
router.use(authenticate, authorize('student'));

router.get('/group', async (req, res) => {
  const { rows } = await pool.query(`
    SELECT g.*, u.full_name AS teacher_name, u.email AS teacher_email,
           p.id AS project_id, p.title, p.objective, p.purpose, p.scope, p.status, p.submitted_at
    FROM teacher_student_assignments tsa
    JOIN groups g ON g.id = tsa.group_id
    JOIN users u ON u.id = g.teacher_id
    LEFT JOIN projects p ON p.student_id = tsa.student_id
    WHERE tsa.student_id = $1
  `, [req.user.id]);
  if (!rows.length) return res.status(404).json({ error: 'No group assigned' });
  res.json(rows[0]);
});

router.put('/group', async (req, res) => {
  const { group_name, title, objective, purpose, scope } = req.body;

  if (!group_name && !title && !objective && !purpose && !scope)
    return res.status(400).json({ error: 'Nothing to update' });

  const assignment = await pool.query(`
    SELECT g.id AS group_id FROM teacher_student_assignments tsa
    JOIN groups g ON g.id = tsa.group_id
    WHERE tsa.student_id = $1
  `, [req.user.id]);
  if (!assignment.rows.length) return res.status(404).json({ error: 'No group assigned' });

  const groupId = assignment.rows[0].group_id;

  if (group_name) {
    await pool.query('UPDATE groups SET group_name = $1 WHERE id = $2', [group_name, groupId]);
  }

  if (title || objective || purpose || scope) {
    const project = await pool.query(
      'SELECT id FROM projects WHERE student_id = $1',
      [req.user.id]
    );
    if (project.rows.length) {
      const fields = []; const vals = []; let idx = 1;
      if (title) { fields.push(`title = $${idx++}`); vals.push(title); }
      if (objective) { fields.push(`objective = $${idx++}`); vals.push(objective); }
      if (purpose) { fields.push(`purpose = $${idx++}`); vals.push(purpose); }
      if (scope) { fields.push(`scope = $${idx++}`); vals.push(scope); }
      fields.push(`updated_at = NOW()`);
      vals.push(req.user.id);
      await pool.query(
        `UPDATE projects SET ${fields.join(', ')} WHERE student_id = $${idx}`,
        vals
      );
    } else if (title) {
      await pool.query(
        'INSERT INTO projects (student_id, group_id, title, objective, purpose, scope, status) VALUES ($1, $2, $3, $4, $5, $6, $7)',
        [req.user.id, groupId, title, objective || '', purpose || '', scope || '', 'draft']
      );
    }
  }

  const updated = await pool.query(`
    SELECT g.group_name, p.id AS project_id, p.title, p.objective, p.purpose, p.scope, p.status
    FROM groups g
    JOIN teacher_student_assignments tsa ON tsa.group_id = g.id AND tsa.student_id = $1
    LEFT JOIN projects p ON p.student_id = tsa.student_id
    WHERE g.id = $2
  `, [req.user.id, groupId]);
  res.json(updated.rows[0] || { group_name });
});

router.get('/project', async (req, res) => {
  const { rows } = await pool.query(
    'SELECT * FROM projects WHERE student_id = $1',
    [req.user.id]
  );
  if (!rows.length) return res.status(404).json({ error: 'No project found. Submit your idea first.' });
  res.json(rows[0]);
});

router.put('/project', async (req, res) => {
  const { title, objective, purpose, scope } = req.body;
  if (!title || !objective || !purpose || !scope)
    return res.status(400).json({ error: 'All fields required: title, objective, purpose, scope' });

  const { rows } = await pool.query(`
    INSERT INTO projects (student_id, title, objective, purpose, scope, status)
    VALUES ($1, $2, $3, $4, $5, 'draft')
    ON CONFLICT (student_id) DO UPDATE SET
      title = $2, objective = $3, purpose = $4, scope = $5, updated_at = NOW()
    RETURNING *
  `, [req.user.id, title, objective, purpose, scope]);
  res.json(rows[0]);
});

router.post('/project/submit', async (req, res) => {
  const { rowCount, rows } = await pool.query(
    'UPDATE projects SET status = $1, submitted_at = NOW(), updated_at = NOW() WHERE student_id = $2 AND status = $3 RETURNING *',
    ['submitted', req.user.id, 'draft']
  );
  if (!rowCount) return res.status(400).json({ error: 'No draft project to submit, or already submitted' });
  res.json(rows[0]);
});

router.get('/comments', async (req, res) => {
  const { rows } = await pool.query(`
    SELECT c.*, u.full_name AS author_name, u.role AS author_role
    FROM comments c
    JOIN projects p ON p.id = c.project_id
    JOIN users u ON u.id = c.author_id
    WHERE p.student_id = $1
    ORDER BY c.created_at ASC
  `, [req.user.id]);
  res.json(rows);
});

router.post('/comments', async (req, res) => {
  const { content } = req.body;
  if (!content) return res.status(400).json({ error: 'Content required' });

  const project = await pool.query(
    'SELECT id FROM projects WHERE student_id = $1',
    [req.user.id]
  );
  if (!project.rows.length) return res.status(404).json({ error: 'No project found' });

  const { rows } = await pool.query(
    'INSERT INTO comments (project_id, author_id, content) VALUES ($1, $2, $3) RETURNING *',
    [project.rows[0].id, req.user.id, content]
  );
  res.status(201).json(rows[0]);
});

router.get('/uploads', async (req, res) => {
  const { rows } = await pool.query(`
    SELECT pu.* FROM project_uploads pu
    JOIN projects p ON p.id = pu.project_id
    WHERE p.student_id = $1
    ORDER BY pu.uploaded_at DESC
  `, [req.user.id]);
  res.json(rows);
});

router.post('/uploads', async (req, res) => {
  const { file_name, file_data, category } = req.body;
  if (!file_name) return res.status(400).json({ error: 'file_name required' });
  if (!file_data) return res.status(400).json({ error: 'file_data required' });

  const project = await pool.query(
    'SELECT id FROM projects WHERE student_id = $1',
    [req.user.id]
  );
  if (!project.rows.length) return res.status(404).json({ error: 'No project found' });

  const { rows } = await pool.query(
    'INSERT INTO project_uploads (project_id, student_id, file_name, file_data, category) VALUES ($1, $2, $3, $4, $5) RETURNING *',
    [project.rows[0].id, req.user.id, file_name, file_data, category || 'supplementary']
  );
  res.status(201).json(rows[0]);
});

router.get('/resources', async (req, res) => {
  const { rows } = await pool.query(`
    SELECT rf.*, u.full_name AS teacher_name FROM resource_files rf
    JOIN teacher_student_assignments tsa ON tsa.teacher_id = rf.teacher_id AND tsa.student_id = $1
    JOIN users u ON u.id = rf.teacher_id
    ORDER BY rf.created_at DESC
  `, [req.user.id]);
  res.json(rows);
});

router.get('/teacher-uploads', async (req, res) => {
  const { rows } = await pool.query(`
    SELECT pu.*, u.full_name AS teacher_name
    FROM project_uploads pu
    JOIN projects p ON p.id = pu.project_id
    JOIN users u ON u.id = pu.teacher_id
    WHERE p.student_id = $1
    ORDER BY pu.uploaded_at DESC
  `, [req.user.id]);
  res.json(rows);
});

router.get('/teacher', async (req, res) => {
  const { rows } = await pool.query(`
    SELECT u.id, u.email, u.full_name
    FROM teacher_student_assignments tsa
    JOIN users u ON u.id = tsa.teacher_id
    WHERE tsa.student_id = $1
  `, [req.user.id]);
  if (!rows.length) return res.status(404).json({ error: 'No teacher assigned' });
  res.json(rows[0]);
});

module.exports = router;
