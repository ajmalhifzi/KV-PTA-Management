function getUser() {
  try { return JSON.parse(localStorage.getItem('user')); } catch { return null; }
}

function getToken() { return localStorage.getItem('token'); }

function requireAuth() {
  const user = getUser();
  if (!user) window.location.href = '/';
  return user;
}

function redirectByRole(role) {
  const map = { admin: '/admin/dashboard.html', teacher: '/teacher/dashboard.html', student: '/student/dashboard.html' };
  window.location.href = map[role] || '/';
}

function logout() {
  localStorage.removeItem('token');
  localStorage.removeItem('user');
  window.location.href = '/';
}
