const API_BASE = window.location.origin;

async function api(path, options = {}) {
  const token = localStorage.getItem('token');
  const headers = { 'Content-Type': 'application/json', ...options.headers };
  if (token) headers['Authorization'] = `Bearer ${token}`;

  const res = await fetch(`${API_BASE}${path}`, { ...options, headers });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Request failed');
  return data;
}

function get(path) { return api(path); }
function post(path, body) { return api(path, { method: 'POST', body: JSON.stringify(body) }); }
function put(path, body) { return api(path, { method: 'PUT', body: JSON.stringify(body) }); }
function patch(path, body) { return api(path, { method: 'PATCH', body: JSON.stringify(body) }); }
