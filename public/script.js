// public/script.js
(() => {
  const WS_PATH = (location.protocol === 'https:' ? 'wss://' : 'ws://') + location.host;
  let ws = null;

  // DOM
  const statusEl = document.getElementById('status');
  const usersList = document.getElementById('usersList');
  const messagesEl = document.getElementById('messages');
  const nameInput = document.getElementById('nameInput');
  const avatarFile = document.getElementById('avatarFile');
  const profileAvatar = document.getElementById('profileAvatar');
  const saveProfile = document.getElementById('saveProfile');
  const themeSelect = document.getElementById('themeSelect');
  const messageInput = document.getElementById('messageInput');
  const sendBtn = document.getElementById('sendBtn');
  const clearLocalBtn = document.getElementById('clearLocal');

  // localStorage keys
  const KEY_PROFILE = 'friendtalk_profile';
  const KEY_THEME = 'friendtalk_theme';

  // load profile or create
  let profile = JSON.parse(localStorage.getItem(KEY_PROFILE) || 'null') || { id: 'u' + Math.random().toString(36).slice(2,9), name: '', avatar: null };
  nameInput.value = profile.name || '';
  if (profile.avatar) profileAvatar.style.backgroundImage = `url(${profile.avatar})`, profileAvatar.textContent = '';
  else profileAvatar.textContent = (profile.name || 'FT').slice(0,2).toUpperCase();

  // theme
  let theme = localStorage.getItem(KEY_THEME) || 'light';
  setTheme(theme);
  themeSelect.value = theme;
  themeSelect.addEventListener('change', e => { setTheme(e.target.value); });

  function setTheme(t) {
    theme = t;
    localStorage.setItem(KEY_THEME, t);
    const root = document.getElementById('app');
    root.classList.remove('theme-light','theme-dark');
    root.classList.add(t === 'dark' ? 'theme-dark' : 'theme-light');
    // set body colors for contrast
    if (t === 'dark') {
      document.documentElement.style.setProperty('--text-light', '#e6eef6');
      document.body.style.background = 'var(--bg-dark)';
    } else {
      document.documentElement.style.setProperty('--text-light', '#0f1724');
      document.body.style.background = 'var(--bg-light)';
    }
  }

  // avatar upload
  avatarFile.addEventListener('change', (e) => {
    const f = e.target.files[0];
    if (!f) return;
    const reader = new FileReader();
    reader.onload = () => {
      profile.avatar = reader.result;
      profileAvatar.style.backgroundImage = `url(${profile.avatar})`;
      profileAvatar.textContent = '';
    };
    reader.readAsDataURL(f);
  });

  saveProfile.addEventListener('click', () => {
    profile.name = (nameInput.value || '').trim() || profile.name || ('User-' + profile.id.slice(0,4));
    localStorage.setItem(KEY_PROFILE, JSON.stringify(profile));
    sendProfileUpdate();
    updateProfileUI();
    connectIfNeeded();
  });

  function updateProfileUI(){
    if (profile.avatar) profileAvatar.style.backgroundImage = `url(${profile.avatar})`, profileAvatar.textContent = '';
    else profileAvatar.style.backgroundImage = '', profileAvatar.textContent = (profile.name || 'FT').slice(0,2).toUpperCase();
  }

  // connect websocket
  function connectIfNeeded() {
    if (ws && (ws.readyState === 1 || ws.readyState === 0)) return;
    ws = new WebSocket(WS_PATH);
    ws.addEventListener('open', () => {
      statusEl.textContent = 'Подключено';
      ws.send(JSON.stringify({ type: 'join', id: profile.id, name: profile.name, avatar: profile.avatar }));
    });
    ws.addEventListener('message', (ev) => {
      try {
        const data = JSON.parse(ev.data);
        if (data.type === 'users') renderUsers(data.users);
        if (data.type === 'messages') {
          // initial bulk
          messagesEl.innerHTML = '';
          data.messages.forEach(m => addMessageToUI(m));
          scrollToBottom();
        }
        if (data.type === 'message') {
          addMessageToUI(data.message);
          scrollToBottom();
        }
        if (data.type === 'edit') {
          const el = document.querySelector(`[data-id="${data.messageId}"]`);
          if (el) el.querySelector('.msg-text').textContent = data.text + (data.edited ? ' (edited)' : '');
        }
        if (data.type === 'delete') {
          const el = document.querySelector(`[data-id="${data.messageId}"]`);
          if (el) el.remove();
        }
      } catch (e) {
        console.error("Invalid ws msg", e);
      }
    });
    ws.addEventListener('close', () => {
      statusEl.textContent = 'Отключено';
      setTimeout(connectIfNeeded, 2000);
    });
    ws.addEventListener('error', () => {
      statusEl.textContent = 'Ошибка';
    });
  }

  // send profile update to server
  function sendProfileUpdate() {
    if (!ws || ws.readyState !== 1) return;
    ws.send(JSON.stringify({ type: 'updateProfile', id: profile.id, name: profile.name, avatar: profile.avatar }));
  }

  // render users
  function renderUsers(list) {
    usersList.innerHTML = '';
    if (!list || list.length === 0) { usersList.textContent = '—'; return; }
    list.forEach(u => {
      const div = document.createElement('div');
      div.className = 'user-item';
      const av = document.createElement('div');
      av.className = 'avatar-small';
      av.style.background = u.avatar ? `url(${u.avatar}) center/cover` : 'linear-gradient(135deg,#2b6ef6,#06b6d4)';
      av.textContent = u.avatar ? '' : (u.name || 'FT').slice(0,2).toUpperCase();
      const name = document.createElement('div');
      name.textContent = u.name || 'Anonymous';
      div.appendChild(av);
      div.appendChild(name);
      usersList.appendChild(div);
    });
  }

  // add message to UI
  function addMessageToUI(m) {
    // create message block
    const el = document.createElement('div');
    el.className = 'msg' + ((m.clientId && m.clientId === profile.id) ? ' me' : '');
    el.setAttribute('data-id', m.id);
    const header = document.createElement('div');
    header.style.fontWeight = '700';
    header.textContent = (m.name || 'Anon') + ' ';
    const ts = document.createElement('span');
    ts.style.fontWeight = '600';
    ts.style.fontSize = '12px';
    ts.style.marginLeft = '8px';
    ts.style.color = 'rgba(0,0,0,0.45)';
    ts.textContent = new Date(m.ts).toLocaleTimeString();
    header.appendChild(ts);
    const text = document.createElement('div');
    text.className = 'msg-text';
    text.style.marginTop = '6px';
    text.textContent = m.text;
    el.appendChild(header);
    el.appendChild(text);

    messagesEl.appendChild(el);
  }

  // send message
  sendBtn.addEventListener('click', sendMessage);
  messageInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(); }
  });

  function sendMessage() {
    const t = (messageInput.value || '').trim();
    if (!t) return;
    const payload = {
      type: 'message',
      id: 'm_' + Date.now() + '_' + Math.random().toString(36).slice(2,7),
      name: profile.name || ('User-'+profile.id.slice(0,4)),
      avatar: profile.avatar || null,
      text: t,
      ts: new Date().toISOString(),
      idClient: profile.id
    };
    // optimistic UI
    addMessageToUI(payload);
    scrollToBottom();
    try {
      if (ws && ws.readyState === 1) ws.send(JSON.stringify(payload));
    } catch (e) {}
    // store nothing locally for messages (server keeps)
    messageInput.value = '';
  }

  function scrollToBottom(){ messagesEl.scrollTop = messagesEl.scrollHeight; }

  // clear local storage (not server messages)
  clearLocalBtn.addEventListener('click', () => {
    if (!confirm('Очистить локально сохранённый профиль?')) return;
    localStorage.removeItem(KEY_PROFILE);
    profile = { id: 'u' + Math.random().toString(36).slice(2,9), name: '', avatar: null };
    nameInput.value = '';
    profileAvatar.style.backgroundImage = '';
    profileAvatar.textContent = 'FT';
  });

  // initial connect
  connectIfNeeded();

  // periodically send presence update (server stores lastSeen)
  setInterval(() => {
    if (ws && ws.readyState === 1) {
      ws.send(JSON.stringify({ type: 'join', id: profile.id, name: profile.name, avatar: profile.avatar }));
    }
  }, 5000);

})();
