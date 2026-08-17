const { Router } = require('express');
const pool = require('../db');
const { authenticate, authorize } = require('../middleware/auth');
const { createNotification } = require('./notifications');

const router = Router();
router.use(authenticate, authorize('student'));

router.get('/projects', async (req, res) => {
  const { rows } = await pool.query(`
    SELECT p.id, p.title, g.group_name, p.status
    FROM projects p
    JOIN groups g ON g.id = p.group_id
    JOIN teacher_student_assignments tsa ON tsa.group_id = g.id
    WHERE tsa.student_id = $1
    ORDER BY p.updated_at DESC
  `, [req.user.id]);
  res.json(rows);
});

router.get('/projects/:projectId', async (req, res) => {
  const { projectId } = req.params;
  const { rows } = await pool.query(`
    SELECT p.*, g.group_name, u.full_name AS teacher_name, u.email AS teacher_email,
           COALESCE(json_agg(
             json_build_object('id', s.id, 'full_name', s.full_name, 'email', s.email)
             ORDER BY s.full_name
           ) FILTER (WHERE s.id IS NOT NULL), '[]') AS students
    FROM projects p
    JOIN groups g ON g.id = p.group_id
    JOIN users u ON u.id = g.teacher_id
    LEFT JOIN teacher_student_assignments tsa ON tsa.group_id = g.id
    LEFT JOIN users s ON s.id = tsa.student_id
    WHERE p.id = $1
      AND EXISTS (SELECT 1 FROM teacher_student_assignments t
                  WHERE t.group_id = p.group_id AND t.student_id = $2)
    GROUP BY p.id, g.group_name, u.full_name, u.email
  `, [projectId, req.user.id]);

  if (!rows.length) return res.status(404).json({ error: 'Project not found' });
  res.json(rows[0]);
});

router.put('/projects/:projectId', async (req, res) => {
  const { projectId } = req.params;
  const { title, objective, purpose, scope } = req.body;

  const owned = await pool.query(`
    SELECT p.id FROM projects p
    JOIN teacher_student_assignments tsa ON tsa.group_id = p.group_id
    WHERE p.id = $1 AND tsa.student_id = $2
  `, [projectId, req.user.id]);
  if (!owned.rows.length) return res.status(404).json({ error: 'Project not found' });

  const fields = []; const vals = []; let idx = 1;
  if (title !== undefined) { fields.push(`title = $${idx++}`); vals.push(title); }
  if (objective !== undefined) { fields.push(`objective = $${idx++}`); vals.push(objective); }
  if (purpose !== undefined) { fields.push(`purpose = $${idx++}`); vals.push(purpose); }
  if (scope !== undefined) { fields.push(`scope = $${idx++}`); vals.push(scope); }
  if (!fields.length) return res.status(400).json({ error: 'Nothing to update' });
  fields.push('updated_at = NOW()');
  vals.push(projectId);

  const { rows } = await pool.query(
    `UPDATE projects SET ${fields.join(', ')} WHERE id = $${idx} RETURNING *`,
    vals
  );
  res.json(rows[0]);
});

router.post('/projects/:projectId/submit', async (req, res) => {
  const { projectId } = req.params;
  const { rowCount, rows } = await pool.query(`
    UPDATE projects p SET status = $1, submitted_at = NOW(), updated_at = NOW()
    FROM teacher_student_assignments tsa
    WHERE p.id = $2 AND tsa.group_id = p.group_id AND tsa.student_id = $3 AND p.status = $4
    RETURNING p.*
  `, ['submitted', projectId, req.user.id, 'draft']);
  if (!rowCount) return res.status(400).json({ error: 'No draft project to submit, or already submitted' });

  const { rows: submitTeachers } = await pool.query(
    `SELECT g.teacher_id FROM teacher_student_assignments tsa
     JOIN groups g ON g.id = tsa.group_id WHERE tsa.student_id = $1`,
    [req.user.id]
  );
  if (submitTeachers.length) {
    await createNotification({
      userId: submitTeachers[0].teacher_id,
      type: 'project_status',
      title: 'Project Submitted',
      message: 'Your student has submitted their project for review.',
      relatedUrl: '/teacher/dashboard.html'
    });
  }

  res.json(rows[0]);
});

router.post('/projects', async (req, res) => {
  const { title, objective, purpose, scope } = req.body;
  if (!title || !title.trim())
    return res.status(400).json({ error: 'Project title is required' });

  const assignment = await pool.query(`
    SELECT g.id AS group_id, g.teacher_id FROM teacher_student_assignments tsa
    JOIN groups g ON g.id = tsa.group_id
    WHERE tsa.student_id = $1
  `, [req.user.id]);
  if (!assignment.rows.length) return res.status(404).json({ error: 'No group assigned' });

  const { rows } = await pool.query(
    'INSERT INTO projects (group_id, title, objective, purpose, scope, status) VALUES ($1, $2, $3, $4, $5, $6) RETURNING *',
    [assignment.rows[0].group_id, title.trim(), (objective || '').trim(), (purpose || '').trim(), (scope || '').trim(), 'draft']
  );
  res.status(201).json(rows[0]);
});

router.get('/group', async (req, res) => {
  const { rows } = await pool.query(`
    SELECT g.*, u.full_name AS teacher_name, u.email AS teacher_email,
           p.id AS project_id, p.title, p.objective, p.purpose, p.scope, p.status, p.submitted_at, p.github_repo_url
    FROM teacher_student_assignments tsa
    JOIN groups g ON g.id = tsa.group_id
    JOIN users u ON u.id = g.teacher_id
    LEFT JOIN projects p ON p.group_id = tsa.group_id
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
      'SELECT id FROM projects WHERE group_id = $1 ORDER BY updated_at DESC LIMIT 1',
      [groupId]
    );
    if (project.rows.length) {
      const fields = []; const vals = []; let idx = 1;
      if (title) { fields.push(`title = $${idx++}`); vals.push(title); }
      if (objective) { fields.push(`objective = $${idx++}`); vals.push(objective); }
      if (purpose) { fields.push(`purpose = $${idx++}`); vals.push(purpose); }
      if (scope) { fields.push(`scope = $${idx++}`); vals.push(scope); }
      fields.push(`updated_at = NOW()`);
      vals.push(project.rows[0].id);
      await pool.query(
        `UPDATE projects SET ${fields.join(', ')} WHERE id = $${idx}`,
        vals
      );
    } else if (title) {
      await pool.query(
        'INSERT INTO projects (group_id, title, objective, purpose, scope, status) VALUES ($1, $2, $3, $4, $5, $6)',
        [groupId, title, objective || '', purpose || '', scope || '', 'draft']
      );
    }
  }

  const updated = await pool.query(`
    SELECT g.group_name, p.id AS project_id, p.title, p.objective, p.purpose, p.scope, p.status
    FROM groups g
    JOIN teacher_student_assignments tsa ON tsa.group_id = g.id AND tsa.student_id = $1
    LEFT JOIN projects p ON p.group_id = g.id
    WHERE g.id = $2
    ORDER BY p.updated_at DESC
    LIMIT 1
  `, [req.user.id, groupId]);
  res.json(updated.rows[0] || { group_name });
});

router.get('/project', async (req, res) => {
  const { rows } = await pool.query(`
    SELECT p.* FROM projects p
    JOIN teacher_student_assignments tsa ON tsa.group_id = p.group_id
    WHERE tsa.student_id = $1
  `, [req.user.id]);
  if (!rows.length) return res.status(404).json({ error: 'No project found. Submit your idea first.' });
  res.json(rows[0]);
});

router.put('/project', async (req, res) => {
  const { title, objective, purpose, scope } = req.body;
  if (!title || !objective || !purpose || !scope)
    return res.status(400).json({ error: 'All fields required: title, objective, purpose, scope' });

  const group = await pool.query(`
    SELECT tsa.group_id FROM teacher_student_assignments tsa WHERE tsa.student_id = $1
  `, [req.user.id]);
  if (!group.rows.length) return res.status(404).json({ error: 'No group assigned' });
  const groupId = group.rows[0].group_id;

  const { rows } = await pool.query(`
    INSERT INTO projects (group_id, title, objective, purpose, scope, status)
    VALUES ($1, $2, $3, $4, $5, 'draft')
    ON CONFLICT (group_id) DO UPDATE SET
      title = $2, objective = $3, purpose = $4, scope = $5, updated_at = NOW()
    RETURNING *
  `, [groupId, title, objective, purpose, scope]);
  res.json(rows[0]);
});

router.post('/project/submit', async (req, res) => {
  const { rowCount, rows } = await pool.query(`
    UPDATE projects p SET status = $1, submitted_at = NOW(), updated_at = NOW()
    FROM teacher_student_assignments tsa
    WHERE tsa.group_id = p.group_id AND tsa.student_id = $2 AND p.status = $3
    RETURNING p.*
  `, ['submitted', req.user.id, 'draft']);
  if (!rowCount) return res.status(400).json({ error: 'No draft project to submit, or already submitted' });

  const { rows: submitTeachers } = await pool.query(
    `SELECT g.teacher_id FROM teacher_student_assignments tsa
     JOIN groups g ON g.id = tsa.group_id WHERE tsa.student_id = $1`,
    [req.user.id]
  );
  if (submitTeachers.length) {
    await createNotification({
      userId: submitTeachers[0].teacher_id,
      type: 'project_status',
      title: 'Project Submitted',
      message: 'Your student has submitted their project for review.',
      relatedUrl: '/teacher/dashboard.html'
    });
  }

  res.json(rows[0]);
});

router.get('/comments', async (req, res) => {
  const { rows } = await pool.query(`
    SELECT c.*, u.full_name AS author_name, u.role AS author_role
    FROM comments c
    JOIN projects p ON p.id = c.project_id
    JOIN teacher_student_assignments tsa ON tsa.group_id = p.group_id
    JOIN users u ON u.id = c.author_id
    WHERE tsa.student_id = $1
      AND ($2::uuid IS NULL OR p.id = $2)
    ORDER BY c.created_at ASC
  `, [req.user.id, req.query.project || null]);
  res.json(rows);
});

router.post('/comments', async (req, res) => {
  const { content, project } = req.body;
  if (!content) return res.status(400).json({ error: 'Content required' });

  const projectQuery = await pool.query(`
    SELECT p.id FROM projects p
    JOIN teacher_student_assignments tsa ON tsa.group_id = p.group_id
    WHERE tsa.student_id = $1
      AND ($2::uuid IS NULL OR p.id = $2)
    ORDER BY p.updated_at DESC
    LIMIT 1
  `, [req.user.id, project || null]);
  if (!projectQuery.rows.length) return res.status(404).json({ error: 'No project found' });

  const { rows } = await pool.query(
    'INSERT INTO comments (project_id, author_id, content) VALUES ($1, $2, $3) RETURNING *',
    [projectQuery.rows[0].id, req.user.id, content]
  );

  const { rows: commentTeachers } = await pool.query(
    `SELECT g.teacher_id FROM teacher_student_assignments tsa
     JOIN groups g ON g.id = tsa.group_id WHERE tsa.student_id = $1`,
    [req.user.id]
  );
  if (commentTeachers.length) {
    await createNotification({
      userId: commentTeachers[0].teacher_id,
      type: 'comment',
      title: 'New Comment from Student',
      message: content.length > 120 ? content.slice(0, 120) + '...' : content,
      relatedUrl: '/teacher/dashboard.html'
    });
  }

  res.status(201).json(rows[0]);
});

router.get('/uploads', async (req, res) => {
  const { rows } = await pool.query(`
    SELECT pu.id, pu.project_id, pu.student_id, pu.teacher_id, pu.file_name, pu.file_type, pu.category, pu.uploaded_at
    FROM project_uploads pu
    JOIN projects p ON p.id = pu.project_id
    JOIN teacher_student_assignments tsa ON tsa.group_id = p.group_id
    WHERE tsa.student_id = $1
    ORDER BY pu.uploaded_at DESC
  `, [req.user.id]);
  res.json(rows);
});

router.post('/uploads', async (req, res) => {
  const { file_name, file_data, file_type, category } = req.body;
  if (!file_name) return res.status(400).json({ error: 'file_name required' });
  if (!file_data) return res.status(400).json({ error: 'file_data required' });

  if (typeof file_data === 'string' && file_data.length > 14 * 1024 * 1024) {
    return res.status(400).json({ error: 'File too large. Maximum size is 10MB.' });
  }

  const safeFileName = String(file_name).replace(/[^a-zA-Z0-9._-]/g, '_');

  const project = await pool.query(`
    SELECT p.id FROM projects p
    JOIN teacher_student_assignments tsa ON tsa.group_id = p.group_id
    WHERE tsa.student_id = $1
  `, [req.user.id]);
  if (!project.rows.length) return res.status(404).json({ error: 'No project found' });

  const { rows } = await pool.query(
    'INSERT INTO project_uploads (project_id, student_id, file_name, file_data, file_type, category) VALUES ($1, $2, $3, $4, $5, $6) RETURNING *',
    [project.rows[0].id, req.user.id, safeFileName, file_data, file_type || null, category || 'supplementary']
  );

  const { rows: uploadTeachers } = await pool.query(
    `SELECT g.teacher_id FROM teacher_student_assignments tsa
     JOIN groups g ON g.id = tsa.group_id WHERE tsa.student_id = $1`,
    [req.user.id]
  );
  if (uploadTeachers.length) {
    await createNotification({
      userId: uploadTeachers[0].teacher_id,
      type: 'upload',
      title: 'New File Submitted',
      message: 'Your student uploaded: ' + safeFileName,
      relatedUrl: '/teacher/uploads.html'
    });
  }

  res.status(201).json(rows[0]);
});

router.get('/resources', async (req, res) => {
  const { rows } = await pool.query(`
    SELECT rf.id, rf.teacher_id, rf.title, rf.file_type, rf.created_at, u.full_name AS teacher_name
    FROM resource_files rf
    JOIN teacher_student_assignments tsa ON tsa.teacher_id = rf.teacher_id AND tsa.student_id = $1
    JOIN users u ON u.id = rf.teacher_id
    ORDER BY rf.created_at DESC
  `, [req.user.id]);
  res.json(rows);
});

router.get('/teacher-uploads', async (req, res) => {
  const { rows } = await pool.query(`
    SELECT pu.id, pu.project_id, pu.student_id, pu.teacher_id, pu.file_name, pu.file_type, pu.category, pu.uploaded_at,
           u.full_name AS teacher_name
    FROM project_uploads pu
    JOIN projects p ON p.id = pu.project_id
    JOIN teacher_student_assignments tsa ON tsa.group_id = p.group_id
    JOIN users u ON u.id = pu.teacher_id
    WHERE tsa.student_id = $1
    ORDER BY pu.uploaded_at DESC
  `, [req.user.id]);
  res.json(rows);
});

router.get('/meetings', async (req, res) => {
  const { rows } = await pool.query(`
    SELECT ml.*, u.full_name AS teacher_name
    FROM meeting_logs ml
    JOIN projects p ON p.id = ml.project_id
    JOIN teacher_student_assignments tsa ON tsa.group_id = p.group_id
    JOIN users u ON u.id = ml.author_id
    WHERE tsa.student_id = $1
    ORDER BY ml.meeting_date DESC, ml.created_at DESC
  `, [req.user.id]);
  res.json(rows);
});

router.get('/project-photos', async (req, res) => {
  const { rows } = await pool.query(`
    SELECT ph.id, ph.project_id, ph.uploader_id, ph.caption, ph.file_type, ph.uploaded_at,
           u.full_name AS uploader_name, p.title AS project_title
    FROM project_photos ph
    JOIN projects p ON p.id = ph.project_id
    JOIN teacher_student_assignments tsa ON tsa.group_id = p.group_id
    JOIN users u ON u.id = ph.uploader_id
    WHERE tsa.student_id = $1
      AND ($2::uuid IS NULL OR ph.project_id = $2)
    ORDER BY ph.uploaded_at ASC
  `, [req.user.id, req.query.project || null]);
  res.json(rows);
});

router.post('/project-photos', async (req, res) => {
  const { project, caption, file_data, file_type } = req.body;
  if (!file_data) return res.status(400).json({ error: 'file_data required' });
  if (file_data.length > 14 * 1024 * 1024)
    return res.status(400).json({ error: 'Photo too large. Max 10MB.' });

  const projectRes = await pool.query(`
    SELECT p.id FROM projects p
    JOIN teacher_student_assignments tsa ON tsa.group_id = p.group_id
    WHERE tsa.student_id = $1
      AND ($2::uuid IS NULL OR p.id = $2)
    ORDER BY p.updated_at DESC
    LIMIT 1
  `, [req.user.id, project || null]);
  if (!projectRes.rows.length) return res.status(404).json({ error: 'No project found' });

  const { rows } = await pool.query(
    'INSERT INTO project_photos (project_id, uploader_id, caption, file_data, file_type) VALUES ($1, $2, $3, $4, $5) RETURNING *',
    [projectRes.rows[0].id, req.user.id, (caption || '').trim(), file_data, file_type || 'image/jpeg']
  );

  const { rows: photoTeachers } = await pool.query(
    `SELECT g.teacher_id FROM teacher_student_assignments tsa
     JOIN groups g ON g.id = tsa.group_id WHERE tsa.student_id = $1`,
    [req.user.id]
  );
  if (photoTeachers.length) {
    await createNotification({
      userId: photoTeachers[0].teacher_id,
      type: 'upload',
      title: 'New Project Photo',
      message: 'Your student added a new project photo',
      relatedUrl: '/teacher/dashboard.html'
    });
  }

  res.status(201).json(rows[0]);
});

router.delete('/project-photos/:photoId', async (req, res) => {
  const { photoId } = req.params;
  const { rowCount } = await pool.query(`
    DELETE FROM project_photos ph
    USING teacher_student_assignments tsa, projects p
    WHERE ph.id = $1
      AND ph.uploader_id = $2
      AND p.id = ph.project_id
      AND tsa.group_id = p.group_id
      AND tsa.student_id = $2
  `, [photoId, req.user.id]);
  if (!rowCount) return res.status(404).json({ error: 'Photo not found' });
  res.json({ ok: true });
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
