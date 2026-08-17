const API_BASE = typeof window !== 'undefined' ? window.location.origin : '';

async function api(path, options = {}) {
  const token = typeof localStorage !== 'undefined' ? localStorage.getItem('token') : null;
  const headers = { 'Content-Type': 'application/json', ...options.headers };
  if (token) headers['Authorization'] = `Bearer ${token}`;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 60000);

  try {
    const res = await fetch(`${API_BASE}${path}`, { ...options, headers, signal: controller.signal });
    const responseText = await res.text();
    let data;
    try { data = responseText ? JSON.parse(responseText) : {}; }
    catch { data = { error: 'The server returned an unexpected response.' }; }
    if (!res.ok) {
      if (res.status === 401 && typeof localStorage !== 'undefined') {
        localStorage.removeItem('token');
        localStorage.removeItem('user');
        if (typeof window !== 'undefined') window.location.href = '/';
      }
      throw new Error(data.error || 'Request failed');
    }
    return data;
  } finally {
    clearTimeout(timeout);
  }
}

function get(path) { return api(path); }
function post(path, body) { return api(path, { method: 'POST', body: JSON.stringify(body) }); }
function put(path, body) { return api(path, { method: 'PUT', body: JSON.stringify(body) }); }
function patch(path, body) { return api(path, { method: 'PATCH', body: JSON.stringify(body) }); }
function del(path) { return api(path, { method: 'DELETE' }); }

let _supabaseConfig = null;
async function getSupabaseConfig() {
  if (!_supabaseConfig) _supabaseConfig = await api('/api/config/public');
  return _supabaseConfig;
}

function escapeHtml(str) {
  if (str === null || str === undefined) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function sanitizeFileName(name) {
  return Date.now() + '_' + String(name).replace(/[^a-zA-Z0-9._-]/g, '_');
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { escapeHtml, sanitizeFileName };
}


