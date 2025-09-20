const Question = require("../models/Question");


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

function eqChoice(a, b) {
  if (a == null || b == null) return false;
  return String(a).trim().toLowerCase() === String(b).trim().toLowerCase();
}

// égalité “set” de tableaux de strings (ordre et doublons ignorés)
function normalizeChoicesArray(v) {
  if (!Array.isArray(v)) return null;
  const cleaned = v
    .map((x) => String(x).trim().toLowerCase())
    .filter((x) => x.length > 0);
  return Array.from(new Set(cleaned)); // dédoublonne
}
function eqChoice(a, b) {
  if (a == null || b == null) return false;
  return String(a).trim().toLowerCase() === String(b).trim().toLowerCase();
}
function eqChoiceSet(aArr, bArr) {
  const A = normalizeChoicesArray(aArr);
  const B = normalizeChoicesArray(bArr);
  if (!A || !B) return false;
  if (A.length !== B.length) return false;
  const setB = new Set(B);
  return A.every((a) => setB.has(a));
}



class RoomManager {
  constructor(io) {
    this.io = io;
    this.rooms = new Map();
    this.demoQuestions = DEFAULT_QUESTIONS;
  }

  clearTimers(room) {
  if (room.timers.revealTO) { clearTimeout(room.timers.revealTO); room.timers.revealTO = null; }
  if (room.timers.nextTO)   { clearTimeout(room.timers.nextTO);   room.timers.nextTO   = null; }
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
        rules: { category: "G1", minDifficulty: 1, maxDifficulty: 3 },
        timers: { revealTO: null, nextTO: null },
        durations: { revealMs: 12000, nextMs: 4000 }, 

        hostId: null,
        createdAt: Date.now(),
      });
    }
    
    return this.rooms.get(roomId);
  }

  setRules({ roomId, rules }) {
  const room = this.rooms.get(roomId);
  if (!room) return;
  room.rules = {
    category: rules.category,
    minDifficulty: Math.max(1, Math.min(5, rules.minDifficulty)),
    maxDifficulty: Math.max(1, Math.min(5, rules.maxDifficulty)),
  };
  this.emitRoomState(room);
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

async startQuestion({ roomId }) {
  const room = this.rooms.get(roomId);
  if (!room) return;
  if (![STATES.LOBBY, STATES.SCOREBOARD].includes(room.state)) return;

  // reset/schedule
  this.clearTimers(room);

  room.round += 1;
  room.state = STATES.QUESTION;
  room.answers.clear();

  const { category, minDifficulty, maxDifficulty } = room.rules || {};
  const where = { active: true };
  if (category) where.category = category;
  if (minDifficulty || maxDifficulty) {
    where.difficulty = {};
    if (minDifficulty) where.difficulty.$gte = minDifficulty;
    if (maxDifficulty) where.difficulty.$lte = maxDifficulty;
  }

  // sélection DB (ou fallback)
  let picked = null;
  try {
    const docs = await Question.find(where).sort({ createdAt: -1 }).limit(50);
    if (docs.length) {
      picked = docs[Math.floor(Math.random() * docs.length)];
    }
  } catch (e) {
    console.error("[startQuestion] DB error:", e.message);
  }
  if (!picked) {
    const bank = Array.isArray(this.demoQuestions) && this.demoQuestions.length ? this.demoQuestions : DEFAULT_QUESTIONS;
    picked = bank[(room.round - 1) % bank.length];
  }

  // normalise ce qu’on stocke et ce qu’on envoie
  room.question = {
    id: picked.id || String(picked._id || ""),
    statement: picked.statement,
    type: picked.type || "true_false",
    choices: picked.choices || null,
    imageUrl: picked.imageUrl || null,
    answer: picked.answer,          // NE PAS envoyer au client
    explanation: picked.explanation || null,
  };

  const payload = {
    id: room.question.id,
    statement: room.question.statement,
    imageUrl: room.question.imageUrl,
    type: room.question.type,
    choices: room.question.choices,
    round: room.round,
    startedAt: Date.now(),
    durationMs: room.durations.revealMs, // pour un compte à rebours côté client
  };

  // planifie l’auto-reveal
  room.timers.revealTO = setTimeout(() => {
    this.reveal({ roomId: room.id, reason: "auto" });
  }, room.durations.revealMs);

  this.io.to(room.id).emit("question:new", payload);
  this.emitRoomState(room);
}


submitAnswer(socket, { answer }) {
  const roomId = socket.data.roomId;
  const room = this.rooms.get(roomId);
  if (!room || room.state !== STATES.QUESTION || !room.question) return;
  if (room.answers.has(socket.id)) return; // 1 seule réponse

  const qType = room.question.type || "true_false";
  let parsedRecord = null;

  if (qType === "true_false") {
    const parsed = toBoolStrict(answer);
    if (parsed === null) {
      socket.emit("system:notice", { type: "validation", message: "Réponse invalide (true/false attendu)." });
      return;
    }
    parsedRecord = { answer: parsed, tRecv: Date.now() };
  } else if (qType === "single_choice") {
    if (typeof answer !== "string" || !answer.trim()) {
      socket.emit("system:notice", { type: "validation", message: "Réponse invalide (string attendu)." });
      return;
    }
    parsedRecord = { answer: String(answer).trim(), tRecv: Date.now() };
  } else if (qType === "multi_choice") {
    const arr = normalizeChoicesArray(answer);
    if (!arr || arr.length === 0) {
      socket.emit("system:notice", { type: "validation", message: "Réponse invalide (array<string> attendu)." });
      return;
    }
    parsedRecord = { answer: arr, tRecv: Date.now() };
  } else {
    socket.emit("system:notice", { type: "validation", message: `Type de question non géré: ${qType}` });
    return;
  }

  room.answers.set(socket.id, parsedRecord);
  socket.emit("answer:ack", { ok: true });
}


reveal({ roomId, reason = "manual" }) {
  const room = this.rooms.get(roomId);
  if (!room || room.state !== STATES.QUESTION) return;

  const q = room.question;
  if (!q || typeof q.answer === "undefined" || q.answer === null) {
    console.warn("[reveal] Question/answer manquante pour room:", roomId);
    room.state = STATES.SCOREBOARD;
    this.emitRoomState(room);
    return;
  }

  // si on fait un reveal manuel, on annule l’auto-reveal
  if (room.timers.revealTO) { clearTimeout(room.timers.revealTO); room.timers.revealTO = null; }

  room.state = STATES.REVEAL;

  const MAX_CORR = 150;
  const qType = q.type || "true_false";
  const ansRefRaw = q.answer;

  const correct = [];
  for (const [sid, rec] of room.answers.entries()) {
    let isCorrect = false;

    if (qType === "true_false") {
      const ref = toBoolStrict(ansRefRaw);
      const ans = toBoolStrict(rec?.answer);
      isCorrect = (ref !== null && ans !== null && ans === ref);
    } else if (qType === "single_choice") {
      isCorrect = eqChoice(rec?.answer, ansRefRaw);
    } else if (qType === "multi_choice") {
      isCorrect = eqChoiceSet(rec?.answer, ansRefRaw);
    }

    if (isCorrect) {
      const player = room.players.get(sid);
      const estRtt = (player?.latency?.min ?? player?.latency?.avg ?? 0) || 0;
      const corr = Math.min(estRtt / 2, MAX_CORR);
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
    explanation: q.explanation || null,
    scoreboard: Array.from(room.players.values())
      .sort((a, b) => b.score - a.score)
      .map((p) => ({
        id: p.id ?? "unknown",
        nickname: p.nickname ?? "Player",
        score: Number.isFinite(p.score) ? p.score : 0,
      })),
  });

  // planifie l’auto-next après l’affichage du scoreboard
  this.clearTimers(room);
  room.timers.nextTO = setTimeout(() => {
    // Repasser en SCOREBOARD avant next (déjà fait ci-dessous, par sécurité)
    if (room.state !== STATES.SCOREBOARD) room.state = STATES.SCOREBOARD;
    this.startQuestion({ roomId: room.id }); // enchaîner la manche suivante
  }, room.durations.nextMs);

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
