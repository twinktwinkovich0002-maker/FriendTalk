// server.js — FriendTalk PRO 😎

const express = require("express");
const http = require("http");
const fs = require("fs");
const path = require("path");
const WebSocket = require("ws");

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

const DATA_FILE = path.join(__dirname, "data.json");

// ======================
// 🔹 Загрузка данных
// ======================
let data = { users: [], messages: [] };
if (fs.existsSync(DATA_FILE)) {
  try {
    data = JSON.parse(fs.readFileSync(DATA_FILE, "utf8"));
  } catch (e) {
    console.error("Ошибка чтения data.json:", e);
  }
}

// ======================
// 🔹 Middleware
// ======================
app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

// ======================
// 🔹 Сохранение данных
// ======================
function saveData() {
  fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));
}

// ======================
// 🔹 Регистрация
// ======================
app.post("/register", (req, res) => {
  const { username, password } = req.body;

  if (!username || !password)
    return res.status(400).json({ message: "Введите имя и пароль" });

  if (data.users.find(u => u.username === username))
    return res.status(400).json({ message: "Пользователь уже существует" });

  const newUser = { username, password, online: false, avatar: "" };
  data.users.push(newUser);
  saveData();

  res.json({ message: "Регистрация успешна!" });
});

// ======================
// 🔹 Вход
// ======================
app.post("/login", (req, res) => {
  const { username, password } = req.body;
  const user = data.users.find(u => u.username === username && u.password === password);

  if (!user)
    return res.status(401).json({ message: "Неверное имя или пароль" });

  user.online = true;
  saveData();

  res.json({ message: "Вход выполнен!", username });
});

// ======================
// 🔹 Список пользователей онлайн
// ======================
app.get("/online", (req, res) => {
  const onlineUsers = data.users.filter(u => u.online).map(u => u.username);
  res.json({ online: onlineUsers });
});

// ======================
// 🔹 WebSocket чат
// ======================
wss.on("connection", ws => {
  console.log("🟢 Новый пользователь подключился");

  ws.on("message", msg => {
    const message = JSON.parse(msg);
    if (message.type === "chat") {
      const newMsg = {
        username: message.username,
        text: message.text,
        time: new Date().toLocaleTimeString()
      };
      data.messages.push(newMsg);
      saveData();

      // Рассылка всем клиентам
      wss.clients.forEach(client => {
        if (client.readyState === WebSocket.OPEN)
          client.send(JSON.stringify({ type: "chat", ...newMsg }));
      });
    }
  });

  ws.on("close", () => {
    console.log("🔴 Пользователь отключился");
  });
});

// ======================
// 🔹 Старт сервера
// ======================
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`🚀 FriendTalk запущен на порту ${PORT}`));
