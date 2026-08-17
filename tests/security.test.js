const { describe, it, before, after } = require('node:test');
const assert = require('node:assert');
const http = require('http');
const jwt = require('jsonwebtoken');

// Ensure test environment variables
process.env.JWT_SECRET = process.env.JWT_SECRET || 'test_jwt_secret_key_1234567890123456789012345678901234567890';
process.env.NODE_ENV = 'test';

const app = require('../api/index.js');

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

describe('1. Authentication & Privilege Escalation Hardening', () => {
  it('Public registration forces "student" role even if client submits "admin"', async () => {
    const email = `test_admin_exploit_${Date.now()}@example.com`;
    const res = await request('/api/auth/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: {
        email,
        password: 'password123',
        full_name: 'Attacker Admin',
        role: 'admin', // Attempted escalation
      },
    });

    if (res.status === 201) {
      assert.strictEqual(res.json.user.role, 'student', 'Role must be forced to student');
    } else {
      assert.notStrictEqual(res.json?.user?.role, 'admin');
    }
  });

  it('Public registration forces "student" role even if client submits "teacher"', async () => {
    const email = `test_teacher_exploit_${Date.now()}@example.com`;
    const res = await request('/api/auth/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: {
        email,
        password: 'password123',
        full_name: 'Attacker Teacher',
        role: 'teacher',
      },
    });

    if (res.status === 201) {
      assert.strictEqual(res.json.user.role, 'student', 'Role must be forced to student');
    } else {
      assert.notStrictEqual(res.json?.user?.role, 'teacher');
    }
  });
});

describe('2. JWT Verification & Token Hardening', () => {
  it('Requests without Authorization header fail with 401', async () => {
    const res = await request('/api/student/projects');
    assert.strictEqual(res.status, 401);
  });

  it('Requests with malformed Bearer token fail with 401', async () => {
    const res = await request('/api/student/projects', {
      headers: { 'Authorization': 'Bearer malformed.jwt.token' }
    });
    assert.strictEqual(res.status, 401);
  });

  it('Requests with token signed with wrong secret fail with 401', async () => {
    const fakeToken = jwt.sign({ id: '11111111-1111-1111-1111-111111111111', role: 'student' }, 'wrong_secret');
    const res = await request('/api/student/projects', {
      headers: { 'Authorization': `Bearer ${fakeToken}` }
    });
    assert.strictEqual(res.status, 401);
  });
});

describe('3. Authorization Matrix & Role Protection', () => {
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
});

describe('4. Protected File Access Security', () => {
  it('Unauthenticated GET request to /api/files/uploads/:id is rejected with 401', async () => {
    const res = await request('/api/files/uploads/00000000-0000-0000-0000-000000000099');
    assert.strictEqual(res.status, 401);
  });

  it('Unauthenticated GET request to /api/files/photos/:id is rejected with 401', async () => {
    const res = await request('/api/files/photos/00000000-0000-0000-0000-000000000099');
    assert.strictEqual(res.status, 401);
  });

  it('Unauthenticated GET request to /api/files/resources/:id is rejected with 401', async () => {
    const res = await request('/api/files/resources/00000000-0000-0000-0000-000000000099');
    assert.strictEqual(res.status, 401);
  });
});

describe('5. Input Escaping & Helper Utility Verification', () => {
  it('escapeHtml correctly escapes malicious script and image tags', () => {
    const { escapeHtml } = require('../client/js/api.js');
    const input = '<script>alert(1)</script><img src=x onerror=alert(1)>';
    const escaped = escapeHtml(input);

    assert.ok(!escaped.includes('<script>'));
    assert.ok(!escaped.includes('<img'));
    assert.strictEqual(escaped.includes('&lt;script&gt;'), true);
  });
});
