// Client: Telegram-style frontend
// Compatible with server.js from previous message.

let socket = null;
let me = null;
let currentChatId = null;
let typingTimer = null;
let isTyping = false;

const $ = id => document.getElementById(id);

// UI refs
const usernameIn = $('username'), passwordIn = $('password');
const registerBtn = $('registerBtn'), loginBtn = $('loginBtn'), authMsg = $('authMsg');
const newChatPanel = $('newChatPanel'), newChatName = $('newChatName'), newChatMembers = $('newChatMembers');
const createGroupBtn = $('createGroupBtn'), createPrivateBtn = $('createPrivateBtn');
const chatsBox = $('chatsBox'), chatList = $('chatList'), usersBox = $('usersBox'), onlineList = $('onlineList');
const chatHeader = $('chatHeader'), chatTitle = $('chatTitle'), leaveChatBtn = $('leaveChatBtn');
const messagesEl = $('messages'), composer = $('composer'), textInput = $('textInput'), fileInput = $('fileInput'), sendBtn = $('sendBtn');
const typingEl = $('typing'), meBlock = $('meBlock'), myAvatar = $('myAvatar'), meName = $('meName');
const authPanel = $('authPanel');

// Template
const tpl = document.getElementById('msgTpl');

registerBtn.onclick = async () => {
  clearAuthMsg();
  const u = usernameIn.value.trim(), p = passwordIn.value.trim();
  if (!u||!p) return showAuthMsg("Введите имя и пароль");
  const res = await fetch('/register', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ username:u, password:p }) });
  const j = await res.json();
  if (!res.ok) return showAuthMsg(j.message || "Ошибка");
  showAuthMsg("Регистрация успешна — войдите", true);
};

loginBtn.onclick = async () => {
  clearAuthMsg();
  const u = usernameIn.value.trim(), p = passwordIn.value.trim();
  if (!u||!p) return showAuthMsg("Введите имя и пароль");
  const res = await fetch('/login', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ username:u, password:p }) });
  const j = await res.json();
  if (!res.ok) return showAuthMsg(j.message || "Ошибка входа");
  me = { username: j.user?.username || u, avatar: j.user?.avatar || avatarUrl(u) };
  onLoggedIn();
};

function showAuthMsg(txt, ok=false){ authMsg.textContent = txt; authMsg.style.color = ok?'#9ff7a1':'#f7a1a1'; }
function clearAuthMsg(){ authMsg.textContent = ""; }

function avatarUrl(name){ return `https://api.dicebear.com/8.x/identicon/svg?seed=${encodeURIComponent(name)}`; }

async function onLoggedIn(){
  // show UI
  authPanel.classList.add('hidden');
  newChatPanel.classList.remove('hidden');
  chatsBox.classList.remove('hidden');
  usersBox.classList.remove('hidden');
  meBlock.classList.remove('hidden');
  myAvatar.src = me.avatar; meName.textContent = me.username;

  // load chats & users
  await loadChats();
  await loadUsers();
  connectSocket();
}

async function loadChats(){
  // get user's chats (server expects /chats/:username)
  const res = await fetch(`/chats/${encodeURIComponent(me.username)}`);
  const j = await res.json();
  renderChats(j.chats || []);
}

function renderChats(list){
  chatList.innerHTML = '';
  list.forEach(c => {
    const li = document.createElement('li');
    li.dataset.chatId = c.id;
    const img = document.createElement('img');
    img.src = c.avatar || (c.type==='private' ? avatarUrl(c.members.find(m=>m!==me.username)) : avatarUrl(c.name||c.id));
    const name = document.createElement('div');
    name.textContent = c.type==='private' ? c.members.find(m=>m !== me.username) : (c.name || 'Группа');
    li.appendChild(img); li.appendChild(name);
    li.onclick = () => joinChat(c.id, name.textContent);
    chatList.appendChild(li);
  });
}

createGroupBtn.onclick = async () => {
  const name = newChatName.value.trim();
  const members = newChatMembers.value.split(',').map(s=>s.trim()).filter(Boolean);
  if (!members.includes(me.username)) members.push(me.username);
  if (members.length<2) return alert('Добавьте участников через запятую');
  const res = await fetch('/chats', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ type:'group', name, members }) });
  const j = await res.json();
  await loadChats();
};

createPrivateBtn.onclick = async () => {
  const m = newChatMembers.value.split(',').map(s=>s.trim()).filter(Boolean)[0];
  if (!m) return alert('Укажите имя пользователя для приватного чата');
  const members = [me.username, m];
  const res = await fetch('/chats', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ type:'private', members }) });
  const j = await res.json();
  await loadChats();
};

async function loadUsers(){
  const res = await fetch('/users');
  const j = await res.json();
  renderOnline(j.users || []);
}

function renderOnline(list){
  onlineList.innerHTML = '';
  list.forEach(u => {
    const li = document.createElement('li');
    const img = document.createElement('img'); img.src = u.avatar || avatarUrl(u.username);
    const name = document.createElement('div'); name.textContent = u.username + (u.online ? " • online" : "");
    li.appendChild(img); li.appendChild(name);
    onlineList.appendChild(li);
  });
}

// -------- WebSocket --------
function connectSocket(){
  const protocol = location.protocol === 'https:' ? 'wss:' : 'ws:';
  socket = new WebSocket(`${protocol}//${location.host}`);
  socket.onopen = () => {
    console.log('WS open');
    // join presence (not chat-specific)
    socket.send(JSON.stringify({ type: 'join', username: me.username }));
  };
  socket.onmessage = (e) => {
    try {
      const data = JSON.parse(e.data);
      if (data.type === 'room:init') {
        if (data.chatId === currentChatId) {
          messagesEl.innerHTML = '';
          data.messages.forEach(addMessage);
        }
      }
      if (data.type === 'message:new') {
        if (data.chatId === currentChatId) addMessage(data.message);
      }
      if (data.type === 'message:edit') {
        updateMessageInDOM(data.message);
      }
      if (data.type === 'message:delete') {
        removeMessageFromDOM(data.messageId);
      }
      if (data.type === 'message:react') {
        updateReactions(data.messageId, data.reactions);
      }
      if (data.type === 'presence') {
        renderOnline(data.users);
      }
      if (data.type === 'typing') {
        typingEl.textContent = `${data.username} печатает...`; typingEl.classList.remove('hidden');
      }
      if (data.type === 'stopTyping') {
        typingEl.classList.add('hidden');
      }
    } catch (err) { console.error(err); }
  };
  socket.onclose = () => console.log('WS closed');
}

// -------- Chat actions --------
async function joinChat(chatId, title){
  currentChatId = chatId;
  chatTitle.textContent = title || 'Чат';
  // visually highlight active
  [...chatList.children].forEach(li=>li.classList.toggle('active', li.dataset.chatId===chatId));
  // tell server join + request messages
  if (socket && socket.readyState===1) socket.send(JSON.stringify({ type:'join', chatId, username: me.username }));
  // show UI
  chatHeader.classList.remove('hidden'); composer.classList.remove('hidden'); typingEl.classList.add('hidden');
}

function addMessage(m){
  // avoid duplicates
  if (document.querySelector(`[data-mid="${m.id}"]`)) return;
  const node = tpl.content.cloneNode(true);
  const root = node.querySelector('.msg');
  root.dataset.mid = m.id;
  if (m.username === me.username) root.classList.add('me');

  const img = node.querySelector('.mAvatar');
  img.src = m.avatar || avatarUrl(m.username);

  node.querySelector('.mAuthor').textContent = m.username;
  node.querySelector('.mTime').textContent = new Date(m.time).toLocaleTimeString();
  const textEl = node.querySelector('.mText');
  if (m.type === 'file' && m.file) {
    const a = document.createElement('a'); a.href = m.file; a.target = '_blank'; a.textContent = `📎 ${m.name || 'file'}`;
    textEl.appendChild(a);
    if (m.text) { const p = document.createElement('div'); p.textContent = m.text; textEl.appendChild(p); }
  } else textEl.textContent = m.text || '';

  // actions
  const editBtn = node.querySelector('.editBtn');
  const delBtn = node.querySelector('.deleteBtn');
  const reactBtn = node.querySelector('.reactBtn');

  editBtn.onclick = () => {
    if (m.username !== me.username) return alert('Только автор может редактировать');
    const newText = prompt('Редактировать сообщение:', m.text);
    if (newText === null) return;
    // send via WS edit
    socket.send(JSON.stringify({ type:'edit', messageId: m.id, username: me.username, newText }));
  };
  delBtn.onclick = () => {
    if (m.username !== me.username) return alert('Только автор может удалить');
    if (!confirm('Удалить сообщение?')) return;
    socket.send(JSON.stringify({ type:'delete', messageId: m.id, username: me.username }));
  };
  reactBtn.onclick = async () => {
    const emoji = prompt('Введите emoji для реакции (например: 👍,❤️):');
    if (!emoji) return;
    socket.send(JSON.stringify({ type:'react', messageId: m.id, username: me.username, emoji }));
  };

  // reactions display
  const reactionsDiv = node.querySelector('.reactions');
  if (m.reactions) {
    Object.keys(m.reactions).forEach(emo => {
      const span = document.createElement('span'); span.className='reaction'; span.textContent = `${emo} ${m.reactions[emo].length}`;
      reactionsDiv.appendChild(span);
    });
  }

  messagesEl.appendChild(node);
  messagesEl.scrollTop = messagesEl.scrollHeight;
}

function updateMessageInDOM(m) {
  const el = document.querySelector(`[data-mid="${m.id}"]`);
  if (!el) return;
  el.querySelector('.mText').textContent = m.text || '';
  el.querySelector('.mTime').textContent = new Date(m.time).toLocaleTimeString();
}

function removeMessageFromDOM(messageId){
  const el = document.querySelector(`[data-mid="${messageId}"]`);
  if (el) el.remove();
}

function updateReactions(messageId, reactions){
  const el = document.querySelector(`[data-mid="${messageId}"]`);
  if (!el) return;
  const rdiv = el.querySelector('.reactions'); rdiv.innerHTML = '';
  if (!reactions) return;
  Object.keys(reactions).forEach(emo => {
    const span = document.createElement('span'); span.className='reaction'; span.textContent = `${emo} ${reactions[emo].length}`;
    rdiv.appendChild(span);
  });
}

// composer
sendBtn.onclick = sendMessage;
textInput.addEventListener('input', () => {
  if (!socket || socket.readyState!==1) return;
  if (!isTyping) { isTyping = true; socket.send(JSON.stringify({ type:'typing', chatId: currentChatId, username: me.username })); }
  clearTimeout(typingTimer);
  typingTimer = setTimeout(()=>{ isTyping=false; socket.send(JSON.stringify({ type:'stopTyping', chatId: currentChatId, username: me.username })); }, 900);
});

async function sendMessage(){
  if (!currentChatId) return alert('Выберите чат');
  const file = fileInput.files[0];
  const text = textInput.value.trim();
  if (!file && !text) return;
  if (file) {
    const fd = new FormData(); fd.append('file', file); fd.append('username', me.username); fd.append('chatId', currentChatId); fd.append('text', text);
    const res = await fetch('/upload', { method:'POST', body: fd });
    const j = await res.json();
    if (socket && socket.readyState===1) socket.send(JSON.stringify({ type:'file', message: j.msg }));
    fileInput.value = ''; textInput.value = ''; return;
  }
  socket.send(JSON.stringify({ type:'chat', chatId: currentChatId, username: me.username, text }));
  textInput.value = '';
}

// leave chat
leaveChatBtn.onclick = () => {
  if (!currentChatId) return;
  if (socket && socket.readyState===1) socket.send(JSON.stringify({ type:'leave', chatId: currentChatId }));
  currentChatId = null;
  chatTitle.textContent = '';
  chatHeader.classList.add('hidden'); composer.classList.add('hidden');
  messagesEl.innerHTML = '';
  [...chatList.children].forEach(li=>li.classList.remove('active'));
};

// logout
$('logout').onclick = async () => {
  await fetch('/logout', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ username: me.username }) });
  location.reload();
};

// initial: ask Notification permission for desktop notifications
if (window.Notification && Notification.permission !== "granted") Notification.requestPermission();
