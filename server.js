// server.js
import express from "express";
import { createServer } from "http";
import { WebSocketServer } from "ws";
import fs from "fs";
import path from "path";
import cors from "cors";

const PORT = process.env.PORT || 3000;
const DATA_FILE = path.join(process.cwd(), "data.json");
const PUBLIC_DIR = path.join(process.cwd(), "public");

// --- tiny persistence helpers
function readData() {
  try {
    const raw = fs.readFileSync(DATA_FILE, "utf8");
    return JSON.parse(raw);
  } catch (e) {
    return { users: {}, messages: [] };
  }
}
function writeData(obj) {
  try {
    fs.writeFileSync(DATA_FILE, JSON.stringify(obj, null, 2), "utf8");
  } catch (e) {
    console.error("Write data error:", e);
  }
}

let data = readData();

// --- express + static
const app = express();
app.use(cors());
app.use(express.json({ limit: "5mb" })); // allow client profile images as dataURL if needed
app.use(express.static(PUBLIC_DIR));
app.get("/", (req, res) => res.sendFile(path.join(PUBLIC_DIR, "index.html")));

// create http server and ws server
const server = createServer(app);
const wss = new WebSocketServer({ server });

/*
Message protocol (JSON):
- join: { type: "join", id, name, avatar }   // avatar optional dataURL
- message: { type: "message", id, name, avatar, text, ts }
- edit: { type: "edit", id, messageId, text }
- delete: { type: "delete", id, messageId }
- presence request/response handled by broadcasting users list
Server broadcasts:
- users: { type: "users", users: [ {id, name, avatar} ] }
- message: { type: "message", message }
- messages: { type: "messages", messages: [...] } // all stored messages (on join)
- edit/delete/pin etc similarly
*/

function broadcast(obj) {
  const raw = JSON.stringify(obj);
  wss.clients.forEach((c) => {
    if (c.readyState === 1) {
      try { c.send(raw); } catch (e) {}
    }
  });
}

// on new websocket connection
wss.on("connection", (ws) => {
  ws.isAlive = true;
  ws.on("pong", () => ws.isAlive = true);

  ws.on("message", (raw) => {
    try {
      const msg = JSON.parse(raw);
      if (!msg || !msg.type) return;

      if (msg.type === "join") {
        // save or update user
        const { id, name, avatar } = msg;
        if (id) {
          data.users[id] = { id, name: name || ("User-" + id.slice(0,4)), avatar: avatar || null, lastSeen: Date.now() };
          writeData(data);
          // send current stored messages to this client only
          ws.send(JSON.stringify({ type: "messages", messages: data.messages }));
          broadcast({ type: "users", users: Object.values(data.users) });
        }
      } else if (msg.type === "message") {
        const message = {
          id: msg.id || ("m_"+(Date.now())+"_"+Math.random().toString(36).slice(2,7)),
          name: msg.name || "Anonymous",
          avatar: msg.avatar || null,
          text: msg.text || "",
          ts: msg.ts || new Date().toISOString(),
          clientId: msg.idClient || null
        };
        data.messages.push(message);
        // trim stored messages to last 2000
        if (data.messages.length > 2000) data.messages.splice(0, data.messages.length - 2000);
        writeData(data);
        broadcast({ type: "message", message });
      } else if (msg.type === "edit") {
        const m = data.messages.find(x => x.id === msg.messageId);
        if (m) {
          m.text = msg.text;
          m.edited = true;
          writeData(data);
          broadcast({ type: "edit", messageId: m.id, text: m.text });
        }
      } else if (msg.type === "delete") {
        data.messages = data.messages.filter(x => x.id !== msg.messageId);
        writeData(data);
        broadcast({ type: "delete", messageId: msg.messageId });
      } else if (msg.type === "updateProfile") {
        // update stored user profile (name/avatar)
        const { id, name, avatar } = msg;
        if (id && data.users[id]) {
          data.users[id].name = name || data.users[id].name;
          data.users[id].avatar = avatar || data.users[id].avatar;
          data.users[id].lastSeen = Date.now();
          writeData(data);
          broadcast({ type: "users", users: Object.values(data.users) });
        }
      } else if (msg.type === "ping") {
        // no-op or could reply
      }
    } catch (e) {
      console.error("Invalid message", e);
    }
  });

  ws.on("close", () => {
    // optionally remove users who disconnected long ago; here we keep users until manual cleanup
    // for demo, simply broadcast users list with same data (clients remove stale by lastSeen)
    broadcast({ type: "users", users: Object.values(data.users) });
  });
});

// heartbeat to keep connections healthy and prune dead clients
setInterval(() => {
  wss.clients.forEach((ws) => {
    if (!ws.isAlive) return ws.terminate();
    ws.isAlive = false;
    ws.ping();
  });
}, 30000);

// start server
server.listen(PORT, () => {
  console.log(`FriendTalk server running on http://localhost:${PORT}`);
});
