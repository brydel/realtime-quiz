const express = require("express");
const http = require("http");
const cors = require("cors");
const { Server } = require("socket.io");

const { RoomManager } = require("./engine/RoomManager");
const { createRateLimiter } = require("./engine/rateLimiter");
const { validatePayload } = require("./engine/validate");
const {
  JoinRoomSchema,
  AnswerSubmitSchema,
  AdminNextSchema,
  AdminRevealSchema,
} = require("./engine/schemas");

const PORT = process.env.PORT || 4001;

// 1) App HTTP
const app = express();

// 2) CORS HTTP (front Vite par défaut)
app.use(cors({ origin: "http://localhost:5173", credentials: true }));

// 3) Routes simples
app.get("/health", (req, res) => res.status(200).json({ ok: true }));
app.get("/essais", (req, res) => res.status(200).json({ ok: true }));

// 4) Serveur HTTP
const server = http.createServer(app);

// 5) Socket.IO + CORS WS
const io = new Server(server, {
  cors: { origin: "http://localhost:5173", methods: ["GET", "POST"], credentials: true },
});

// 6) RoomManager & protections
const rooms = new RoomManager(io);
const answerLimiter = createRateLimiter({ tokensPerInterval: 5, intervalMs: 10_000, bucketSize: 5 });
const adminLimiter  = createRateLimiter({ tokensPerInterval: 3, intervalMs: 10_000, bucketSize: 3 });

// 7) Ping/pong de latence
function setupLatency(socket, rooms) {
  const ALPHA = 0.2;
  const interval = setInterval(() => {
    const t0 = Date.now();
    socket.emit("latency:ping", { t0 });
    const onPong = () => {
      const rtt = Date.now() - t0;
      rooms.updateLatency(socket, rtt, ALPHA);
      socket.off("latency:pong", onPong);
    };
    socket.on("latency:pong", onPong);
  }, 2000);

  socket.on("disconnect", () => clearInterval(interval));
}

// 8) Connexions temps réel
io.on("connection", (socket) => {
  console.log("New client connected:", socket.id);

  // petite horloge de démo
  const intervalId = setInterval(() => {
    socket.emit("demo:time", { now: new Date().toISOString() });
  }, 1000);

  setupLatency(socket, rooms);

  // ---- Événements métier (validés + rate-limit + host-only) ----
  socket.on("room:join", (payload) =>
    validatePayload(socket, "room:join", JoinRoomSchema, payload, (data) => {
      rooms.joinRoom(socket, data);
    })
  );

  socket.on("room:leave", () => rooms.leaveRoom(socket));

  socket.on("answer:submit", (payload) => {
    if (!answerLimiter.allow(socket.id)) {
      socket.emit("system:notice", { type: "rate", message: "Trop de requêtes. Réessaie plus tard." });
      return;
    }
    validatePayload(socket, "answer:submit", AnswerSubmitSchema, payload, (data) => {
      rooms.submitAnswer(socket, data);
    });
  });

  socket.on("admin:nextQuestion", (payload) => {
    if (!adminLimiter.allow(socket.id)) {
      socket.emit("system:notice", { type: "rate", message: "Actions admin trop fréquentes." });
      return;
    }
    validatePayload(socket, "admin:nextQuestion", AdminNextSchema, payload, (data) => {
      if (!rooms.isHost(socket, data.roomId)) {
        socket.emit("system:notice", { type: "auth", message: "Seul le host peut lancer une question." });
        return;
      }
      rooms.startQuestion(data);
    });
  });

  socket.on("admin:reveal", (payload) => {
    if (!adminLimiter.allow(socket.id)) {
      socket.emit("system:notice", { type: "rate", message: "Actions admin trop fréquentes." });
      return;
    }
    validatePayload(socket, "admin:reveal", AdminRevealSchema, payload, (data) => {
      if (!rooms.isHost(socket, data.roomId)) {
        socket.emit("system:notice", { type: "auth", message: "Seul le host peut révéler la réponse." });
        return;
      }
      rooms.reveal(data);
    });
  });

  socket.on("disconnect", () => {
    clearInterval(intervalId);
    rooms.leaveRoom(socket);
    console.log("Client disconnected:", socket.id);
  });
});

// 9) Lancement
server.listen(PORT, () => console.log(`Listening on port ${PORT}`));
