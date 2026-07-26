const { Router } = require('express');
const pool = require('../db');
const { authenticate, authorize } = require('../middleware/auth');
const { uploadToSupabase, sanitizeFileName } = require('../storage');

const router = Router();
router.use(authenticate, authorize('teacher'));

router.get('/groups', async (req, res) => {
  const { rows } = await pool.query(`
    SELECT g.id, g.group_name, g.created_at,
           COALESCE(json_agg(
             json_build_object(
               'student_id', u.id, 'email', u.email, 'full_name', u.full_name,
               'project_id', p.id, 'title', p.title, 'status', p.status,
               'submitted_at', p.submitted_at, 'updated_at', p.updated_at
             )
             ORDER BY u.full_name
           ) FILTER (WHERE u.id IS NOT NULL), '[]') AS students
    FROM groups g
    LEFT JOIN teacher_student_assignments tsa ON tsa.group_id = g.id
    LEFT JOIN users u ON u.id = tsa.student_id
    LEFT JOIN projects p ON p.student_id = u.id
    WHERE g.teacher_id = $1
    GROUP BY g.id, g.group_name, g.created_at
    ORDER BY g.created_at DESC
  `, [req.user.id]);
  res.json(rows);
});

router.get('/students', async (req, res) => {
  const { rows } = await pool.query(`
    SELECT u.id AS student_id, p.id AS project_id, u.email, u.full_name, p.title, p.status, p.submitted_at, p.updated_at, g.id AS group_id, g.group_name
    FROM teacher_student_assignments tsa
    JOIN users u ON u.id = tsa.student_id
    LEFT JOIN projects p ON p.student_id = u.id
    LEFT JOIN groups g ON g.id = tsa.group_id
    WHERE tsa.teacher_id = $1
    ORDER BY u.full_name
  `, [req.user.id]);
  res.json(rows);
});

router.get('/projects/:projectId', async (req, res) => {
  const { projectId } = req.params;
  const { rows } = await pool.query(`
    SELECT p.*, u.full_name AS student_name, u.email AS student_email
    FROM projects p
    JOIN teacher_student_assignments tsa ON tsa.student_id = p.student_id
    JOIN users u ON u.id = p.student_id
    WHERE p.id = $1 AND tsa.teacher_id = $2
  `, [projectId, req.user.id]);

  if (!rows.length) return res.status(404).json({ error: 'Project not found' });
  res.json(rows[0]);
});

router.patch('/projects/:projectId/status', async (req, res) => {
  const { status } = req.body;
  const validStatuses = ['submitted', 'approved', 'rejected', 'revision'];
  if (!validStatuses.includes(status))
    return res.status(400).json({ error: `Invalid status. Must be one of: ${validStatuses.join(', ')}` });

  const { rowCount } = await pool.query(`
    UPDATE projects p SET status = $1, updated_at = NOW()
    FROM teacher_student_assignments tsa
    WHERE p.id = $2 AND tsa.student_id = p.student_id AND tsa.teacher_id = $3
  `, [status, req.params.projectId, req.user.id]);

  if (!rowCount) return res.status(404).json({ error: 'Project not found' });
  res.json({ message: `Status updated to ${status}` });
});

router.get('/projects/:projectId/comments', async (req, res) => {
  const { rows } = await pool.query(`
    SELECT c.*, u.full_name AS author_name, u.role AS author_role
    FROM comments c
    JOIN teacher_student_assignments tsa ON tsa.student_id = (SELECT student_id FROM projects WHERE id = $1)
    JOIN users u ON u.id = c.author_id
    WHERE c.project_id = $1 AND tsa.teacher_id = $2
    ORDER BY c.created_at ASC
  `, [req.params.projectId, req.user.id]);
  res.json(rows);
});

router.post('/projects/:projectId/comments', async (req, res) => {
  const { content } = req.body;
  if (!content) return res.status(400).json({ error: 'Content required' });

  const { rows } = await pool.query(`
    INSERT INTO comments (project_id, author_id, content)
    SELECT $1, $2, $3
    WHERE EXISTS (
      SELECT 1 FROM teacher_student_assignments tsa
      JOIN projects p ON p.student_id = tsa.student_id
      WHERE p.id = $1 AND tsa.teacher_id = $2
    )
    RETURNING *
  `, [req.params.projectId, req.user.id, content]);

  if (!rows.length) return res.status(404).json({ error: 'Project not found' });
  res.status(201).json(rows[0]);
});

router.get('/resources', async (req, res) => {
  const { rows } = await pool.query(
    'SELECT * FROM resource_files WHERE teacher_id = $1 ORDER BY created_at DESC',
    [req.user.id]
  );
  res.json(rows);
});

router.post('/resources', async (req, res) => {
  const { title, file_url, file_data, file_type } = req.body;
  if (!title) return res.status(400).json({ error: 'Title required' });
  if (!file_url && !file_data) return res.status(400).json({ error: 'file_url or file_data required' });

  let finalUrl = file_url;
  if (file_data) {
    const safeName = sanitizeFileName(title);
    try {
      finalUrl = await uploadToSupabase(safeName, file_data);
    } catch (err) {
      return res.status(500).json({ error: 'File upload to storage failed: ' + err.message });
    }
  }

  const { rows } = await pool.query(
    'INSERT INTO resource_files (teacher_id, title, file_url, file_type) VALUES ($1, $2, $3, $4) RETURNING *',
    [req.user.id, title, finalUrl, file_type || null]
  );
  res.status(201).json(rows[0]);
});

module.exports = router;
