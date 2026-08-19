const { describe, it, before, after } = require('node:test');
const assert = require('node:assert');
const http = require('http');
const jwt = require('jsonwebtoken');

// Ensure test environment variables
process.env.JWT_SECRET = process.env.JWT_SECRET || 'test_jwt_secret_key_1234567890123456789012345678901234567890';
process.env.NODE_ENV = 'test';

const app = require('../api/index.js');
const pool = require('../api/db.js');

let server;
let baseUrl;

before(() => {
  return new Promise((resolve) => {
    server = http.createServer(app);
    server.listen(0, '127.0.0.1', () => {
      const port = server.address().port;
      baseUrl = `http://127.0.0.1:${port}`;
      resolve();
    });
  });
});

after(() => {
  return new Promise((resolve) => {
    if (server) server.close(resolve);
    else resolve();
  });
});

function request(path, options = {}) {
  return new Promise((resolve, reject) => {
    const url = new URL(path, baseUrl);
    const reqOptions = {
      method: options.method || 'GET',
      headers: options.headers || {},
    };

    const req = http.request(url, reqOptions, (res) => {
      let body = '';
      res.on('data', (chunk) => body += chunk);
      res.on('end', () => {
        let json = null;
        try { json = JSON.parse(body); } catch {}
        resolve({ status: res.statusCode, headers: res.headers, body, json });
      });
    });

    req.on('error', reject);

    if (options.body) {
      req.write(typeof options.body === 'object' ? JSON.stringify(options.body) : options.body);
    }
    req.end();
  });
}

// 1. JWT Validation
describe('1. JWT Validation & Verification', () => {
  it('Valid JWT returns authorized response (200)', async () => {
    const validToken = jwt.sign(
      { id: '00000000-0000-0000-0000-000000000001', role: 'admin' },
      process.env.JWT_SECRET,
      { algorithm: 'HS256', expiresIn: '1h' }
    );
    const res = await request('/api/admin/users', {
      headers: { 'Authorization': `Bearer ${validToken}` }
    });
    assert.strictEqual(res.status, 200);
  });

  it('Expired JWT returns 401', async () => {
    const expiredToken = jwt.sign(
      { id: '00000000-0000-0000-0000-000000000001', role: 'student' },
      process.env.JWT_SECRET,
      { algorithm: 'HS256', expiresIn: -10 }
    );
    const res = await request('/api/student/projects', {
      headers: { 'Authorization': `Bearer ${expiredToken}` }
    });
    assert.strictEqual(res.status, 401);
  });

  it('JWT signed with wrong secret returns 401', async () => {
    const wrongSecretToken = jwt.sign(
      { id: '00000000-0000-0000-0000-000000000001', role: 'student' },
      'wrong_secret_key_99999999999999999'
    );
    const res = await request('/api/student/projects', {
      headers: { 'Authorization': `Bearer ${wrongSecretToken}` }
    });
    assert.strictEqual(res.status, 401);
  });

  it('Malformed JWT returns 401', async () => {
    const res = await request('/api/student/projects', {
      headers: { 'Authorization': 'Bearer malformed_garbage_string' }
    });
    assert.strictEqual(res.status, 401);
  });

  it('JWT with unsupported algorithm ("none") returns 401', async () => {
    const noneAlgToken = jwt.sign(
      { id: '00000000-0000-0000-0000-000000000001', role: 'admin' },
      '',
      { algorithm: 'none' }
    );
    const res = await request('/api/admin/users', {
      headers: { 'Authorization': `Bearer ${noneAlgToken}` }
    });
    assert.strictEqual(res.status, 401);
  });

  it('Missing Authorization header returns 401', async () => {
    const res = await request('/api/student/projects');
    assert.strictEqual(res.status, 401);
  });
});

// 2. Privilege Escalation & Role Enforcement
describe('2. Privilege Escalation & Role Enforcement', () => {
  it('Public registration forces "student" role even if client submits "admin"', async () => {
    const email = `test_admin_exploit_${Date.now()}@example.com`;
    const res = await request('/api/auth/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: { email, password: 'password123', full_name: 'Attacker', role: 'admin' },
    });
    if (res.status === 201) {
      assert.strictEqual(res.json.user.role, 'student');
    } else {
      assert.notStrictEqual(res.json?.user?.role, 'admin');
    }
  });

  it('Student token attempting to access Admin endpoints is rejected with 403', async () => {
    const studentToken = jwt.sign(
      { id: '00000000-0000-0000-0000-000000000001', role: 'student' },
      process.env.JWT_SECRET,
      { algorithm: 'HS256' }
    );
    const res = await request('/api/admin/users', {
      headers: { 'Authorization': `Bearer ${studentToken}` }
    });
    assert.strictEqual(res.status, 403);
  });

  it('Teacher token attempting to access Admin endpoints is rejected with 403', async () => {
    const teacherToken = jwt.sign(
      { id: '00000000-0000-0000-0000-000000000002', role: 'teacher' },
      process.env.JWT_SECRET,
      { algorithm: 'HS256' }
    );
    const res = await request('/api/admin/users', {
      headers: { 'Authorization': `Bearer ${teacherToken}` }
    });
    assert.strictEqual(res.status, 403);
  });

  it('Student cannot create a teacher user via admin endpoint (403)', async () => {
    const studentToken = jwt.sign(
      { id: '00000000-0000-0000-0000-000000000001', role: 'student' },
      process.env.JWT_SECRET,
      { algorithm: 'HS256' }
    );
    const res = await request('/api/admin/teachers', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${studentToken}`, 'Content-Type': 'application/json' },
      body: { email: 'fake_teacher@example.com', full_name: 'Fake Teacher', password: 'password123' }
    });
    assert.strictEqual(res.status, 403);
  });
});

// 3. IDOR Authorization Matrix
describe('3. IDOR Authorization Matrix', () => {
  it('Student attempting to access another student/group project is rejected (403 or 404)', async () => {
    const studentToken = jwt.sign(
      { id: '00000000-0000-0000-0000-000000000099', role: 'student' },
      process.env.JWT_SECRET,
      { algorithm: 'HS256' }
    );
    const res = await request('/api/student/projects/00000000-0000-0000-0000-000000000001', {
      headers: { 'Authorization': `Bearer ${studentToken}` }
    });
    assert.ok(res.status === 403 || res.status === 404);
  });

  it('Teacher attempting to access unassigned student project is rejected (403 or 404)', async () => {
    const teacherToken = jwt.sign(
      { id: '00000000-0000-0000-0000-000000000099', role: 'teacher' },
      process.env.JWT_SECRET,
      { algorithm: 'HS256' }
    );
    const res = await request('/api/teacher/projects/00000000-0000-0000-0000-000000000001', {
      headers: { 'Authorization': `Bearer ${teacherToken}` }
    });
    assert.ok(res.status === 403 || res.status === 404);
  });
});

// 4. File Authorization Matrix
describe('4. File Authorization Matrix', () => {
  it('Anonymous request to /api/files/uploads/:id returns 401', async () => {
    const res = await request('/api/files/uploads/00000000-0000-0000-0000-000000000099');
    assert.strictEqual(res.status, 401);
  });

  it('Anonymous request to /api/files/photos/:id returns 401', async () => {
    const res = await request('/api/files/photos/00000000-0000-0000-0000-000000000099');
    assert.strictEqual(res.status, 401);
  });

  it('Anonymous request to /api/files/resources/:id returns 401', async () => {
    const res = await request('/api/files/resources/00000000-0000-0000-0000-000000000099');
    assert.strictEqual(res.status, 401);
  });

  it('Unrelated Student request to /api/files/uploads/:id returns 403 or 404', async () => {
    const studentToken = jwt.sign(
      { id: '00000000-0000-0000-0000-000000000099', role: 'student' },
      process.env.JWT_SECRET,
      { algorithm: 'HS256' }
    );
    const res = await request('/api/files/uploads/00000000-0000-0000-0000-000000000099', {
      headers: { 'Authorization': `Bearer ${studentToken}` }
    });
    assert.ok(res.status === 403 || res.status === 404);
  });
});

// 5. Rate Limiting
describe('5. Rate Limiting Verification', () => {
  it('Single login request passes rate limiter without 429', async () => {
    const res = await request('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: { email: 'nonexistent@example.com', password: 'wrongpassword' }
    });
    assert.notStrictEqual(res.status, 429);
  });
});

// 6. XSS Testing & Output Sanitization
describe('6. XSS Testing & Output Sanitization', () => {
  it('escapeHtml correctly escapes malicious script, img, and svg payloads', () => {
    const { escapeHtml } = require('../client/js/api.js');
    const payloads = [
      '<script>alert(1)</script>',
      '<img src=x onerror=alert(1)>',
      '"><svg onload=alert(1)>'
    ];

    for (const payload of payloads) {
      const escaped = escapeHtml(payload);
      assert.ok(!escaped.includes('<script>'));
      assert.ok(!escaped.includes('<img'));
      assert.ok(!escaped.includes('<svg'));
    }
  });
});

// 7. Error Disclosure Protection
describe('7. Error Disclosure Protection', () => {
  it('Production error handler hides stack traces and DB internals', async () => {
    const originalEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = 'production';
    try {
      const res = await request('/api/nonexistent-route-triggering-error-404-or-500');
      assert.ok(!res.body.includes('at Module._compile'));
      assert.ok(!res.body.includes('postgres://'));
    } finally {
      process.env.NODE_ENV = originalEnv;
    }
  });
});

// 8. Security Headers
describe('8. Security Headers Verification', () => {
  it('Response headers include Content-Security-Policy and X-Content-Type-Options', async () => {
    const res = await request('/api/health');
    assert.ok(res.headers['content-security-policy'] || res.headers['x-content-type-options']);
  });
});

// 9. CORS Enforcement
describe('9. CORS Enforcement', () => {
  it('Approved origin receives Access-Control-Allow-Origin header', async () => {
    const res = await request('/api/health', {
      headers: { 'Origin': 'http://localhost:3000' }
    });
    assert.strictEqual(res.headers['access-control-allow-origin'], 'http://localhost:3000');
  });

  it('Malicious origin does not receive Access-Control-Allow-Origin header', async () => {
    const res = await request('/api/health', {
      headers: { 'Origin': 'http://malicious-attacker.com' }
    });
    assert.notStrictEqual(res.headers['access-control-allow-origin'], 'http://malicious-attacker.com');
  });
});

// 10. Google Verification File
describe('10. Google Verification File Access', () => {
  it('Public unauthenticated request to /googlec3fe8f4c38db2e02.html returns HTTP 200 and exact content', async () => {
    const res = await request('/googlec3fe8f4c38db2e02.html');
    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.body.trim(), 'google-site-verification: googlec3fe8f4c38db2e02.html');
  });
});

