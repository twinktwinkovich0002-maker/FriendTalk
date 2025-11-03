let socket = null;
let me = null;
let currentChatId = null;

const $ = id => document.getElementById(id);

// refs
const usernameIn = $('username');
const loginBtn = $('loginBtn');
const newChatPanel = $('newChatPanel');
const newChatName = $('newChatName');
const newChatMembers = $('newChatMembers');
const createGroupBtn = $('createGroupBtn');
const createPrivateBtn = $('createPrivateBtn');
const chatList = $('chatList');
const onlineList = $('onlineList');
const chatHeader = $('chatHeader');
const chatTitle = $('chatTitle');
const messagesEl = $('messages');
const composer = $('composer');
const textInput = $('textInput');
const fileInput = $('fileInput');
const sendBtn = $('sendBtn');
const typingEl = $('typing');
const myAvatar = $('myAvatar');
const meName = $('meName');
const authPanel = $('authPanel');

const tpl = document.getElementById('msgTpl');

// вход по нику
loginBtn.onclick = () => {
  const nick = usernameIn.value.trim();
  if (!nick) return alert('Введите ник!');
  me = { username: nick, avatar: avatarUrl(nick) };
  onLoggedIn();
};

function avatarUrl(name) {
  return `https://api.dicebear.com/8.x/identicon/svg?seed=${encodeURIComponent(name)}`;
}

function onLoggedIn() {
  authPanel.classList.add('hidden');
  newChatPanel.classList.remove('hidden');
  $('chatsBox').classList.remove('hidden');
  $('usersBox').classList.remove('hidden');
  myAvatar.src = me.avatar;
  meName.textContent = me.username;
  connectSocket();
  loadChats();
  loadUsers();
}

// загрузка чатов (фейковая, через сервер)
async function loadChats() {
  const res = await fetch(`/chats/${encodeURIComponent(me.username)}`);
  const j = await res.json();
  renderChats(j.chats || []);
}
function renderChats(list) {
  chatList.innerHTML = '';
  list.forEach(c => {
    const li = document.createElement('li');
    li.dataset.chatId = c.id;
    const img = document.createElement('img');
    img.src = c.avatar || avatarUrl(c.name || c.id);
    const name = document.createElement('div');
    name.textContent = c.name || c.members?.find(m => m !== me.username) || 'Группа';
    li.append(img, name);
    li.onclick = () => joinChat(c.id, name.textContent);
    chatList.appendChild(li);
  });
}

async function loadUsers() {
  const res = await fetch('/users');
  const j = await res.json();
  renderOnline(j.users || []);
}
function renderOnline(list) {
  onlineList.innerHTML = '';
  list.forEach(u => {
    const li = document.createElement('li');
    const img = document.createElement('img');
    img.src = u.avatar || avatarUrl(u.username);
    const name = document.createElement('div');
    name.textContent = u.username + (u.online ? ' • online' : '');
    li.append(img, name);
    onlineList.appendChild(li);
  });
}

createGroupBtn.onclick = async () => {
  const name = newChatName.value.trim();
  const members = newChatMembers.value.split(',').map(s => s.trim()).filter(Boolean);
  if (!members.includes(me.username)) members.push(me.username);
  if (members.length < 2) return alert('Добавьте участников');
  await fetch('/chats', {
    method: 'POST',
    headers: {'Content-Type':'application/json'},
    body: JSON.stringify({ type: 'group', name, members })
  });
  loadChats();
};
createPrivateBtn.onclick = async () => {
  const m = newChatMembers.value.split(',').map(s => s.trim()).filter(Boolean)[0];
  if (!m) return alert('Введите ник для приватного чата');
  const members = [me.username, m];
  await fetch('/chats', {
    method: 'POST',
    headers: {'Content-Type':'application/json'},
    body: JSON.stringify({ type: 'private', members })
  });
  loadChats();
};

// подключение сокета
function connectSocket() {
  const protocol = location.protocol === 'https:' ? 'wss:' : 'ws:';
  socket = new WebSocket(`${protocol}//${location.host}`);
  socket.onopen = () => socket.send(JSON.stringify({ type: 'join', username: me.username }));
  socket.onmessage = e => {
    const data = JSON.parse(e.data);
    if (data.type === 'room:init' && data.chatId === currentChatId) {
      messagesEl.innerHTML = '';
      data.messages.forEach(addMessage);
    }
    if (data.type === 'message:new' && data.chatId === currentChatId) addMessage(data.message);
    if (data.type === 'presence') renderOnline(data.users);
    if (data.type === 'typing') typingEl.textContent = `${data.username} печатает...`, typingEl.classList.remove('hidden');
    if (data.type === 'stopTyping') typingEl.classList.add('hidden');
  };
}

function joinChat(chatId, title) {
  currentChatId = chatId;
  chatTitle.textContent = title;
  [...chatList.children].forEach(li => li.classList.toggle('active', li.dataset.chatId === chatId));
  socket.send(JSON.stringify({ type: 'join', chatId, username: me.username }));
  chatHeader.classList.remove('hidden');
  composer.classList.remove('hidden');
  messagesEl.innerHTML = '';
}

function addMessage(m) {
  if (document.querySelector(`[data-mid="${m.id}"]`)) return;
  const node = tpl.content.cloneNode(true);
  const root = node.querySelector('.msg');
  root.dataset.mid = m.id;
  if (m.username === me.username) root.classList.add('me');
  node.querySelector('.mAvatar').src = m.avatar || avatarUrl(m.username);
  node.querySelector('.mAuthor').textContent = m.username;
  node.querySelector('.mTime').textContent = new Date(m.time).toLocaleTimeString();
  node.querySelector('.mText').textContent = m.text || '';
  messagesEl.append(node);
  messagesEl.scrollTop = messagesEl.scrollHeight;
}

// отправка сообщений
sendBtn.onclick = () => {
  const text = textInput.value.trim();
  if (!text || !currentChatId) return;
  socket.send(JSON.stringify({ type: 'chat', chatId: currentChatId, username: me.username, text }));
  textInput.value = '';
};

// выход
$('logout').onclick = () => location.reload();
