import { useEffect, useState } from "react";
import { io } from "socket.io-client";

const SERVER_URL = "http://localhost:4001";
const ROOM_ID = "demo-room";

export default function App() {
  const [socketId, setSocketId] = useState("");
  const [connected, setConnected] = useState(false);
  const [tick, setTick] = useState("");
  const [room, setRoom] = useState(null); // { id, state, round, players[], question? }
  const [question, setQuestion] = useState(null);
  const [answered, setAnswered] = useState(false);

  useEffect(() => {
    const nickname = "Guest-" + Math.random().toString(16).slice(2, 6);
    const socket = io(SERVER_URL, { transports: ["websocket"], withCredentials: true });

    socket.on("connect", () => {
      setConnected(true);
      setSocketId(socket.id);
      socket.emit("room:join", { roomId: ROOM_ID, nickname });
    });

    socket.on("system:hello", (p) => console.log("HELLO:", p));
    socket.on("demo:time", (p) => setTick(p.now));
    socket.on("room:state", (payload) => {
      setRoom(payload);
      if (payload.state !== "QUESTION") {
        setQuestion(null);
        setAnswered(false);
      }
    });
    socket.on("question:new", (payload) => {
      setQuestion(payload);
      setAnswered(false);
    });
    socket.on("question:reveal", (payload) => {
      // simple feedback console, à améliorer en UI
      console.log("REVEAL:", payload);
    });

    return () => socket.disconnect();
  }, []);

  // Actions UI
  const startQuestion = async () => {
    fetch(`${SERVER_URL}/health`) // no-op pour réveiller le serveur en dev (optionnel)
    // On émettra via le socket → admin:nextQuestion
  };
  const answerTrue = () => emitAnswer(true);
  const answerFalse = () => emitAnswer(false);

  // On garde une ref socket globale simplifiée :
  function getSocket() {
    // eslint-disable-next-line no-undef
    return window.__SOCKET__ || null;
  }
  useEffect(() => {
    // Expose socket dans la console pour debug rapide (optionnel)
    const s = io(SERVER_URL, { transports: ["websocket"], withCredentials: true });
    window.__SOCKET__ = s;
    return () => { s.disconnect(); window.__SOCKET__ = null; };
  }, []);

  function emitAnswer(val) {
    const s = getSocket();
    if (!s || !question || answered) return;
    s.emit("answer:submit", { answer: val });
    setAnswered(true);
  }
  function emitNext() {
    const s = getSocket();
    if (!s || !room) return;
    s.emit("admin:nextQuestion", { roomId: room.id });
  }
  function emitReveal() {
    const s = getSocket();
    if (!s || !room) return;
    s.emit("admin:reveal", { roomId: room.id });
  }

  return (
    <main style={{ fontFamily: "system-ui", padding: 16, maxWidth: 720 }}>
      <h1>Realtime Quiz</h1>
      <p>Statut: {connected ? "connecté" : "déconnecté"} | ID: {socketId || "…"} | Heure: {tick || "…"}</p>

      <section style={{ marginTop: 12 }}>
        <h2>Room</h2>
        {room ? (
          <>
            <p><b>ID:</b> {room.id} | <b>État:</b> {room.state} | <b>Round:</b> {room.round}</p>
            <p><b>Joueurs:</b> {room.players.map(p => `${p.nickname}(${p.score})`).join(" • ") || "—"}</p>
          </>
        ) : <p>En attente d’état…</p>}
      </section>

      <section style={{ marginTop: 12 }}>
        <h2>Question</h2>
        {question ? (
          <>
            <p>{question.statement}</p>
            <button disabled={answered} onClick={answerTrue}>Vrai</button>{" "}
            <button disabled={answered} onClick={answerFalse}>Faux</button>
            {answered && <p>Réponse envoyée ✅</p>}
          </>
        ) : (
          <p>Aucune question en cours.</p>
        )}
      </section>

      <section style={{ marginTop: 12 }}>
        <h2>Admin (pour test):</h2>
        <p>Ouvre 2 onglets. Dans un des onglets clique “Next question”, puis “Reveal”.</p>
        <button onClick={emitNext}>Next question</button>{" "}
        <button onClick={emitReveal}>Reveal</button>
      </section>
    </main>
  );
}
