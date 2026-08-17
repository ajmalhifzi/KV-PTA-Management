const { Router } = require('express');
const pool = require('../db');
const { authenticate, authorize } = require('../middleware/auth');
const { createNotification } = require('./notifications');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const rateLimit = require('express-rate-limit');

const router = Router();

const githubLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  message: { error: 'Too many GitHub OAuth attempts. Please try again later.' },
  standardHeaders: true,
  legacyHeaders: false,
});

router.get('/login', githubLimiter, (req, res) => {
  const token = req.query.token;
  const frontendUrl = process.env.FRONTEND_URL || '';
  if (!token) return res.redirect(frontendUrl + '/login.html');

  try {
    const user = jwt.verify(token, process.env.JWT_SECRET, { algorithms: ['HS256'] });
    const state = jwt.sign(
      { userId: user.id, nonce: crypto.randomUUID() },
      process.env.JWT_SECRET,
      { algorithm: 'HS256', expiresIn: '10m' }
    );
    const redirectUri = process.env.GITHUB_REDIRECT_URL || '';
    const url = `https://github.com/login/oauth/authorize?client_id=${process.env.GITHUB_CLIENT_ID}&redirect_uri=${encodeURIComponent(redirectUri)}&state=${state}&scope=repo`;
    res.redirect(url);
  } catch {
    return res.redirect(frontendUrl + '/login.html');
  }
});

router.get('/callback', githubLimiter, async (req, res) => {
  const { code, state } = req.query;
  const frontendUrl = process.env.FRONTEND_URL || '';
  if (!code || !state) return res.redirect(frontendUrl + '/student/projects.html?github=error');

  let payload;
  try {
    payload = jwt.verify(state, process.env.JWT_SECRET, { algorithms: ['HS256'] });
  } catch {
    return res.redirect(frontendUrl + '/student/projects.html?github=error');
  }

  try {
    const tokenRes = await fetch('https://github.com/login/oauth/access_token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
      body: JSON.stringify({
        client_id: process.env.GITHUB_CLIENT_ID,
        client_secret: process.env.GITHUB_CLIENT_SECRET,
        code
      })
    });
    const tokenData = await tokenRes.json();

    if (tokenData.error) {
      return res.redirect(process.env.FRONTEND_URL + '/student/projects.html?github=error');
    }

    const userRes = await fetch('https://api.github.com/user', {
      headers: { 'Authorization': `Bearer ${tokenData.access_token}` }
    });
    const githubUser = await userRes.json();

    await pool.query(`
      INSERT INTO github_connections (user_id, github_username, access_token, refresh_token, expires_at)
      VALUES ($1, $2, $3, $4, $5)
      ON CONFLICT (user_id) DO UPDATE SET
        github_username = EXCLUDED.github_username,
        access_token = EXCLUDED.access_token,
        refresh_token = EXCLUDED.refresh_token,
        expires_at = EXCLUDED.expires_at,
        updated_at = NOW()
    `, [
      payload.userId,
      githubUser.login,
      tokenData.access_token,
      tokenData.refresh_token || null,
      tokenData.expires_in ? new Date(Date.now() + tokenData.expires_in * 1000) : null
    ]);

    res.redirect(process.env.FRONTEND_URL + '/student/projects.html?github=connected');
  } catch (err) {
    console.error('GitHub OAuth error:', err);
    res.redirect(process.env.FRONTEND_URL + '/student/projects.html?github=error');
  }
});

router.use(authenticate);

router.get('/status', async (req, res) => {
  const { rows } = await pool.query(
    'SELECT github_username, created_at, updated_at FROM github_connections WHERE user_id = $1',
    [req.user.id]
  );
  res.json({ connected: rows.length > 0, ...(rows[0] || {}) });
});

router.post('/link-repo', authorize('student'), async (req, res) => {
  const { repoFullName, project } = req.body;
  if (!repoFullName) return res.status(400).json({ error: 'repoFullName required' });

  const { rows: projects } = await pool.query(`
    SELECT p.id FROM projects p
    JOIN groups g ON g.id = p.group_id
    JOIN teacher_student_assignments tsa ON tsa.group_id = g.id
    WHERE tsa.student_id = $1
      AND ($2::uuid IS NULL OR p.id = $2)
    ORDER BY p.updated_at DESC
    LIMIT 1
  `, [req.user.id, project || null]);

  if (!projects.length) return res.status(404).json({ error: 'No project found' });

  const repoUrl = `https://github.com/${repoFullName}`;
  await pool.query('UPDATE projects SET github_repo_url = $1, updated_at = NOW() WHERE id = $2', [repoUrl, projects[0].id]);

  const { rows: teachers } = await pool.query(`
    SELECT g.teacher_id FROM groups g
    JOIN teacher_student_assignments tsa ON tsa.group_id = g.id
    WHERE tsa.student_id = $1
  `, [req.user.id]);

  if (teachers.length) {
    await createNotification({
      userId: teachers[0].teacher_id,
      type: 'project_status',
      title: 'GitHub Repo Linked',
      message: `Student linked repo: ${repoFullName}`,
      relatedUrl: '/teacher/dashboard.html'
    });
  }

  res.json({ repoUrl });
});

router.post('/unlink-repo', authorize('student'), async (req, res) => {
  const { project } = req.body;
  const { rows: projects } = await pool.query(`
    SELECT p.id FROM projects p
    JOIN groups g ON g.id = p.group_id
    JOIN teacher_student_assignments tsa ON tsa.group_id = g.id
    WHERE tsa.student_id = $1
      AND ($2::uuid IS NULL OR p.id = $2)
    ORDER BY p.updated_at DESC
    LIMIT 1
  `, [req.user.id, project || null]);

  if (!projects.length) return res.status(404).json({ error: 'No project found' });

  await pool.query('UPDATE projects SET github_repo_url = NULL, updated_at = NOW() WHERE id = $1', [projects[0].id]);
  res.json({ ok: true });
});

router.get('/user-repos', async (req, res) => {
  const { rows } = await pool.query(
    'SELECT access_token FROM github_connections WHERE user_id = $1',
    [req.user.id]
  );

  if (!rows.length) return res.status(400).json({ error: 'GitHub not connected' });

  const reposRes = await fetch('https://api.github.com/user/repos?per_page=100&sort=updated', {
    headers: { 'Authorization': `Bearer ${rows[0].access_token}` }
  });

  if (!reposRes.ok) return res.status(500).json({ error: 'Failed to fetch repos' });

  const repos = await reposRes.json();
  res.json(repos.map(r => ({ name: r.full_name, url: r.html_url, private: r.private, description: r.description })));
});

router.get('/commits/:projectId', authorize('teacher'), async (req, res) => {
  const { limit = 30 } = req.query;

  const { rows: projects } = await pool.query(`
    SELECT DISTINCT ON (p.id) p.github_repo_url, tsa.student_id,
      gc.access_token
    FROM projects p
    JOIN groups g ON g.id = p.group_id
    JOIN teacher_student_assignments tsa ON tsa.group_id = g.id
    LEFT JOIN github_connections gc ON gc.user_id = tsa.student_id
    WHERE p.id = $1 AND g.teacher_id = $2
    ORDER BY p.id, gc.access_token DESC NULLS LAST
    LIMIT 1
  `, [req.params.projectId, req.user.id]);

  if (!projects.length) return res.status(404).json({ error: 'Project not found' });
  if (!projects[0].github_repo_url) return res.json([]);

  const repoMatch = projects[0].github_repo_url.match(/github\.com\/([^/]+\/[^/]+?)(?:\/|$)/);
  if (!repoMatch) return res.json([]);
  const repoFullName = repoMatch[1];

  const token = projects[0].access_token;
  const headers = { 'Accept': 'application/vnd.github.v3+json' };
  if (token) headers['Authorization'] = `Bearer ${token}`;

  const commitsRes = await fetch(
    `https://api.github.com/repos/${repoFullName}/commits?per_page=${limit}`,
    { headers }
  );

  if (!commitsRes.ok) return res.json([]);

  const commits = await commitsRes.json();
  res.json(commits.map(c => ({
    sha: c.sha,
    message: c.commit.message,
    author: c.commit.author.name,
    date: c.commit.author.date,
    url: c.html_url,
    avatar: c.author?.avatar_url
  })));
});

router.get('/commits/:projectId/:sha/comments', authorize('teacher'), async (req, res) => {
  const { rows: projects } = await pool.query(`
    SELECT DISTINCT ON (p.id) p.github_repo_url,
      gc.access_token
    FROM projects p
    JOIN groups g ON g.id = p.group_id
    JOIN teacher_student_assignments tsa ON tsa.group_id = g.id
    LEFT JOIN github_connections gc ON gc.user_id = tsa.student_id
    WHERE p.id = $1 AND g.teacher_id = $2
    ORDER BY p.id, gc.access_token DESC NULLS LAST
    LIMIT 1
  `, [req.params.projectId, req.user.id]);

  if (!projects.length || !projects[0].github_repo_url) return res.json([]);

  const repoMatch = projects[0].github_repo_url.match(/github\.com\/([^/]+\/[^/]+?)(?:\/|$)/);
  if (!repoMatch) return res.json([]);
  const repoFullName = repoMatch[1];

  const token = projects[0].access_token;
  const headers = { 'Accept': 'application/vnd.github.v3+json' };
  if (token) headers['Authorization'] = `Bearer ${token}`;

  const commentsRes = await fetch(
    `https://api.github.com/repos/${repoFullName}/commits/${req.params.sha}/comments`,
    { headers }
  );

  if (!commentsRes.ok) return res.json([]);
  const comments = await commentsRes.json();
  res.json(comments.map(c => ({
    id: c.id,
    body: c.body,
    author: c.user?.login || 'unknown',
    authorAvatar: c.user?.avatar_url,
    createdAt: c.created_at,
    url: c.html_url
  })));
});

router.post('/commits/:projectId/:sha/comments', authorize('teacher'), async (req, res) => {
  const { body } = req.body;
  if (!body) return res.status(400).json({ error: 'Comment body required' });

  const { rows: projects } = await pool.query(`
    SELECT DISTINCT ON (p.id) p.github_repo_url, tsa.student_id,
      gc.access_token
    FROM projects p
    JOIN groups g ON g.id = p.group_id
    JOIN teacher_student_assignments tsa ON tsa.group_id = g.id
    LEFT JOIN github_connections gc ON gc.user_id = tsa.student_id
    WHERE p.id = $1 AND g.teacher_id = $2
    ORDER BY p.id, gc.access_token DESC NULLS LAST
    LIMIT 1
  `, [req.params.projectId, req.user.id]);

  if (!projects.length || !projects[0].github_repo_url) return res.status(404).json({ error: 'Project not found' });

  const repoMatch = projects[0].github_repo_url.match(/github\.com\/([^/]+\/[^/]+?)(?:\/|$)/);
  if (!repoMatch) return res.status(400).json({ error: 'Invalid repo URL' });
  const repoFullName = repoMatch[1];

  const token = projects[0].access_token;
  if (!token) return res.status(400).json({ error: 'No GitHub token available for this project' });

  const commentRes = await fetch(
    `https://api.github.com/repos/${repoFullName}/commits/${req.params.sha}/comments`,
    {
      method: 'POST',
      headers: {
        'Accept': 'application/vnd.github.v3+json',
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ body: body + '\n\n— Comment from KV PTA Management' })
    }
  );

  if (!commentRes.ok) {
    const err = await commentRes.json();
    return res.status(500).json({ error: err.message || 'Failed to post comment' });
  }

  const comment = await commentRes.json();

  await createNotification({
    userId: projects[0].student_id,
    type: 'comment',
    title: 'New Comment on Commit',
    message: body.length > 120 ? body.slice(0, 120) + '...' : body,
    relatedUrl: '/student/projects.html'
  });

  res.status(201).json({
    id: comment.id,
    body: comment.body,
    author: comment.user?.login,
    createdAt: comment.created_at,
    url: comment.html_url
  });
});

router.get('/repo-summary/:projectId', authorize('teacher'), async (req, res) => {
  const { rows: projects } = await pool.query(`
    SELECT DISTINCT ON (p.id) p.github_repo_url, tsa.student_id,
      gc.access_token
    FROM projects p
    JOIN groups g ON g.id = p.group_id
    JOIN teacher_student_assignments tsa ON tsa.group_id = g.id
    LEFT JOIN github_connections gc ON gc.user_id = tsa.student_id
    WHERE p.id = $1 AND g.teacher_id = $2
    ORDER BY p.id, gc.access_token DESC NULLS LAST
    LIMIT 1
  `, [req.params.projectId, req.user.id]);

  if (!projects.length) return res.status(404).json({ error: 'Project not found' });
  if (!projects[0].github_repo_url) return res.json({ linked: false });

  const repoMatch = projects[0].github_repo_url.match(/github\.com\/([^/]+\/[^/]+?)(?:\/|$)/);
  if (!repoMatch) return res.json({ linked: true, error: 'Invalid repo URL' });
  const repoFullName = repoMatch[1];

  const token = projects[0].access_token;
  const headers = { 'Accept': 'application/vnd.github.v3+json' };
  if (token) headers['Authorization'] = `Bearer ${token}`;

  const repoRes = await fetch(`https://api.github.com/repos/${repoFullName}`, { headers });
  const commitsRes = await fetch(`https://api.github.com/repos/${repoFullName}/commits?per_page=1`, { headers });

  if (!repoRes.ok) return res.json({ linked: true, error: 'Repo not accessible' });

  const repo = await repoRes.json();
  let lastCommit = null;
  if (commitsRes.ok) {
    const commits = await commitsRes.json();
    if (commits.length) {
      lastCommit = {
        sha: commits[0].sha,
        message: commits[0].commit.message,
        author: commits[0].commit.author.name,
        date: commits[0].commit.author.date
      };
    }
  }

  res.json({
    linked: true,
    fullName: repo.full_name,
    description: repo.description,
    private: repo.private,
    language: repo.language,
    defaultBranch: repo.default_branch,
    lastCommit,
    pushedAt: repo.pushed_at
  });
});

router.get('/check-commits/:projectId', authorize('teacher'), async (req, res) => {
  const { rows: projects } = await pool.query(`
    SELECT DISTINCT ON (p.id) p.id, p.github_repo_url, p.last_known_commit_sha,
      gc.access_token
    FROM projects p
    JOIN groups g ON g.id = p.group_id
    JOIN teacher_student_assignments tsa ON tsa.group_id = g.id
    LEFT JOIN github_connections gc ON gc.user_id = tsa.student_id
    WHERE p.id = $1 AND g.teacher_id = $2
    ORDER BY p.id, gc.access_token DESC NULLS LAST
    LIMIT 1
  `, [req.params.projectId, req.user.id]);

  if (!projects.length || !projects[0].github_repo_url) return res.json({ newCommits: false });

  const repoMatch = projects[0].github_repo_url.match(/github\.com\/([^/]+\/[^/]+?)(?:\/|$)/);
  if (!repoMatch) return res.json({ newCommits: false });
  const repoFullName = repoMatch[1];

  const token = projects[0].access_token;
  const headers = { 'Accept': 'application/vnd.github.v3+json' };
  if (token) headers['Authorization'] = `Bearer ${token}`;

  const commitsRes = await fetch(
    `https://api.github.com/repos/${repoFullName}/commits?per_page=1`,
    { headers }
  );

  if (!commitsRes.ok) return res.json({ newCommits: false });

  const commits = await commitsRes.json();
  if (!commits.length) return res.json({ newCommits: false });

  const latestSha = commits[0].sha;
  const isNew = projects[0].last_known_commit_sha !== latestSha;

  if (isNew && projects[0].last_known_commit_sha) {
    await createNotification({
      userId: req.user.id,
      type: 'upload',
      title: 'New Commits Detected',
      message: `New commits pushed to ${repoFullName}`,
      relatedUrl: `/teacher/project-detail.html`
    });
  }

  await pool.query('UPDATE projects SET last_known_commit_sha = $1, updated_at = NOW() WHERE id = $2', [latestSha, projects[0].id]);

  res.json({ newCommits: isNew, latestSha });
});

router.get('/teacher-repos', authorize('teacher'), async (req, res) => {
  const { rows: groups } = await pool.query(`
    SELECT DISTINCT ON (p.id) p.id AS project_id, p.github_repo_url,
      gc.access_token
    FROM projects p
    JOIN groups g ON g.id = p.group_id
    LEFT JOIN teacher_student_assignments tsa ON tsa.group_id = g.id
    LEFT JOIN github_connections gc ON gc.user_id = tsa.student_id
    WHERE g.teacher_id = $1 AND p.github_repo_url IS NOT NULL
    ORDER BY p.id, gc.access_token DESC NULLS LAST
  `, [req.user.id]);

  const results = [];
  for (const group of groups) {
    const repoMatch = group.github_repo_url.match(/github\.com\/([^/]+\/[^/]+?)(?:\/|$)/);
    if (!repoMatch) continue;
    const repoFullName = repoMatch[1];

    const token = group.access_token;
    const headers = { 'Accept': 'application/vnd.github.v3+json' };
    if (token) headers['Authorization'] = `Bearer ${token}`;

    try {
      const commitsRes = await fetch(`https://api.github.com/repos/${repoFullName}/commits?per_page=1`, { headers });
      const repoRes = await fetch(`https://api.github.com/repos/${repoFullName}`, { headers });

      let lastCommit = null;
      let language = null;
      let privateRepo = false;

      if (commitsRes.ok) {
        const commits = await commitsRes.json();
        if (commits.length) {
          lastCommit = { sha: commits[0].sha, date: commits[0].commit.author.date, author: commits[0].commit.author.name, message: commits[0].commit.message };
        }
      }
      if (repoRes.ok) {
        const repo = await repoRes.json();
        language = repo.language;
        privateRepo = repo.private;
      }

      results.push({ projectId: group.project_id, repoUrl: group.github_repo_url, repoFullName, lastCommit, language, private: privateRepo });
    } catch {}
  }
  res.json(results);
});

router.get('/check-all-commits', authorize('teacher'), async (req, res) => {
  const { rows: projects } = await pool.query(`
    SELECT DISTINCT ON (p.id) p.id, p.github_repo_url, p.last_known_commit_sha,
      gc.access_token
    FROM projects p
    JOIN groups g ON g.id = p.group_id
    LEFT JOIN teacher_student_assignments tsa ON tsa.group_id = g.id
    LEFT JOIN github_connections gc ON gc.user_id = tsa.student_id
    WHERE g.teacher_id = $1 AND p.github_repo_url IS NOT NULL
    ORDER BY p.id, gc.access_token DESC NULLS LAST
  `, [req.user.id]);

  let newCommitsCount = 0;
  for (const project of projects) {
    const repoMatch = project.github_repo_url.match(/github\.com\/([^/]+\/[^/]+?)(?:\/|$)/);
    if (!repoMatch) continue;
    const repoFullName = repoMatch[1];

    const token = project.access_token;
    const headers = { 'Accept': 'application/vnd.github.v3+json' };
    if (token) headers['Authorization'] = `Bearer ${token}`;

    try {
      const commitsRes = await fetch(`https://api.github.com/repos/${repoFullName}/commits?per_page=1`, { headers });
      if (!commitsRes.ok) continue;
      const commits = await commitsRes.json();
      if (!commits.length) continue;

      const latestSha = commits[0].sha;
      if (latestSha !== project.last_known_commit_sha && project.last_known_commit_sha) {
        await createNotification({
          userId: req.user.id,
          type: 'upload',
          title: 'New Commits',
          message: `New commits in ${repoFullName}`,
          relatedUrl: `/teacher/project-detail.html`
        });
        newCommitsCount++;
      }

      await pool.query('UPDATE projects SET last_known_commit_sha = $1, updated_at = NOW() WHERE id = $2', [latestSha, project.id]);
    } catch {}
  }

  res.json({ newCommitsCount });
});

router.get('/my-commits', authorize('student'), async (req, res) => {
  const { limit = 20 } = req.query;

  const { rows: projects } = await pool.query(`
    SELECT p.id, p.github_repo_url FROM projects p
    JOIN groups g ON g.id = p.group_id
    JOIN teacher_student_assignments tsa ON tsa.group_id = g.id
    WHERE tsa.student_id = $1
      AND ($2::uuid IS NULL OR p.id = $2)
    ORDER BY p.updated_at DESC
    LIMIT 1
  `, [req.user.id, req.query.project || null]);

  if (!projects.length || !projects[0].github_repo_url) return res.json([]);

  const repoMatch = projects[0].github_repo_url.match(/github\.com\/([^/]+\/[^/]+?)(?:\/|$)/);
  if (!repoMatch) return res.json([]);
  const repoFullName = repoMatch[1];

  const { rows: connections } = await pool.query(
    'SELECT access_token FROM github_connections WHERE user_id = $1',
    [req.user.id]
  );

  const token = connections.length ? connections[0].access_token : null;
  const headers = { 'Accept': 'application/vnd.github.v3+json' };
  if (token) headers['Authorization'] = `Bearer ${token}`;

  const commitsRes = await fetch(
    `https://api.github.com/repos/${repoFullName}/commits?per_page=${limit}`,
    { headers }
  );

  if (!commitsRes.ok) return res.json([]);
  const commits = await commitsRes.json();

  const result = [];
  for (const c of commits) {
    const entry = {
      sha: c.sha,
      message: c.commit.message,
      author: c.commit.author.name,
      date: c.commit.author.date,
      url: c.html_url
    };
    const commentRes = await fetch(
      `https://api.github.com/repos/${repoFullName}/commits/${c.sha}/comments`,
      { headers }
    );
    if (commentRes.ok) {
      const comments = await commentRes.json();
      entry.comments = comments.map(cmt => ({
        id: cmt.id,
        body: cmt.body.replace(/\n— Comment from KV PTA Management$/, ''),
        author: cmt.user?.login,
        authorAvatar: cmt.user?.avatar_url,
        createdAt: cmt.created_at
      }));
    } else {
      entry.comments = [];
    }
    result.push(entry);
  }
  res.json(result);
});

router.get('/my-repo-summary', authorize('student'), async (req, res) => {
  const { rows: projects } = await pool.query(`
    SELECT p.github_repo_url FROM projects p
    JOIN groups g ON g.id = p.group_id
    JOIN teacher_student_assignments tsa ON tsa.group_id = g.id
    WHERE tsa.student_id = $1
      AND ($2::uuid IS NULL OR p.id = $2)
    ORDER BY p.updated_at DESC
    LIMIT 1
  `, [req.user.id, req.query.project || null]);

  if (!projects.length || !projects[0].github_repo_url) return res.json({ linked: false });
  const repoUrl = projects[0].github_repo_url;
  const repoMatch = repoUrl.match(/github\.com\/([^/]+\/[^/]+?)(?:\/|$)/);
  if (!repoMatch) return res.json({ linked: true, error: 'Invalid repo URL' });
  const repoFullName = repoMatch[1];

  const { rows: connections } = await pool.query(
    'SELECT access_token FROM github_connections WHERE user_id = $1',
    [req.user.id]
  );

  const token = connections.length ? connections[0].access_token : null;
  const headers = { 'Accept': 'application/vnd.github.v3+json' };
  if (token) headers['Authorization'] = `Bearer ${token}`;

  const repoRes = await fetch(`https://api.github.com/repos/${repoFullName}`, { headers });
  const commitsRes = await fetch(`https://api.github.com/repos/${repoFullName}/commits?per_page=1`, { headers });

  if (!repoRes.ok) return res.json({ linked: true, error: 'Repo not accessible' });

  const repo = await repoRes.json();
  let lastCommit = null;
  if (commitsRes.ok) {
    const commits = await commitsRes.json();
    if (commits.length) {
      lastCommit = {
        sha: commits[0].sha,
        message: commits[0].commit.message,
        author: commits[0].commit.author.name,
        date: commits[0].commit.author.date
      };
    }
  }

  res.json({
    linked: true,
    fullName: repo.full_name,
    language: repo.language,
    private: repo.private,
    lastCommit
  });
});

module.exports = router;
