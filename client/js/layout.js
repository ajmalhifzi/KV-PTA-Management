const NAV = {
  admin: [
    { label: 'Overview', icon: 'grid', href: '/admin/dashboard.html' },
    { label: 'Users', icon: 'users', href: '/admin/users.html' },
    { label: 'Groups', icon: 'users', href: '/admin/groups.html' },
    { label: 'Teachers', icon: 'book-open', href: '/admin/teachers.html' },
    { label: 'Students', icon: 'book-open', href: '/admin/students.html' },
    { label: 'Files', icon: 'upload', href: '/admin/files.html' },
    { label: 'Error Logs', icon: 'alert-circle', href: '/admin/error-logs.html' },
    { label: 'Seed Data', icon: 'database', href: '/admin/seed.html' },
    { label: 'GitHub', icon: 'book-open', href: '/admin/github-activity.html' },
  ],
  teacher: [
    { label: 'Dashboard', icon: 'grid', href: '/teacher/dashboard.html' },
    { label: 'Meeting Logs', icon: 'file-text', href: '/teacher/meetings.html' },
    { label: 'Resources', icon: 'upload', href: '/teacher/resources.html' },
    { label: 'Student Uploads', icon: 'upload', href: '/teacher/uploads.html' },
  ],
  student: [
    { label: 'Projects', icon: 'file-text', href: '/student/projects.html', collapsible: true },
    { label: 'Meetings', icon: 'message-square', href: '/student/meetings.html' },
    { label: 'Comments', icon: 'message-square', href: '/student/comments.html' },
    { label: 'Resources', icon: 'book-open', href: '/student/resources.html' },
    { label: 'Uploads', icon: 'upload', href: '/student/uploads.html' },
    { label: 'From Teacher', icon: 'upload', href: '/student/teacher-uploads.html' },
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

const NOTIFICATION_ICONS = {
  meeting: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--dark-blue-600)" stroke-width="2"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>',
  upload: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--dark-blue-600)" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>',
  resource: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--dark-blue-600)" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg>',
  comment: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--dark-blue-600)" stroke-width="2"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>',
  project_status: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--dark-blue-600)" stroke-width="2"><polyline points="9 11 12 14 22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/></svg>',
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
      ${navItems.map(item => {
        if (item.collapsible) {
          return `
            <div class="nav-group">
              <div style="display:flex;align-items:center">
                <a class="nav-item ${currentPath === item.href ? 'active' : ''}" href="${item.href}" style="flex:1">
                  ${ICONS[item.icon] || ''}
                  <span>${item.label}</span>
                </a>
                <button class="nav-toggle" onclick="event.stopPropagation();toggleNavGroup(this)" aria-label="Toggle projects">&#9654;</button>
              </div>
              <div class="nav-children" id="navChildren_${item.label}"></div>
            </div>
          `;
        }
        return `
          <a class="nav-item ${currentPath === item.href ? 'active' : ''}" href="${item.href}">
            ${ICONS[item.icon] || ''}
            <span>${item.label}</span>
          </a>
        `;
      })}
    </nav>
    <div style="padding: 8px; border-top: 1px solid var(--gray-200);">
      <a class="nav-item" onclick="logout()">
        ${ICONS['log-out']}
        <span>Logout</span>
      </a>
    </div>
  `;

  if (collapsed) sidebar.classList.add('collapsed');
  loadNavProjects();
}

function toggleNavGroup(btn) {
  const children = btn.parentElement.nextElementSibling;
  if (!children) return;
  const isOpen = children.classList.toggle('open');
  btn.classList.toggle('open', isOpen);
}

async function loadNavProjects() {
  const user = getUser();
  if (!user || user.role !== 'student') return;
  try {
    const data = await get('/api/student/group');
    const children = document.getElementById('navChildren_Projects');
    if (!children) return;
    if (data && data.project_id) {
      children.innerHTML = '<a class="nav-child-item" href="/student/projects.html#project-' + data.project_id + '">' + (data.title || 'My Project') + '</a>';
    } else {
      children.innerHTML = '<span class="nav-child-item" style="cursor:default;color:var(--gray-400);font-style:italic">No projects</span>';
    }
  } catch {}
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
      <div class="notif-container" style="position:relative">
        <button class="notif-btn" onclick="toggleNotif()" style="background:none;border:none;cursor:pointer;position:relative;padding:6px;display:flex;align-items:center">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="var(--gray-500)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/></svg>
          <span id="notifBadge" style="display:none;position:absolute;top:2px;right:2px;width:16px;height:16px;border-radius:50%;background:#c92a2a;color:#fff;font-size:9px;display:flex;align-items:center;justify-content:center;font-weight:700">0</span>
        </button>
        <div id="notifDropdown" class="notif-dropdown" style="display:none">
          <div style="padding:10px 14px;border-bottom:1px solid var(--gray-200);display:flex;justify-content:space-between;align-items:center">
            <span style="font-weight:600;font-size:13px;color:var(--dark-blue-800)">Notifications</span>
            <button class="btn btn-sm" style="font-size:10px;padding:2px 8px" onclick="markAllRead()">Mark all read</button>
          </div>
          <div id="notifList" style="max-height:360px;overflow-y:auto"></div>
        </div>
      </div>
      <div class="user-badge">
        <span>${user ? user.full_name : ''}</span>
        <div class="user-avatar">${initials}</div>
      </div>
    </div>
  `;
  loadNotifCount();
}

function renderPage(title) {
  renderSidebar();
  renderHeader(title);
}

/* Notifications */
async function loadNotifCount() {
  try {
    const { count } = await get('/api/notifications/unread-count');
    const badge = document.getElementById('notifBadge');
    if (count > 0) {
      badge.textContent = count > 99 ? '99+' : count;
      badge.style.display = 'flex';
    } else {
      badge.style.display = 'none';
    }
  } catch {}
  checkNewCommits();
}

async function checkNewCommits() {
  try {
    const user = getUser();
    if (user && user.role === 'teacher') {
      await get('/api/github/check-all-commits');
    }
  } catch {}
}

async function loadNotifList() {
  try {
    const notifs = await get('/api/notifications');
    const list = document.getElementById('notifList');
    if (!notifs.length) {
      list.innerHTML = '<div style="padding:24px;text-align:center;color:var(--gray-400);font-size:13px">No notifications</div>';
      return;
    }
    list.innerHTML = notifs.map(n => `
      <div class="notif-item ${n.is_read ? '' : 'unread'}" onclick="clickNotif('${n.id}','${n.related_url || ''}')">
        <div class="notif-icon">${NOTIFICATION_ICONS[n.type] || NOTIFICATION_ICONS.comment}</div>
        <div class="notif-body">
          <div class="notif-title">${n.title}</div>
          ${n.message ? '<div class="notif-msg">' + n.message + '</div>' : ''}
          <div class="notif-time">${timeAgo(n.created_at)}</div>
        </div>
        ${n.is_read ? '' : '<div style="width:8px;height:8px;border-radius:50%;background:var(--dark-blue-600);flex-shrink:0"></div>'}
      </div>
    `).join('');
  } catch {}
}

function toggleNotif() {
  const dd = document.getElementById('notifDropdown');
  if (dd.style.display === 'none') {
    dd.style.display = 'block';
    loadNotifList();
  } else {
    dd.style.display = 'none';
  }
}

async function clickNotif(id, url) {
  try {
    await api('/api/notifications/' + id + '/read', { method: 'PATCH' });
  } catch {}
  if (url) window.location.href = url;
  else document.getElementById('notifDropdown').style.display = 'none';
}

async function markAllRead() {
  try {
    await api('/api/notifications/read-all', { method: 'PUT' });
    loadNotifCount();
    document.querySelectorAll('.notif-item').forEach(el => {
      el.classList.remove('unread');
      const dot = el.querySelector(':scope > div:last-child');
      if (dot && dot.style) dot.style.display = 'none';
    });
  } catch {}
}

function timeAgo(val) {
  const diff = Date.now() - new Date(val).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return mins + 'm ago';
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return hrs + 'h ago';
  const days = Math.floor(hrs / 24);
  if (days < 7) return days + 'd ago';
  return new Date(val).toLocaleDateString('en-MY', { day: 'numeric', month: 'short' });
}

// Close notification dropdown on outside click
document.addEventListener('click', function(e) {
  const dd = document.getElementById('notifDropdown');
  if (dd && dd.style.display !== 'none') {
    const container = dd.closest('.notif-container');
    if (container && !container.contains(e.target)) {
      dd.style.display = 'none';
    }
  }
});

// Poll unread count every 30s
setInterval(loadNotifCount, 30000);
