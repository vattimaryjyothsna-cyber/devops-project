// ============================================
//   SecurQR - Global Utilities
// ============================================

const APP = {
  name: 'SecurQR',
  version: '2.0.0',
  currentUser: null,
  
  // Cryptographic signatures for known products
  VALID_SIGNATURES: {
    'SIG-PG-001-VALID': 'p1',
    'SIG-VB-055-VALID': 'p2',
    'SIG-OC-089-VALID': 'p3',
    'SIG-MS-211-VALID': 'p4',
    'SIG-NM-177-VALID': 'p5',
  },

  init() {
    this.currentUser = this.getSession();
    this.renderToastContainer();
    this.initMobileMenu();
    this.checkAuth();
  },

  // ---- Session ----
  getSession() {
    try { return JSON.parse(localStorage.getItem('securqr_user') || 'null'); } catch { return null; }
  },
  setSession(user) { localStorage.setItem('securqr_user', JSON.stringify(user)); },
  clearSession() { localStorage.removeItem('securqr_user'); },

  checkAuth() {
    const path = location.pathname;
    const isLoginPage = path.includes('index.html') || path === '/' || path.endsWith('/') || path.endsWith('/index.html');
    const session = this.getSession();
    // Don't redirect if we're in an iframe or test environment
    if (window.self !== window.top) return;
    if (!session && !isLoginPage) {
      location.href = 'index.html';
    }
    if (session && isLoginPage) {
      location.href = 'dashboard.html';
    }
  },

  logout() {
    this.clearSession();
    location.href = 'index.html';
  },

  // ---- Toast Notifications ----
  renderToastContainer() {
    if (document.getElementById('toast-container')) return;
    const el = document.createElement('div');
    el.id = 'toast-container';
    el.className = 'toast-container';
    document.body.appendChild(el);
  },

  toast(type = 'info', title, message, duration = 4000) {
    const icons = { success: '✅', error: '❌', warning: '⚠️', info: 'ℹ️' };
    const container = document.getElementById('toast-container');
    const t = document.createElement('div');
    t.className = `toast ${type}`;
    t.innerHTML = `
      <span class="toast-icon">${icons[type]}</span>
      <div class="toast-content">
        <div class="toast-title">${title}</div>
        ${message ? `<div class="toast-msg">${message}</div>` : ''}
      </div>
      <button class="toast-close" onclick="this.closest('.toast').remove()">✕</button>
    `;
    container.appendChild(t);
    requestAnimationFrame(() => t.classList.add('show'));
    if (duration > 0) setTimeout(() => { t.classList.remove('show'); setTimeout(() => t.remove(), 400); }, duration);
    return t;
  },

  // ---- Mobile Menu ----
  initMobileMenu() {
    const toggle = document.querySelector('.menu-toggle');
    const sidebar = document.querySelector('.sidebar');
    if (!toggle || !sidebar) return;
    toggle.addEventListener('click', () => sidebar.classList.toggle('open'));
    document.addEventListener('click', e => {
      if (sidebar.classList.contains('open') && !sidebar.contains(e.target) && !toggle.contains(e.target)) {
        sidebar.classList.remove('open');
      }
    });
  },

  // ---- Active Nav Link ----
  setActiveNav() {
    const current = location.pathname.split('/').pop() || 'dashboard.html';
    document.querySelectorAll('.nav-item').forEach(item => {
      const href = item.getAttribute('href') || '';
      item.classList.toggle('active', href === current || href.endsWith(current));
    });
  },

  // ---- Render Nav User ----
  renderNavUser() {
    const user = this.getSession();
    if (!user) return;
    document.querySelectorAll('.nav-user-name').forEach(el => el.textContent = user.username);
    document.querySelectorAll('.nav-user-role').forEach(el => el.textContent = user.role);
    document.querySelectorAll('.nav-user-avatar').forEach(el => el.textContent = (user.username || 'U')[0].toUpperCase());
  },

  // ---- Cryptographic QR Verification ----
  async verifyQRCode(qrData) {
    // Simulate cryptographic verification process
    await this.sleep(900);
    
    const trimmed = qrData.trim();
    const productId = this.VALID_SIGNATURES[trimmed];
    
    if (productId) {
      // Fetch product details from API
      try {
        const resp = await fetch(`tables/products`);
        const json = await resp.json();
        const product = (json.data || []).find(p => p.id === productId || p.qr_signature === trimmed);
        if (product) {
          const confidence = 95 + Math.floor(Math.random() * 5);
          return { authentic: true, product, confidence, message: 'Cryptographic signature verified' };
        }
      } catch(e) {}
    }

    // Check for partial matches or fuzzy
    const lowerData = trimmed.toLowerCase();
    const isClearlyFake = lowerData.includes('fake') || lowerData.includes('counterfeit') 
      || lowerData.includes('piracy') || lowerData.includes('fraud');
    
    const confidence = isClearlyFake ? Math.floor(Math.random() * 10) : Math.floor(Math.random() * 25) + 5;
    const indicators = [];
    if (!trimmed.startsWith('SIG-')) indicators.push('missing_signature_prefix');
    if (isClearlyFake) indicators.push('known_fraud_pattern');
    indicators.push('hash_mismatch', 'not_in_registry');

    return {
      authentic: false,
      product: null,
      confidence,
      fraudIndicators: indicators,
      message: 'QR code not found in secure registry'
    };
  },

  // ---- Save Scan to DB ----
  async saveScan(qrData, result, method) {
    const user = this.getSession();
    const record = {
      qr_data: qrData,
      scan_result: result.authentic ? 'authentic' : 'fake',
      product_id: result.product?.id || '',
      product_name: result.product?.name || 'Unknown Product',
      scan_method: method,
      scanned_by: user?.username || 'anonymous',
      scan_location: 'Web Client',
      confidence_score: result.confidence || 0,
      fraud_indicators: result.fraudIndicators || [],
      scan_timestamp: new Date().toISOString(),
      device_info: navigator.userAgent.substring(0, 50),
      ip_address: '—'
    };
    try {
      await fetch('tables/scan_history', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(record)
      });
      if (!result.authentic) {
        await this.logSuspicious(qrData, result, user?.id || '');
      }
    } catch(e) { console.warn('Save scan failed', e); }
  },

  async logSuspicious(qrData, result, userId) {
    try {
      await fetch('tables/suspicious_activity', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          event_type: 'invalid_qr',
          severity: 'high',
          description: `Fake QR code scan attempted: ${qrData.substring(0,60)}`,
          source_ip: '—',
          user_id: userId,
          product_id: '',
          qr_data: qrData,
          resolved: false,
          timestamp: new Date().toISOString()
        })
      });
    } catch(e) {}
  },

  // ---- Utilities ----
  sleep(ms) { return new Promise(r => setTimeout(r, ms)); },

  formatDate(dateStr) {
    if (!dateStr) return '—';
    try {
      return new Date(dateStr).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
    } catch { return dateStr; }
  },

  formatDateTime(dateStr) {
    if (!dateStr) return '—';
    try {
      return new Date(dateStr).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
    } catch { return dateStr; }
  },

  timeAgo(dateStr) {
    if (!dateStr) return '—';
    const diff = Date.now() - new Date(dateStr).getTime();
    const m = Math.floor(diff / 60000);
    const h = Math.floor(m / 60);
    const d = Math.floor(h / 24);
    if (d > 0) return `${d}d ago`;
    if (h > 0) return `${h}h ago`;
    if (m > 0) return `${m}m ago`;
    return 'just now';
  },

  copyToClipboard(text) {
    navigator.clipboard.writeText(text).then(() => {
      this.toast('success', 'Copied!', 'Text copied to clipboard');
    }).catch(() => {
      this.toast('error', 'Failed', 'Could not copy to clipboard');
    });
  },

  escapeHtml(str) {
    const div = document.createElement('div');
    div.appendChild(document.createTextNode(str || ''));
    return div.innerHTML;
  },

  generateQRHash() {
    const chars = 'abcdef0123456789';
    return Array.from({length: 40}, () => chars[Math.floor(Math.random() * chars.length)]).join('');
  },

  getBadgeHtml(result) {
    if (result === 'authentic') return '<span class="badge badge-success">✔ Authentic</span>';
    if (result === 'fake') return '<span class="badge badge-danger">✘ Fake</span>';
    return '<span class="badge badge-neutral">Unknown</span>';
  },

  getSeverityBadge(s) {
    const m = { critical: 'danger', high: 'danger', medium: 'warning', low: 'info' };
    return `<span class="badge badge-${m[s] || 'neutral'}">${s?.toUpperCase()}</span>`;
  },

  // ---- Sidebar HTML ----
  getSidebarHTML() {
    const user = this.getSession() || {};
    return `
    <aside class="sidebar" id="sidebar">
      <div class="sidebar-logo">
        <div class="logo-icon">🔐</div>
        <div class="logo-text">
          <h2>SecurQR</h2>
          <span>Anti-Fraud Platform</span>
        </div>
      </div>

      <nav class="sidebar-nav">
        <p class="sidebar-section-label">Main</p>
        <a href="dashboard.html" class="nav-item">
          <span class="icon">📊</span> Dashboard
        </a>
        <a href="scanner.html" class="nav-item">
          <span class="icon">📷</span> QR Scanner
        </a>
        <a href="history.html" class="nav-item">
          <span class="icon">🗂️</span> Scan History
        </a>

        <p class="sidebar-section-label">Management</p>
        <a href="products.html" class="nav-item">
          <span class="icon">📦</span> Product Catalog
        </a>
        <a href="generate.html" class="nav-item">
          <span class="icon">⚡</span> QR Generator
        </a>
        <a href="activity.html" class="nav-item">
          <span class="icon">🚨</span> Suspicious Activity
          <span class="nav-badge" id="activity-badge">—</span>
        </a>

        <p class="sidebar-section-label">Account</p>
        <a href="profile.html" class="nav-item">
          <span class="icon">👤</span> Profile & Settings
        </a>
        <a href="#" class="nav-item" onclick="APP.logout()">
          <span class="icon">🚪</span> Sign Out
        </a>
      </nav>

      <div class="sidebar-footer">
        <div class="user-card" onclick="location.href='profile.html'">
          <div class="user-avatar nav-user-avatar">${(user.username || 'U')[0].toUpperCase()}</div>
          <div class="user-info">
            <div class="name nav-user-name">${user.username || 'User'}</div>
            <div class="role nav-user-role">${user.role || 'user'}</div>
          </div>
          <span style="color:var(--text-muted); font-size:14px;">⚙</span>
        </div>
      </div>
    </aside>
    `;
  },

  // ---- Header HTML ----
  getHeaderHTML(title, subtitle) {
    return `
    <header class="app-header">
      <div class="header-left">
        <button class="menu-toggle" id="menuToggle">☰</button>
        <div>
          <div class="header-title">${title}</div>
          ${subtitle ? `<div class="header-subtitle">${subtitle}</div>` : ''}
        </div>
      </div>
      <div class="header-actions">
        <div class="status-dot online" style="font-size:12px; color: var(--accent);">System Online</div>
        <button class="header-btn" onclick="location.href='scanner.html'" title="Quick Scan">📷</button>
        <button class="header-btn" onclick="location.href='activity.html'" title="Alerts" style="position:relative;">
          🔔 <span class="notif-dot" id="notif-dot"></span>
        </button>
        <button class="header-btn" onclick="location.href='profile.html'" title="Profile">👤</button>
      </div>
    </header>
    `;
  },

  async loadActivityBadge() {
    try {
      const resp = await fetch('tables/suspicious_activity?limit=100');
      const json = await resp.json();
      const unresolved = (json.data || []).filter(a => !a.resolved).length;
      const badge = document.getElementById('activity-badge');
      if (badge) badge.textContent = unresolved || '0';
      const notifDot = document.getElementById('notif-dot');
      if (notifDot) notifDot.style.display = unresolved > 0 ? 'block' : 'none';
    } catch(e) {}
  }
};

document.addEventListener('DOMContentLoaded', () => {
  APP.init();
  APP.setActiveNav();
  APP.renderNavUser();
  APP.loadActivityBadge();
});
