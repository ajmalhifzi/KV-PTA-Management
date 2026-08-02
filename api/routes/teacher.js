const { Router } = require('express');
const pool = require('../db');
const { authenticate, authorize } = require('../middleware/auth');
const { createNotification } = require('./notifications');

const router = Router();
router.use(authenticate, authorize('teacher'));

router.get('/groups', async (req, res) => {
  const { rows } = await pool.query(`
    SELECT g.id, g.group_name, g.created_at,
           p.id AS project_id, p.title, p.status, p.submitted_at, p.updated_at,
           COALESCE(json_agg(
             json_build_object(
               'student_id', u.id, 'email', u.email, 'full_name', u.full_name
             )
             ORDER BY u.full_name
           ) FILTER (WHERE u.id IS NOT NULL), '[]') AS students
    FROM groups g
    LEFT JOIN teacher_student_assignments tsa ON tsa.group_id = g.id
    LEFT JOIN users u ON u.id = tsa.student_id
    LEFT JOIN projects p ON p.group_id = g.id
    WHERE g.teacher_id = $1
    GROUP BY g.id, g.group_name, g.created_at, p.id, p.title, p.status, p.submitted_at, p.updated_at
    ORDER BY g.created_at DESC
  `, [req.user.id]);
  res.json(rows);
});

router.get('/projects', async (req, res) => {
  const { rows } = await pool.query(`
    SELECT p.id, p.title, g.group_name, p.status
    FROM projects p
    JOIN groups g ON g.id = p.group_id
    WHERE g.teacher_id = $1
    ORDER BY p.updated_at DESC
  `, [req.user.id]);
  res.json(rows);
});

router.get('/students', async (req, res) => {
  const { rows } = await pool.query(`
    SELECT u.id AS student_id, p.id AS project_id, u.email, u.full_name, p.title, p.status, p.submitted_at, p.updated_at, g.id AS group_id, g.group_name
    FROM teacher_student_assignments tsa
    JOIN users u ON u.id = tsa.student_id
    JOIN groups g ON g.id = tsa.group_id
    LEFT JOIN projects p ON p.group_id = g.id
    WHERE tsa.teacher_id = $1
    ORDER BY u.full_name
  `, [req.user.id]);
  res.json(rows);
});

router.get('/projects/:projectId', async (req, res) => {
  const { projectId } = req.params;
  const { rows } = await pool.query(`
    SELECT p.*, g.group_name,
           COALESCE(json_agg(
             json_build_object('id', u.id, 'full_name', u.full_name, 'email', u.email)
             ORDER BY u.full_name
           ) FILTER (WHERE u.id IS NOT NULL), '[]') AS students
    FROM projects p
    JOIN groups g ON g.id = p.group_id
    LEFT JOIN teacher_student_assignments tsa ON tsa.group_id = g.id
    LEFT JOIN users u ON u.id = tsa.student_id
    WHERE p.id = $1 AND g.teacher_id = $2
    GROUP BY p.id, g.group_name
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
    FROM groups g
    WHERE p.group_id = g.id AND g.teacher_id = $2 AND p.id = $3
  `, [status, req.user.id, req.params.projectId]);

  if (!rowCount) return res.status(404).json({ error: 'Project not found' });
  res.json({ message: `Status updated to ${status}` });
});

router.get('/projects/:projectId/comments', async (req, res) => {
  const { rows } = await pool.query(`
    SELECT c.*, u.full_name AS author_name, u.role AS author_role
    FROM comments c
    JOIN projects p ON p.id = c.project_id
    JOIN groups g ON g.id = p.group_id
    JOIN users u ON u.id = c.author_id
    WHERE c.project_id = $1 AND g.teacher_id = $2
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
      SELECT 1 FROM projects p
      JOIN groups g ON g.id = p.group_id
      WHERE p.id = $1 AND g.teacher_id = $2
    )
    RETURNING *
  `, [req.params.projectId, req.user.id, content]);

  if (!rows.length) return res.status(404).json({ error: 'Project not found' });

  const { rows: commentStudents } = await pool.query(
    `SELECT tsa.student_id FROM teacher_student_assignments tsa
     JOIN projects p ON p.group_id = tsa.group_id WHERE p.id = $1`,
    [req.params.projectId]
  );
  for (const s of commentStudents) {
    await createNotification({
      userId: s.student_id,
      type: 'comment',
      title: 'New Comment',
      message: content.length > 120 ? content.slice(0, 120) + '...' : content,
      relatedUrl: '/student/projects.html'
    });
  }

  res.status(201).json(rows[0]);
});

router.get('/projects/:projectId/photos', async (req, res) => {
  const { rows } = await pool.query(`
    SELECT ph.id, ph.project_id, ph.uploader_id, ph.caption, ph.file_type, ph.uploaded_at,
           u.full_name AS uploader_name
    FROM project_photos ph
    JOIN projects p ON p.id = ph.project_id
    JOIN groups g ON g.id = p.group_id
    JOIN users u ON u.id = ph.uploader_id
    WHERE ph.project_id = $1 AND g.teacher_id = $2
    ORDER BY ph.uploaded_at ASC
  `, [req.params.projectId, req.user.id]);
  res.json(rows);
});

router.get('/uploads', async (req, res) => {
  const { rows } = await pool.query(`
    SELECT pu.id, pu.project_id, pu.student_id, pu.teacher_id, pu.file_name, pu.file_type, pu.category, pu.uploaded_at,
           CASE WHEN pu.student_id IS NOT NULL THEN u.full_name ELSE ut.full_name END AS uploader_name,
           p.title AS project_title, g.group_name
    FROM project_uploads pu
    JOIN projects p ON p.id = pu.project_id
    JOIN groups g ON g.id = p.group_id
    LEFT JOIN users u ON u.id = pu.student_id
    LEFT JOIN users ut ON ut.id = pu.teacher_id
    WHERE g.teacher_id = $1
    ORDER BY pu.uploaded_at DESC
  `, [req.user.id]);
  res.json(rows);
});

router.post('/upload-for-group', async (req, res) => {
  const { group_id, file_name, file_data, file_type, category } = req.body;
  if (!group_id) return res.status(400).json({ error: 'group_id required' });
  if (!file_name) return res.status(400).json({ error: 'file_name required' });
  if (!file_data) return res.status(400).json({ error: 'file_data required' });

  const group = await pool.query(
    'SELECT id FROM groups WHERE id = $1 AND teacher_id = $2',
    [group_id, req.user.id]
  );
  if (!group.rows.length) return res.status(403).json({ error: 'Group not found or not assigned to you' });

  const project = await pool.query(
    'SELECT id FROM projects WHERE group_id = $1',
    [group_id]
  );
  if (!project.rows.length) return res.status(404).json({ error: 'Group has no project' });

  const { rows } = await pool.query(
    'INSERT INTO project_uploads (project_id, student_id, teacher_id, file_name, file_data, file_type, category) VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *',
    [project.rows[0].id, req.user.id, req.user.id, file_name, file_data, file_type || null, category || 'supplementary']
  );

  const { rows: uploadStudents } = await pool.query(
    'SELECT student_id FROM teacher_student_assignments WHERE group_id = $1',
    [group_id]
  );
  for (const s of uploadStudents) {
    await createNotification({
      userId: s.student_id,
      type: 'upload',
      title: 'New File Uploaded',
      message: 'Your teacher uploaded: ' + file_name,
      relatedUrl: '/student/teacher-uploads.html'
    });
  }

  res.status(201).json(rows[0]);
});

router.get('/resources', async (req, res) => {
  const { rows } = await pool.query(
    'SELECT id, teacher_id, title, file_type, created_at FROM resource_files WHERE teacher_id = $1 ORDER BY created_at DESC',
    [req.user.id]
  );
  res.json(rows);
});

router.post('/resources', async (req, res) => {
  const { title, file_data, file_type } = req.body;
  if (!title) return res.status(400).json({ error: 'Title required' });
  if (!file_data) return res.status(400).json({ error: 'file_data required' });

  const { rows } = await pool.query(
    'INSERT INTO resource_files (teacher_id, title, file_data, file_type) VALUES ($1, $2, $3, $4) RETURNING *',
    [req.user.id, title, file_data, file_type || null]
  );

  const { rows: resourceStudents } = await pool.query(
    'SELECT student_id FROM teacher_student_assignments WHERE teacher_id = $1',
    [req.user.id]
  );
  for (const s of resourceStudents) {
    await createNotification({
      userId: s.student_id,
      type: 'resource',
      title: 'New Resource Available',
      message: 'Your teacher shared: ' + title,
      relatedUrl: '/student/resources.html'
    });
  }

  res.status(201).json(rows[0]);
});

router.get('/meetings', async (req, res) => {
  const { rows } = await pool.query(`
    SELECT ml.*, g.id AS group_id, g.group_name,
           COALESCE(json_agg(
             json_build_object('id', u.id, 'full_name', u.full_name)
             ORDER BY u.full_name
           ) FILTER (WHERE u.id IS NOT NULL), '[]') AS students
    FROM meeting_logs ml
    JOIN projects p ON p.id = ml.project_id
    JOIN groups g ON g.id = p.group_id
    LEFT JOIN teacher_student_assignments tsa ON tsa.group_id = g.id
    LEFT JOIN users u ON u.id = tsa.student_id
    WHERE g.teacher_id = $1
    GROUP BY ml.id, g.id, g.group_name
    ORDER BY ml.meeting_date DESC, ml.created_at DESC
  `, [req.user.id]);
  res.json(rows);
});

router.post('/projects/:projectId/meetings', async (req, res) => {
  const { projectId } = req.params;
  const { meeting_date, notes, action_items, next_meeting } = req.body;
  if (!meeting_date) return res.status(400).json({ error: 'meeting_date required' });
  if (!notes) return res.status(400).json({ error: 'notes required' });

  const { rows } = await pool.query(`
    INSERT INTO meeting_logs (project_id, author_id, meeting_date, notes, action_items, next_meeting)
    SELECT $1, $2, $3, $4, $5, $6
    WHERE EXISTS (
      SELECT 1 FROM projects p
      JOIN groups g ON g.id = p.group_id
      WHERE p.id = $1 AND g.teacher_id = $2
    )
    RETURNING *
  `, [projectId, req.user.id, meeting_date, notes, action_items || null, next_meeting || null]);

  if (!rows.length) return res.status(404).json({ error: 'Project not found' });

  const { rows: meetingStudents } = await pool.query(
    `SELECT tsa.student_id FROM teacher_student_assignments tsa
     JOIN projects p ON p.group_id = tsa.group_id WHERE p.id = $1`,
    [projectId]
  );
  for (const s of meetingStudents) {
    await createNotification({
      userId: s.student_id,
      type: 'meeting',
      title: 'New Meeting Log',
      message: notes.length > 120 ? notes.slice(0, 120) + '...' : notes,
      relatedUrl: '/student/meetings.html'
    });
  }

  res.status(201).json(rows[0]);
});

router.put('/meetings/:id', async (req, res) => {
  const { id } = req.params;
  const { group_id, meeting_date, notes, action_items, next_meeting } = req.body;
  if (!meeting_date) return res.status(400).json({ error: 'meeting_date required' });
  if (!notes) return res.status(400).json({ error: 'notes required' });

  let extraSet = '';
  const params = [meeting_date, notes, action_items || null, next_meeting || null];
  let idx = 5;

  if (group_id) {
    const group = await pool.query(
      'SELECT id FROM groups WHERE id = $1 AND teacher_id = $2',
      [group_id, req.user.id]
    );
    if (!group.rows.length) return res.status(403).json({ error: 'Group not found or not assigned to you' });

    const project = await pool.query(
      'SELECT id FROM projects WHERE group_id = $1',
      [group_id]
    );
    if (!project.rows.length) return res.status(404).json({ error: 'Group has no project' });

    extraSet = ', project_id = $' + (idx++) + ' ';
    params.push(project.rows[0].id);
  }

  params.push(req.user.id, id);

  const { rowCount, rows } = await pool.query(`
    UPDATE meeting_logs ml SET meeting_date = $1, notes = $2, action_items = $3, next_meeting = $4, updated_at = NOW()` + extraSet + `
    FROM projects p
    JOIN groups g ON g.id = p.group_id AND g.teacher_id = $` + (idx++) + `
    WHERE ml.id = $` + (idx) + ` AND ml.project_id = p.id
    RETURNING ml.*
  `, params);

  if (!rowCount) return res.status(404).json({ error: 'Meeting log not found' });
  res.json(rows[0]);
});

router.delete('/meetings/:id', async (req, res) => {
  const { id } = req.params;
  const { rowCount } = await pool.query(`
    DELETE FROM meeting_logs ml USING projects p
    JOIN groups g ON g.id = p.group_id AND g.teacher_id = $1
    WHERE ml.id = $2 AND ml.project_id = p.id
  `, [req.user.id, id]);

  if (!rowCount) return res.status(404).json({ error: 'Meeting log not found' });
  res.json({ message: 'Meeting log deleted' });
});

module.exports = router;
