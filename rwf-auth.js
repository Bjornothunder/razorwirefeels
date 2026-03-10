/**
 * RAZOR WIRE FEELS — Shared Auth System
 * Drop this script into any RWF page and it handles:
 *  - Login / Signup modal
 *  - Auth state across all pages (localStorage)
 *  - Subscriptions + email notifications
 *  - Likes + comments
 *  - Nav auth button injection
 *
 * Usage: <script src="rwf-auth.js"></script>
 * Place before </body> on any RWF page.
 *
 * For real email notifications, plug in EmailJS:
 *   Set RWF_EMAIL_SERVICE_ID, RWF_EMAIL_TEMPLATE_ID, RWF_EMAIL_PUBLIC_KEY
 */

(function() {
'use strict';

// ============================================================
// CONFIG — swap these out for real backend later
// ============================================================
const CONFIG = {
  siteName: 'Razor Wire Feels',
  emailServiceId: 'YOUR_EMAILJS_SERVICE_ID',    // EmailJS
  emailTemplateId: 'YOUR_EMAILJS_TEMPLATE_ID',
  emailPublicKey: 'YOUR_EMAILJS_PUBLIC_KEY',
  commissionRate: 0.15,
  storageKey: 'rwf_auth',
  usersKey: 'rwf_users',
  subsKey: 'rwf_subscriptions',
  likesKey: 'rwf_likes',
  commentsKey: 'rwf_comments',
};

// ============================================================
// STORAGE HELPERS
// ============================================================
const store = {
  get: (key) => { try { return JSON.parse(localStorage.getItem(key)); } catch { return null; } },
  set: (key, val) => localStorage.setItem(key, JSON.stringify(val)),
  del: (key) => localStorage.removeItem(key),
};

// ============================================================
// USER DB (localStorage until you have a real backend)
// ============================================================
function getUsers() { return store.get(CONFIG.usersKey) || {}; }
function saveUsers(u) { store.set(CONFIG.usersKey, u); }

function getCurrentUser() { return store.get(CONFIG.storageKey) || null; }
function setCurrentUser(u) { store.set(CONFIG.storageKey, u); }
function clearCurrentUser() { store.del(CONFIG.storageKey); }

// ============================================================
// AUTH FUNCTIONS
// ============================================================
function register(email, password, displayName) {
  const users = getUsers();
  const key = email.toLowerCase().trim();
  if (users[key]) return { error: 'An account with that email already exists.' };
  if (password.length < 6) return { error: 'Password must be at least 6 characters.' };
  const user = {
    id: 'u_' + Date.now(),
    email: key,
    displayName: displayName.trim() || key.split('@')[0],
    password: btoa(password), // base64 — replace with real hash on backend
    createdAt: new Date().toISOString(),
    avatar: displayName.trim()[0].toUpperCase(),
    subscriptions: [],
    purchases: [],
    role: 'supporter',
  };
  users[key] = user;
  saveUsers(users);
  const sessionUser = { ...user };
  delete sessionUser.password;
  setCurrentUser(sessionUser);
  return { user: sessionUser };
}

function login(email, password) {
  const users = getUsers();
  const key = email.toLowerCase().trim();
  const user = users[key];
  if (!user) return { error: 'No account found with that email.' };
  if (atob(user.password) !== password) return { error: 'Incorrect password.' };
  const sessionUser = { ...user };
  delete sessionUser.password;
  setCurrentUser(sessionUser);
  return { user: sessionUser };
}

function logout() {
  clearCurrentUser();
  updateNavAuth();
  RWF.emit('logout');
}

// ============================================================
// SUBSCRIPTIONS
// ============================================================
function getSubs() { return store.get(CONFIG.subsKey) || {}; }
function saveSubs(s) { store.set(CONFIG.subsKey, s); }

function subscribe(inmateId) {
  const user = getCurrentUser();
  if (!user) { openModal('login'); return false; }
  const subs = getSubs();
  if (!subs[user.id]) subs[user.id] = [];
  if (!subs[user.id].includes(inmateId)) {
    subs[user.id].push(inmateId);
    saveSubs(subs);
    // Update user object
    const users = getUsers();
    if (users[user.email]) {
      users[user.email].subscriptions = subs[user.id];
      saveUsers(users);
    }
    RWF.emit('subscribed', { inmateId });
    return true;
  }
  return false;
}

function unsubscribe(inmateId) {
  const user = getCurrentUser();
  if (!user) return false;
  const subs = getSubs();
  if (subs[user.id]) {
    subs[user.id] = subs[user.id].filter(id => id !== inmateId);
    saveSubs(subs);
  }
  RWF.emit('unsubscribed', { inmateId });
  return true;
}

function isSubscribed(inmateId) {
  const user = getCurrentUser();
  if (!user) return false;
  const subs = getSubs();
  return (subs[user.id] || []).includes(inmateId);
}

function getMySubscriptions() {
  const user = getCurrentUser();
  if (!user) return [];
  const subs = getSubs();
  return subs[user.id] || [];
}

// ============================================================
// LIKES
// ============================================================
function getLikes() { return store.get(CONFIG.likesKey) || {}; }
function saveLikes(l) { store.set(CONFIG.likesKey, l); }

function toggleLike(contentId) {
  const user = getCurrentUser();
  if (!user) { openModal('login'); return { liked: false, count: getLikeCount(contentId) }; }
  const likes = getLikes();
  if (!likes[contentId]) likes[contentId] = [];
  const idx = likes[contentId].indexOf(user.id);
  if (idx === -1) {
    likes[contentId].push(user.id);
  } else {
    likes[contentId].splice(idx, 1);
  }
  saveLikes(likes);
  const liked = likes[contentId].includes(user.id);
  RWF.emit('liked', { contentId, liked });
  return { liked, count: likes[contentId].length };
}

function isLiked(contentId) {
  const user = getCurrentUser();
  if (!user) return false;
  const likes = getLikes();
  return (likes[contentId] || []).includes(user.id);
}

function getLikeCount(contentId) {
  const likes = getLikes();
  return (likes[contentId] || []).length;
}

// ============================================================
// COMMENTS
// ============================================================
function getComments() { return store.get(CONFIG.commentsKey) || {}; }
function saveComments(c) { store.set(CONFIG.commentsKey, c); }

function postComment(contentId, text) {
  const user = getCurrentUser();
  if (!user) { openModal('login'); return null; }
  if (!text.trim()) return null;
  const comments = getComments();
  if (!comments[contentId]) comments[contentId] = [];
  const comment = {
    id: 'c_' + Date.now(),
    userId: user.id,
    displayName: user.displayName,
    avatar: user.avatar,
    text: text.trim(),
    timestamp: new Date().toISOString(),
  };
  comments[contentId].unshift(comment);
  saveComments(comments);
  RWF.emit('commented', { contentId, comment });
  return comment;
}

function getCommentsForContent(contentId) {
  const comments = getComments();
  return comments[contentId] || [];
}

// ============================================================
// EMAIL NOTIFICATIONS (EmailJS hook)
// ============================================================
async function notifySubscribers(inmateId, inmateName, episodeTitle, episodeUrl) {
  const subs = getSubs();
  const users = getUsers();

  // Find all users subscribed to this inmate
  const subscriberEmails = Object.values(users)
    .filter(u => (subs[u.id] || []).includes(inmateId))
    .map(u => u.email);

  if (subscriberEmails.length === 0) return;

  // EmailJS integration — plug in your keys above
  if (typeof emailjs !== 'undefined' &&
      CONFIG.emailServiceId !== 'YOUR_EMAILJS_SERVICE_ID') {
    for (const email of subscriberEmails) {
      try {
        await emailjs.send(
          CONFIG.emailServiceId,
          CONFIG.emailTemplateId,
          {
            to_email: email,
            inmate_name: inmateName,
            episode_title: episodeTitle,
            episode_url: episodeUrl,
            site_name: CONFIG.siteName,
          },
          CONFIG.emailPublicKey
        );
      } catch(e) {
        console.error('[RWF] Email failed for', email, e);
      }
    }
  } else {
    // Dev mode: log who would be notified
    console.log('[RWF] Would notify:', subscriberEmails, 'about:', episodeTitle);
  }
}

// ============================================================
// EVENT EMITTER
// ============================================================
const _listeners = {};
const RWF = {
  on: (event, fn) => {
    if (!_listeners[event]) _listeners[event] = [];
    _listeners[event].push(fn);
  },
  emit: (event, data) => {
    (_listeners[event] || []).forEach(fn => fn(data));
  },
  // Public API
  auth: {
    login, logout, register,
    getCurrentUser, isLoggedIn: () => !!getCurrentUser(),
  },
  subs: { subscribe, unsubscribe, isSubscribed, getMySubscriptions },
  likes: { toggle: toggleLike, isLiked, getCount: getLikeCount },
  comments: { post: postComment, get: getCommentsForContent },
  notify: notifySubscribers,
  openModal,
};

window.RWF = RWF;

// ============================================================
// MODAL HTML
// ============================================================
const MODAL_HTML = `
<div id="rwfAuthOverlay" style="
  position:fixed; inset:0; background:rgba(0,0,0,0.88);
  z-index:99999; display:none; align-items:center;
  justify-content:center; padding:1rem;
  font-family:'IBM Plex Mono',monospace;
">
  <div id="rwfAuthModal" style="
    background:#161616; border:1px solid #2a2a2a;
    border-top:3px solid #c0392b; width:100%;
    max-width:420px; position:relative;
    animation: rwfSlideUp 0.25s ease;
  ">
    <style>
      @keyframes rwfSlideUp {
        from { opacity:0; transform:translateY(20px); }
        to { opacity:1; transform:translateY(0); }
      }
      .rwf-tab { cursor:pointer; padding:0.85rem 1.5rem; font-size:0.65rem;
        letter-spacing:0.2em; text-transform:uppercase; color:#7a7060;
        border-bottom:2px solid transparent; transition:all 0.2s; }
      .rwf-tab.active { color:#ede8df; border-bottom-color:#c0392b; }
      .rwf-input { width:100%; background:#0a0a0a; border:1px solid #2a2a2a;
        color:#ede8df; font-family:'IBM Plex Mono',monospace; font-size:0.82rem;
        padding:0.7rem 0.9rem; outline:none; transition:border-color 0.2s;
        letter-spacing:0.04em; }
      .rwf-input:focus { border-color:#c0392b; }
      .rwf-input::placeholder { color:#4a4035; }
      .rwf-label { font-size:0.58rem; letter-spacing:0.22em; color:#7a7060;
        text-transform:uppercase; display:block; margin-bottom:0.35rem; }
      .rwf-submit { width:100%; background:#c0392b; border:none; color:white;
        font-family:'IBM Plex Mono',monospace; font-size:0.72rem; letter-spacing:0.2em;
        text-transform:uppercase; padding:0.85rem; cursor:pointer; transition:background 0.2s; }
      .rwf-submit:hover { background:#a93226; }
      .rwf-err { color:#c0392b; font-size:0.62rem; letter-spacing:0.08em;
        text-align:center; display:none; padding:0.4rem; }
      .rwf-divider { display:flex; align-items:center; gap:0.75rem; margin:1rem 0;
        font-size:0.58rem; color:#4a4035; letter-spacing:0.15em; text-transform:uppercase; }
      .rwf-divider::before, .rwf-divider::after { content:''; flex:1; height:1px; background:#2a2a2a; }
      .rwf-perks { display:flex; flex-direction:column; gap:0.5rem; }
      .rwf-perk { display:flex; align-items:flex-start; gap:0.6rem; font-size:0.7rem; color:#d4c9b8; line-height:1.5; }
      .rwf-perk-icon { color:#c0392b; flex-shrink:0; margin-top:0.1rem; }
    </style>

    <!-- Header -->
    <div style="padding:1.5rem 1.5rem 0; display:flex; justify-content:space-between; align-items:flex-start;">
      <div>
        <div style="font-family:'Bebas Neue',sans-serif; font-size:1.6rem; color:#ede8df; letter-spacing:0.08em; line-height:1;">
          RAZOR WIRE <span style="color:#c0392b;">FEELS</span>
        </div>
        <div style="font-size:0.58rem; letter-spacing:0.2em; color:#7a7060; text-transform:uppercase; margin-top:0.25rem;">
          Supporter Account
        </div>
      </div>
      <button onclick="RWF_closeModal()" style="
        background:none; border:1px solid #2a2a2a; color:#7a7060;
        font-size:1rem; cursor:pointer; padding:0.3rem 0.6rem;
        line-height:1; transition:all 0.2s;
      " onmouseover="this.style.borderColor='#c0392b';this.style.color='#c0392b'"
         onmouseout="this.style.borderColor='#2a2a2a';this.style.color='#7a7060'">✕</button>
    </div>

    <!-- Tabs -->
    <div style="display:flex; border-bottom:1px solid #2a2a2a; margin-top:1rem;">
      <div class="rwf-tab active" id="rwfTabLogin" onclick="RWF_switchTab('login')">Sign In</div>
      <div class="rwf-tab" id="rwfTabSignup" onclick="RWF_switchTab('signup')">Create Account</div>
    </div>

    <!-- LOGIN FORM -->
    <div id="rwfLoginForm" style="padding:1.5rem; display:flex; flex-direction:column; gap:1rem;">
      <div>
        <label class="rwf-label">Email</label>
        <input type="email" class="rwf-input" id="rwfLoginEmail" placeholder="your@email.com"
          onkeydown="if(event.key==='Enter') RWF_doLogin()">
      </div>
      <div>
        <label class="rwf-label">Password</label>
        <input type="password" class="rwf-input" id="rwfLoginPass" placeholder="••••••••"
          onkeydown="if(event.key==='Enter') RWF_doLogin()">
      </div>
      <div class="rwf-err" id="rwfLoginErr"></div>
      <button class="rwf-submit" onclick="RWF_doLogin()">Sign In →</button>
      <div style="text-align:center; font-size:0.6rem; color:#7a7060; letter-spacing:0.1em;">
        No account? <span onclick="RWF_switchTab('signup')" style="color:#c0392b; cursor:pointer; text-decoration:underline;">Create one free</span>
      </div>
    </div>

    <!-- SIGNUP FORM -->
    <div id="rwfSignupForm" style="padding:1.5rem; display:none; flex-direction:column; gap:1rem;">

      <!-- Perks -->
      <div style="background:#0a0a0a; border:1px solid #2a2a2a; border-left:3px solid #c0392b; padding:1rem; margin-bottom:0.5rem;">
        <div style="font-size:0.58rem; letter-spacing:0.2em; color:#c0392b; text-transform:uppercase; margin-bottom:0.75rem;">Free supporter account includes</div>
        <div class="rwf-perks">
          <div class="rwf-perk"><span class="rwf-perk-icon">→</span>Subscribe to any inmate's page and get email alerts for new episodes</div>
          <div class="rwf-perk"><span class="rwf-perk-icon">→</span>Like and comment on writing and artwork</div>
          <div class="rwf-perk"><span class="rwf-perk-icon">→</span>Purchase writing, artwork, and commissions</div>
          <div class="rwf-perk"><span class="rwf-perk-icon">→</span>Follow serialized series episode by episode</div>
        </div>
      </div>

      <div>
        <label class="rwf-label">Display Name</label>
        <input type="text" class="rwf-input" id="rwfSignupName" placeholder="How you'll appear in comments">
      </div>
      <div>
        <label class="rwf-label">Email</label>
        <input type="email" class="rwf-input" id="rwfSignupEmail" placeholder="your@email.com">
      </div>
      <div>
        <label class="rwf-label">Password</label>
        <input type="password" class="rwf-input" id="rwfSignupPass" placeholder="Min. 6 characters">
      </div>
      <div style="font-size:0.6rem; color:#4a4035; letter-spacing:0.05em; line-height:1.7;">
        By creating an account you agree that this platform exists to amplify the voices of incarcerated individuals. Comments that dehumanize, demean, or harass will be removed.
      </div>
      <div class="rwf-err" id="rwfSignupErr"></div>
      <button class="rwf-submit" onclick="RWF_doSignup()">Create Free Account →</button>
    </div>

  </div>
</div>

<!-- USER MENU DROPDOWN -->
<div id="rwfUserMenu" style="
  position:fixed; top:62px; right:1rem; z-index:99998;
  background:#161616; border:1px solid #2a2a2a;
  border-top:2px solid #c0392b; min-width:220px;
  display:none; flex-direction:column;
  font-family:'IBM Plex Mono',monospace;
  box-shadow: 0 8px 32px rgba(0,0,0,0.5);
">
  <div id="rwfMenuHeader" style="padding:1rem; border-bottom:1px solid #2a2a2a;">
    <div id="rwfMenuName" style="font-size:0.8rem; color:#ede8df; margin-bottom:0.2rem;"></div>
    <div id="rwfMenuEmail" style="font-size:0.58rem; color:#7a7060; letter-spacing:0.05em;"></div>
  </div>
  <a href="supporter-dashboard.html" style="display:block; padding:0.75rem 1rem;
    font-size:0.65rem; letter-spacing:0.12em; color:#d4c9b8; text-decoration:none;
    text-transform:uppercase; transition:all 0.15s; border-bottom:1px solid #1a1a1a;"
    onmouseover="this.style.background='#2a2a2a'; this.style.color='#ede8df'"
    onmouseout="this.style.background='transparent'; this.style.color='#d4c9b8'">
    ▸ My Dashboard
  </a>
  <a href="supporter-dashboard.html#subscriptions" style="display:block; padding:0.75rem 1rem;
    font-size:0.65rem; letter-spacing:0.12em; color:#d4c9b8; text-decoration:none;
    text-transform:uppercase; transition:all 0.15s; border-bottom:1px solid #1a1a1a;"
    onmouseover="this.style.background='#2a2a2a'; this.style.color='#ede8df'"
    onmouseout="this.style.background='transparent'; this.style.color='#d4c9b8'">
    ▸ My Subscriptions
  </a>
  <a href="supporter-dashboard.html#purchases" style="display:block; padding:0.75rem 1rem;
    font-size:0.65rem; letter-spacing:0.12em; color:#d4c9b8; text-decoration:none;
    text-transform:uppercase; transition:all 0.15s; border-bottom:1px solid #1a1a1a;"
    onmouseover="this.style.background='#2a2a2a'; this.style.color='#ede8df'"
    onmouseout="this.style.background='transparent'; this.style.color='#d4c9b8'">
    ▸ Purchases
  </a>
  <button onclick="RWF.auth.logout()" style="
    background:none; border:none; width:100%; text-align:left;
    padding:0.75rem 1rem; font-family:'IBM Plex Mono',monospace;
    font-size:0.65rem; letter-spacing:0.12em; color:#7a7060;
    text-transform:uppercase; cursor:pointer; transition:all 0.15s;
  " onmouseover="this.style.color='#c0392b'" onmouseout="this.style.color='#7a7060'">
    ▸ Sign Out
  </button>
</div>
`;

// ============================================================
// MODAL / MENU CONTROLS
// ============================================================
let currentTab = 'login';
let menuOpen = false;

function openModal(tab = 'login') {
  const overlay = document.getElementById('rwfAuthOverlay');
  if (!overlay) return;
  overlay.style.display = 'flex';
  RWF_switchTab(tab);
  // Focus first input
  setTimeout(() => {
    const input = tab === 'login'
      ? document.getElementById('rwfLoginEmail')
      : document.getElementById('rwfSignupName');
    if (input) input.focus();
  }, 100);
}

window.RWF_closeModal = function() {
  const overlay = document.getElementById('rwfAuthOverlay');
  if (overlay) overlay.style.display = 'none';
};

window.RWF_switchTab = function(tab) {
  currentTab = tab;
  document.getElementById('rwfTabLogin').className = 'rwf-tab' + (tab === 'login' ? ' active' : '');
  document.getElementById('rwfTabSignup').className = 'rwf-tab' + (tab === 'signup' ? ' active' : '');
  document.getElementById('rwfLoginForm').style.display = tab === 'login' ? 'flex' : 'none';
  document.getElementById('rwfSignupForm').style.display = tab === 'signup' ? 'flex' : 'none';
};

window.RWF_doLogin = function() {
  const email = document.getElementById('rwfLoginEmail').value;
  const pass = document.getElementById('rwfLoginPass').value;
  const errEl = document.getElementById('rwfLoginErr');
  errEl.style.display = 'none';
  const result = login(email, pass);
  if (result.error) {
    errEl.textContent = result.error;
    errEl.style.display = 'block';
  } else {
    RWF_closeModal();
    updateNavAuth();
    RWF.emit('login', result.user);
    showToast('Welcome back, ' + result.user.displayName);
  }
};

window.RWF_doSignup = function() {
  const name = document.getElementById('rwfSignupName').value;
  const email = document.getElementById('rwfSignupEmail').value;
  const pass = document.getElementById('rwfSignupPass').value;
  const errEl = document.getElementById('rwfSignupErr');
  errEl.style.display = 'none';
  if (!name.trim()) { errEl.textContent = 'Please enter a display name.'; errEl.style.display = 'block'; return; }
  if (!email.includes('@')) { errEl.textContent = 'Please enter a valid email.'; errEl.style.display = 'block'; return; }
  const result = register(email, pass, name);
  if (result.error) {
    errEl.textContent = result.error;
    errEl.style.display = 'block';
  } else {
    RWF_closeModal();
    updateNavAuth();
    RWF.emit('login', result.user);
    showToast('Account created! Welcome to Razor Wire Feels.');
  }
};

// ============================================================
// NAV AUTH BUTTON — injected into any page with class .rwf-nav
// ============================================================
function updateNavAuth() {
  const containers = document.querySelectorAll('.rwf-auth-slot');
  const user = getCurrentUser();

  containers.forEach(slot => {
    if (user) {
      slot.innerHTML = `
        <div style="display:flex; align-items:center; gap:0.5rem;">
          <button id="rwfAvatarBtn" onclick="RWF_toggleMenu()" style="
            background:#c0392b; border:none; color:white;
            font-family:'IBM Plex Mono',monospace; font-size:0.7rem;
            font-weight:700; letter-spacing:0.05em; width:32px; height:32px;
            cursor:pointer; transition:background 0.2s; flex-shrink:0;
          " onmouseover="this.style.background='#a93226'"
             onmouseout="this.style.background='#c0392b'">
            ${user.avatar}
          </button>
          <button onclick="RWF_toggleMenu()" style="
            background:none; border:none; color:#d4c9b8;
            font-family:'IBM Plex Mono',monospace; font-size:0.65rem;
            letter-spacing:0.1em; text-transform:uppercase; cursor:pointer;
            white-space:nowrap; max-width:100px; overflow:hidden;
            text-overflow:ellipsis; padding:0;
          ">${user.displayName}</button>
        </div>
      `;
    } else {
      slot.innerHTML = `
        <div style="display:flex; align-items:center; gap:0.5rem;">
          <button onclick="RWF.openModal('login')" style="
            background:none; border:1px solid #2a2a2a; color:#7a7060;
            font-family:'IBM Plex Mono',monospace; font-size:0.62rem;
            letter-spacing:0.15em; text-transform:uppercase; padding:0.4rem 0.85rem;
            cursor:pointer; transition:all 0.2s; white-space:nowrap;
          " onmouseover="this.style.borderColor='#7a7060'; this.style.color='#d4c9b8'"
             onmouseout="this.style.borderColor='#2a2a2a'; this.style.color='#7a7060'">
            Sign In
          </button>
          <button onclick="RWF.openModal('signup')" style="
            background:#c0392b; border:none; color:white;
            font-family:'IBM Plex Mono',monospace; font-size:0.62rem;
            letter-spacing:0.15em; text-transform:uppercase; padding:0.4rem 0.85rem;
            cursor:pointer; transition:background 0.2s; white-space:nowrap;
          " onmouseover="this.style.background='#a93226'"
             onmouseout="this.style.background='#c0392b'">
            Join Free
          </button>
        </div>
      `;
    }
  });

  // Update user menu header
  if (user) {
    const nameEl = document.getElementById('rwfMenuName');
    const emailEl = document.getElementById('rwfMenuEmail');
    if (nameEl) nameEl.textContent = user.displayName;
    if (emailEl) emailEl.textContent = user.email;
  }
}

window.RWF_toggleMenu = function() {
  const menu = document.getElementById('rwfUserMenu');
  if (!menu) return;
  menuOpen = !menuOpen;
  menu.style.display = menuOpen ? 'flex' : 'none';
};

// Close menu when clicking outside
document.addEventListener('click', function(e) {
  if (menuOpen && !e.target.closest('#rwfUserMenu') &&
      !e.target.closest('#rwfAvatarBtn') &&
      !e.target.closest('[onclick*="RWF_toggleMenu"]')) {
    const menu = document.getElementById('rwfUserMenu');
    if (menu) menu.style.display = 'none';
    menuOpen = false;
  }
});

// Close auth modal on overlay click
document.addEventListener('click', function(e) {
  if (e.target.id === 'rwfAuthOverlay') RWF_closeModal();
});

// ============================================================
// SUBSCRIBE BUTTON HELPER
// Creates a subscribe button for inmate pages
// Usage: RWF.renderSubscribeBtn(inmateId, containerEl)
// ============================================================
RWF.renderSubscribeBtn = function(inmateId, inmateName, container) {
  function render() {
    const user = getCurrentUser();
    const subbed = isSubscribed(inmateId);
    container.innerHTML = subbed ? `
      <button onclick="RWF_unsub('${inmateId}', '${inmateName}')" style="
        background:transparent; border:1px solid #27ae60; color:#27ae60;
        font-family:'IBM Plex Mono',monospace; font-size:0.65rem; letter-spacing:0.15em;
        text-transform:uppercase; padding:0.5rem 1.1rem; cursor:pointer;
        transition:all 0.2s; display:flex; align-items:center; gap:0.4rem;
      " onmouseover="this.style.background='rgba(39,174,96,0.1)'"
         onmouseout="this.style.background='transparent'">
        ✓ Subscribed
      </button>
    ` : `
      <button onclick="RWF_sub('${inmateId}', '${inmateName}')" style="
        background:#c0392b; border:none; color:white;
        font-family:'IBM Plex Mono',monospace; font-size:0.65rem; letter-spacing:0.15em;
        text-transform:uppercase; padding:0.5rem 1.1rem; cursor:pointer;
        transition:background 0.2s; display:flex; align-items:center; gap:0.4rem;
      " onmouseover="this.style.background='#a93226'"
         onmouseout="this.style.background='#c0392b'">
        + Subscribe
      </button>
    `;
  }
  render();
  RWF.on('subscribed', render);
  RWF.on('unsubscribed', render);
  RWF.on('login', render);
  RWF.on('logout', render);
};

window.RWF_sub = function(inmateId, inmateName) {
  if (!getCurrentUser()) { openModal('signup'); return; }
  subscribe(inmateId);
  showToast(`Subscribed to ${inmateName} — you'll get an email when new episodes drop.`);
};

window.RWF_unsub = function(inmateId, inmateName) {
  unsubscribe(inmateId);
  showToast(`Unsubscribed from ${inmateName}.`);
};

// ============================================================
// LIKE BUTTON HELPER
// ============================================================
RWF.renderLikeBtn = function(contentId, container) {
  function render() {
    const liked = isLiked(contentId);
    const count = getLikeCount(contentId);
    container.innerHTML = `
      <button onclick="RWF_toggleLike('${contentId}')" style="
        background:${liked ? 'rgba(192,57,43,0.15)' : 'transparent'};
        border:1px solid ${liked ? '#c0392b' : '#2a2a2a'};
        color:${liked ? '#c0392b' : '#7a7060'};
        font-family:'IBM Plex Mono',monospace; font-size:0.62rem; letter-spacing:0.1em;
        text-transform:uppercase; padding:0.4rem 0.75rem; cursor:pointer;
        transition:all 0.2s; display:flex; align-items:center; gap:0.4rem;
      ">
        ♥ ${count > 0 ? count : ''} ${liked ? 'Liked' : 'Like'}
      </button>
    `;
  }
  render();
  RWF.on('liked', render);
  RWF.on('login', render);
  RWF.on('logout', render);
};

window.RWF_toggleLike = function(contentId) {
  toggleLike(contentId);
};

// ============================================================
// COMMENT SECTION HELPER
// ============================================================
RWF.renderComments = function(contentId, container) {
  function render() {
    const user = getCurrentUser();
    const comments = getCommentsForContent(contentId);
    const timeAgo = (iso) => {
      const diff = Date.now() - new Date(iso);
      const m = Math.floor(diff / 60000);
      if (m < 1) return 'just now';
      if (m < 60) return m + 'm ago';
      const h = Math.floor(m / 60);
      if (h < 24) return h + 'h ago';
      return Math.floor(h / 24) + 'd ago';
    };
    container.innerHTML = `
      <div style="border-top:1px solid #2a2a2a; padding-top:1.5rem; margin-top:1.5rem;">
        <div style="font-family:'IBM Plex Mono',monospace; font-size:0.6rem; letter-spacing:0.2em;
          color:#7a7060; text-transform:uppercase; margin-bottom:1rem;">
          ${comments.length} Comment${comments.length !== 1 ? 's' : ''}
        </div>

        ${user ? `
          <div style="display:flex; gap:0.75rem; margin-bottom:1.5rem; align-items:flex-start;">
            <div style="width:32px; height:32px; background:#c0392b; color:white;
              font-family:'IBM Plex Mono',monospace; font-size:0.8rem; font-weight:700;
              display:flex; align-items:center; justify-content:center; flex-shrink:0;">
              ${user.avatar}
            </div>
            <div style="flex:1; display:flex; flex-direction:column; gap:0.5rem;">
              <textarea id="rwfCommentInput_${contentId}"
                placeholder="Leave a comment..." rows="2" style="
                width:100%; background:#0a0a0a; border:1px solid #2a2a2a;
                color:#d4c9b8; font-family:'Libre Baskerville',serif;
                font-size:0.82rem; padding:0.65rem 0.85rem; outline:none;
                resize:vertical; transition:border-color 0.2s; line-height:1.6;
              " onfocus="this.style.borderColor='#c0392b'"
                 onblur="this.style.borderColor='#2a2a2a'"></textarea>
              <button onclick="RWF_postComment('${contentId}')" style="
                align-self:flex-end; background:#c0392b; border:none; color:white;
                font-family:'IBM Plex Mono',monospace; font-size:0.6rem; letter-spacing:0.15em;
                text-transform:uppercase; padding:0.45rem 1rem; cursor:pointer;
                transition:background 0.2s;
              " onmouseover="this.style.background='#a93226'"
                 onmouseout="this.style.background='#c0392b'">Post Comment →</button>
            </div>
          </div>
        ` : `
          <div style="background:#111; border:1px solid #2a2a2a; border-left:3px solid #c0392b;
            padding:1rem; margin-bottom:1.5rem; font-family:'IBM Plex Mono',monospace;
            font-size:0.7rem; color:#7a7060; letter-spacing:0.05em;">
            <span onclick="RWF.openModal('login')" style="color:#c0392b; cursor:pointer; text-decoration:underline;">Sign in</span>
            or
            <span onclick="RWF.openModal('signup')" style="color:#c0392b; cursor:pointer; text-decoration:underline;">create a free account</span>
            to leave a comment.
          </div>
        `}

        <div style="display:flex; flex-direction:column; gap:1rem;">
          ${comments.map(c => `
            <div style="display:flex; gap:0.75rem; align-items:flex-start;">
              <div style="width:32px; height:32px; background:#1c1c1c; border:1px solid #2a2a2a;
                color:#d4c9b8; font-family:'IBM Plex Mono',monospace; font-size:0.75rem;
                font-weight:700; display:flex; align-items:center; justify-content:center; flex-shrink:0;">
                ${c.avatar || c.displayName[0].toUpperCase()}
              </div>
              <div style="flex:1;">
                <div style="display:flex; gap:0.75rem; align-items:baseline; margin-bottom:0.35rem;">
                  <span style="font-family:'IBM Plex Mono',monospace; font-size:0.65rem;
                    color:#d4c9b8; font-weight:700; letter-spacing:0.05em;">${c.displayName}</span>
                  <span style="font-family:'IBM Plex Mono',monospace; font-size:0.55rem;
                    color:#4a4035; letter-spacing:0.08em;">${timeAgo(c.timestamp)}</span>
                </div>
                <p style="font-family:'Libre Baskerville',serif; font-size:0.82rem;
                  color:#d4c9b8; line-height:1.7; margin:0;">${c.text}</p>
              </div>
            </div>
          `).join('')}
          ${comments.length === 0 ? `
            <div style="font-family:'Libre Baskerville',serif; font-style:italic;
              color:#4a4035; font-size:0.82rem; text-align:center; padding:1.5rem;">
              No comments yet. Be the first to respond.
            </div>
          ` : ''}
        </div>
      </div>
    `;
  }

  render();
  RWF.on('commented', (data) => { if (data.contentId === contentId) render(); });
  RWF.on('login', render);
  RWF.on('logout', render);
};

window.RWF_postComment = function(contentId) {
  const input = document.getElementById('rwfCommentInput_' + contentId);
  if (!input) return;
  postComment(contentId, input.value);
  input.value = '';
};

// ============================================================
// TOAST
// ============================================================
function showToast(msg) {
  let toast = document.getElementById('rwfToast');
  if (!toast) {
    toast = document.createElement('div');
    toast.id = 'rwfToast';
    toast.style.cssText = `
      position:fixed; bottom:2rem; left:50%; transform:translateX(-50%) translateY(80px);
      background:#161616; border:1px solid #2a2a2a; border-left:3px solid #27ae60;
      padding:0.85rem 1.5rem; font-family:'IBM Plex Mono',monospace; font-size:0.7rem;
      color:#ede8df; letter-spacing:0.05em; z-index:99997; white-space:nowrap;
      transition:transform 0.3s ease, opacity 0.3s ease; opacity:0;
      max-width:90vw; white-space:normal;
    `;
    document.body.appendChild(toast);
  }
  toast.textContent = msg;
  toast.style.transform = 'translateX(-50%) translateY(0)';
  toast.style.opacity = '1';
  clearTimeout(toast._timer);
  toast._timer = setTimeout(() => {
    toast.style.transform = 'translateX(-50%) translateY(80px)';
    toast.style.opacity = '0';
  }, 3500);
}

// ============================================================
// INIT — inject modal HTML + update nav on load
// ============================================================
RWF.openModal = openModal;

function init() {
  // Inject modal + user menu into body
  const wrapper = document.createElement('div');
  wrapper.innerHTML = MODAL_HTML;
  document.body.appendChild(wrapper);

  // Inject Google Fonts if not already present
  if (!document.querySelector('link[href*="IBM+Plex+Mono"]')) {
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = 'https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400;700&family=Bebas+Neue&display=swap';
    document.head.appendChild(link);
  }

  // Update nav auth slot
  updateNavAuth();

  // Listen for logout to update nav
  RWF.on('logout', updateNavAuth);
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}

})();
