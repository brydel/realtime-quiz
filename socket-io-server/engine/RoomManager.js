const STATES = {
  LOBBY: "LOBBY",
  QUESTION: "QUESTION",
  REVEAL: "REVEAL",
  SCOREBOARD: "SCOREBOARD",
};

const DEFAULT_QUESTIONS = [
  { id: "q1", statement: "La Terre est plus grande que Mars.", answer: true },
  { id: "q2", statement: "HTTP est un protocole temps réel.", answer: false },
  { id: "q3", statement: "WebSocket est full-duplex.", answer: true },
];

function toBoolStrict(v) {
  if (typeof v === "boolean") return v;
  if (typeof v === "number") return v === 1 ? true : v === 0 ? false : null;
  if (typeof v === "string") {
    const s = v.trim().toLowerCase();
    if (s === "true" || s === "vrai" || s === "1") return true;
    if (s === "false" || s === "faux" || s === "0") return false;
    return null;
  }
  return null;
}

class RoomManager {
  constructor(io) {
    this.io = io;
    this.rooms = new Map();
    this.demoQuestions = DEFAULT_QUESTIONS;
  }

  // --- helpers ---
  ensureRoom(roomId) {
    if (!this.rooms.has(roomId)) {
      this.rooms.set(roomId, {
        id: roomId,
        state: STATES.LOBBY,
        round: 0,
        players: new Map(), // socketId -> { id, nickname, score, latency? }
        question: null,
        answers: new Map(), // socketId -> { answer, tRecv }
        hostId: null,
        createdAt: Date.now(),
      });
    }
    return this.rooms.get(roomId);
  }

  emitRoomState(room) {
    const payload = {
      id: room.id,
      state: room.state,
      round: room.round,
      players: Array.from(room.players.values()).map((p) => ({
        id: p.id ?? "unknown",
        nickname: p.nickname ?? "Player",
        score: Number.isFinite(p.score) ? p.score : 0,
      })),
      question:
        room.state === STATES.QUESTION
          ? { id: room.question.id, statement: room.question.statement }
          : null,
    };
    this.io.to(room.id).emit("room:state", payload);
  }

  // --- API ---
  joinRoom(socket, { roomId, nickname }) {
    const room = this.ensureRoom(roomId);

    socket.join(room.id);
    socket.data.roomId = room.id;

    if (!nickname) nickname = `Guest-${socket.id.slice(0, 4)}`;
    if (!room.hostId) room.hostId = socket.id; // premier = host

    room.players.set(socket.id, { id: socket.id, nickname, score: 0 });

    socket.emit("system:hello", {
      message: "Bienvenue dans la room",
      socketId: socket.id,
      roomId: room.id,
    });

    this.emitRoomState(room);
  }

  leaveRoom(socket) {
    const roomId = socket.data.roomId;
    if (!roomId) return;
    const room = this.rooms.get(roomId);
    if (!room) return;

    room.players.delete(socket.id);
    socket.leave(room.id);

    if (room.hostId === socket.id) {
      const next = room.players.keys().next();
      room.hostId = next && !next.done ? next.value : null;
    }

    if (room.players.size === 0) {
      this.rooms.delete(room.id);
      return;
    }
    this.emitRoomState(room);
  }

  startQuestion({ roomId }) {
    const room = this.rooms.get(roomId);
    if (!room) return;
    if (![STATES.LOBBY, STATES.SCOREBOARD].includes(room.state)) return;

    room.round += 1;
    room.state = STATES.QUESTION;
    room.answers.clear();

    const bank =
      Array.isArray(this.demoQuestions) && this.demoQuestions.length
        ? this.demoQuestions
        : DEFAULT_QUESTIONS;

    room.question = bank[(room.round - 1) % bank.length];

    this.io.to(room.id).emit("question:new", {
      id: room.question.id,
      statement: room.question.statement,
      round: room.round,
      startedAt: Date.now(),
    });
    this.emitRoomState(room);
  }

  submitAnswer(socket, { answer }) {
    const roomId = socket.data.roomId;
    const room = this.rooms.get(roomId);
    if (!room || room.state !== STATES.QUESTION || !room.question) return;

    if (room.answers.has(socket.id)) return;

    const parsed = toBoolStrict(answer);
    if (parsed === null) {
      socket.emit("system:notice", {
        type: "validation",
        message: "Réponse invalide (true/false attendu).",
      });
      return;
    }

    room.answers.set(socket.id, { answer: parsed, tRecv: Date.now() });
    socket.emit("answer:ack", { ok: true });
  }

  reveal({ roomId }) {
    const room = this.rooms.get(roomId);
    if (!room || room.state !== STATES.QUESTION) return;

    const q = room.question;
    if (!q || typeof q.answer === "undefined" || q.answer === null) {
      console.warn("[reveal] Question/answer manquante pour room:", roomId);
      room.state = STATES.SCOREBOARD;
      this.emitRoomState(room);
      return;
    }

    room.state = STATES.REVEAL;

    const MAX_CORR = 150; // ms cap
    const ansRef = toBoolStrict(q.answer);
    const correct = [];

    for (const [sid, rec] of room.answers.entries()) {
      const ans = toBoolStrict(rec?.answer);
      if (ans !== null && ans === ansRef) {
        const player = room.players.get(sid);
        const estRtt = (player?.latency?.min ?? player?.latency?.avg ?? 0) || 0;
        const corr = Math.min(estRtt / 2, MAX_CORR); // approx one-way
        const tRecv = Number(rec?.tRecv);
        if (!Number.isFinite(tRecv)) continue;
        const effective = tRecv - corr;
        correct.push({ sid, effective });
      }
    }

    correct.sort((a, b) => a.effective - b.effective);
    const winner = correct.length ? correct[0].sid : null;

    if (winner && room.players.has(winner)) {
      const p = room.players.get(winner);
      if (!Number.isFinite(p.score)) p.score = 0;
      p.score += 1;
    }

    this.io.to(room.id).emit("question:reveal", {
      correctAnswer: q.answer,
      winnerId: winner,
      scoreboard: Array.from(room.players.values())
        .sort((a, b) => b.score - a.score)
        .map((p) => ({
          id: p.id ?? "unknown",
          nickname: p.nickname ?? "Player",
          score: Number.isFinite(p.score) ? p.score : 0,
        })),
    });

    room.state = STATES.SCOREBOARD;
    this.emitRoomState(room);
  }

  updateLatency(socket, rtt, alpha = 0.2) {
    const roomId = socket.data.roomId;
    if (!roomId) return;
    const room = this.rooms.get(roomId);
    if (!room) return;
    const p = room.players.get(socket.id);
    if (!p) return;

    if (!p.latency) p.latency = { avg: rtt, min: rtt };
    else {
      p.latency.avg = alpha * rtt + (1 - alpha) * p.latency.avg; // EMA
      p.latency.min = Math.min(p.latency.min, rtt);              // “meilleure” RTT
    }
    socket.emit("latency:update", { rtt, avg: p.latency.avg, min: p.latency.min });
  }

  isHost(socket, roomId) {
    const room = this.rooms.get(roomId);
    if (!room) return false;
    return room.hostId === socket.id;
  }
}

module.exports = { RoomManager, STATES };
