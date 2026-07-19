const NAV = {
  admin: [
    { label: 'Overview', icon: 'grid', href: '/admin/dashboard.html' },
    { label: 'Teachers', icon: 'users', href: '/admin/teachers.html' },
    { label: 'Students', icon: 'book-open', href: '/admin/students.html' },
    { label: 'Error Logs', icon: 'alert-circle', href: '/admin/error-logs.html' },
    { label: 'Seed Data', icon: 'database', href: '/admin/seed.html' },
  ],
  teacher: [
    { label: 'Dashboard', icon: 'grid', href: '/teacher/dashboard.html' },
    { label: 'Resources', icon: 'upload', href: '/teacher/resources.html' },
  ],
  student: [
    { label: 'My Project', icon: 'file-text', href: '/student/project.html' },
    { label: 'Comments', icon: 'message-square', href: '/student/comments.html' },
    { label: 'Uploads', icon: 'upload', href: '/student/uploads.html' },
  ],
};

const ICONS = {
  grid: '<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/></svg>',
  users: '<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>',
  'book-open': '<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"/><path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"/></svg>',
  'alert-circle': '<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>',
  database: '<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><ellipse cx="12" cy="5" rx="9" ry="3"/><path d="M21 12c0 1.66-4 3-9 3s-9-1.34-9-3"/><path d="M3 5v14c0 1.66 4 3 9 3s9-1.34 9-3V5"/></svg>',
  upload: '<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>',
  'file-text': '<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/></svg>',
  'message-square': '<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>',
  'log-out': '<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>',
};

function renderSidebar() {
  const user = getUser();
  if (!user) return;
  const navItems = NAV[user.role] || [];
  const currentPath = window.location.pathname;

  const sidebar = document.getElementById('sidebar');
  const collapsed = localStorage.getItem('sidebar_collapsed') === 'true';

  sidebar.innerHTML = `
    <div class="sidebar-header">
      <div class="sidebar-logo">KV<span> PTA</span></div>
      <button class="sidebar-toggle" onclick="toggleSidebar()">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="18" x2="21" y2="18"/></svg>
      </button>
    </div>
    <nav class="sidebar-nav">
      ${navItems.map(item => `
        <a class="nav-item ${currentPath === item.href ? 'active' : ''}" href="${item.href}">
          ${ICONS[item.icon] || ''}
          <span>${item.label}</span>
        </a>
      `).join('')}
    </nav>
    <div style="padding: 8px; border-top: 1px solid var(--gray-200);">
      <a class="nav-item" onclick="logout()">
        ${ICONS['log-out']}
        <span>Logout</span>
      </a>
    </div>
  `;

  if (collapsed) sidebar.classList.add('collapsed');
}

function toggleSidebar() {
  const sidebar = document.getElementById('sidebar');
  sidebar.classList.toggle('collapsed');
  localStorage.setItem('sidebar_collapsed', sidebar.classList.contains('collapsed'));
}

function renderHeader(title) {
  const user = getUser();
  const header = document.getElementById('header');
  const initials = user ? user.full_name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2) : '??';
  header.innerHTML = `
    <div class="page-title">${title}</div>
    <div class="header-right">
      <div class="user-badge">
        <span>${user ? user.full_name : ''}</span>
        <div class="user-avatar">${initials}</div>
      </div>
    </div>
  `;
}

function renderPage(title) {
  renderSidebar();
  renderHeader(title);
}
