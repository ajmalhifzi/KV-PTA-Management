const { Router } = require('express');
const pool = require('../db');
const { authenticate, authorize } = require('../middleware/auth');
const { uploadToSupabase, sanitizeFileName } = require('../storage');

const router = Router();
router.use(authenticate, authorize('student'));

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
  const { file_name, file_url, file_data, category } = req.body;
  if (!file_name) return res.status(400).json({ error: 'file_name required' });
  if (!file_url && !file_data) return res.status(400).json({ error: 'file_url or file_data required' });

  const project = await pool.query(
    'SELECT id FROM projects WHERE student_id = $1',
    [req.user.id]
  );
  if (!project.rows.length) return res.status(404).json({ error: 'No project found' });

  let finalUrl = file_url;
  if (file_data) {
    const safeName = sanitizeFileName(file_name);
    try {
      finalUrl = await uploadToSupabase(safeName, file_data);
    } catch (err) {
      return res.status(500).json({ error: 'File upload to storage failed: ' + err.message });
    }
  }

  const { rows } = await pool.query(
    'INSERT INTO project_uploads (project_id, student_id, file_name, file_url, category) VALUES ($1, $2, $3, $4, $5) RETURNING *',
    [project.rows[0].id, req.user.id, file_name, finalUrl, category || 'supplementary']
  );
  res.status(201).json(rows[0]);
});

router.get('/resources', async (req, res) => {
  const { rows } = await pool.query(`
    SELECT rf.* FROM resource_files rf
    JOIN teacher_student_assignments tsa ON tsa.teacher_id = rf.teacher_id
    JOIN projects p ON p.student_id = tsa.student_id
    WHERE p.student_id = $1
    ORDER BY rf.created_at DESC
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
