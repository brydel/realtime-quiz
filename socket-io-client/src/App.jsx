import { useEffect, useRef, useState } from "react";
import { io } from "socket.io-client";

const SERVER_URL = "http://localhost:4001";
const ROOM_ID = "demo-room";

export default function App() {
  const socketRef = useRef(null);

  const [socketId, setSocketId] = useState("");
  const [connected, setConnected] = useState(false);
  const [tick, setTick] = useState("");
  const [room, setRoom] = useState(null);         // { id, state, round, players[], question? }
  const [question, setQuestion] = useState(null);
  const [answered, setAnswered] = useState(false);
  const [latency, setLatency] = useState(null);   // { rtt, avg, min }
  const [notice, setNotice] = useState(null);     // { type, message, ... }
  const [reveal, setReveal] = useState(null);     // { correctAnswer, winnerId, scoreboard[] }

  useEffect(() => {
    const nickname = "Guest-" + Math.random().toString(16).slice(2, 6);

    // ✅ une seule connexion socket
    const socket = io(SERVER_URL, { transports: ["websocket"], withCredentials: true });
    socketRef.current = socket;
    // option debug: exposer la même instance dans la console
    window.__SOCKET__ = socket;

    // Connexion
    socket.on("connect", () => {
      setConnected(true);
      setSocketId(socket.id);
      socket.emit("room:join", { roomId: ROOM_ID, nickname });
    });

    // Pings de latence (⚠️ nom exact: "latency:ping")
    socket.on("latency:ping", () => socket.emit("latency:pong"));
    socket.on("latency:update", (p) => setLatency(p));

    // Notices serveur (validation, rate-limit, host-only)
    socket.on("system:notice", (p) => setNotice(p));

    // Démo temps réel
    socket.on("demo:time", (p) => setTick(p.now));
    socket.on("system:hello", (p) => console.log("HELLO:", p));

    // État de la room
    socket.on("room:state", (payload) => {
      setRoom(payload);
      if (payload.state !== "QUESTION") {
        setQuestion(null);
        setAnswered(false);
      }
      // en SCOREBOARD, on garde le dernier reveal affiché
      if (payload.state === "QUESTION") {
        setReveal(null);
      }
    });

    // Question en cours
    socket.on("question:new", (payload) => {
      setQuestion(payload);
      setAnswered(false);
      setReveal(null);
    });

    // Reveal avec winner + scoreboard
    socket.on("question:reveal", (payload) => {
      setReveal(payload);
    });

    // Cleanup
    return () => {
      socket.disconnect();
      window.__SOCKET__ = null;
    };
  }, []);

  // Helpers
  function getSocket() {
    return socketRef.current;
  }

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
    <main style={{ fontFamily: "system-ui", padding: 16, maxWidth: 760, margin: "0 auto" }}>
      <h1>Realtime Quiz</h1>
      <p>
        Statut: {connected ? "connecté" : "déconnecté"} | ID: {socketId || "…"} | Heure: {tick || "…"}
      </p>
      <p>
        RTT: {latency ? Math.round(latency.avg) + " ms" : "…"}
        {latency && <> (min {Math.round(latency.min)} ms)</>}
      </p>

      {/* Notice serveur */}
      {notice && (
        <div
          style={{
            background: "#fff2",
            border: "1px solid #ffeeba",
            padding: 8,
            borderRadius: 6,
            margin: "8px 0",
          }}
        >
          <b>Notice</b> — {notice.message || JSON.stringify(notice)}
        </div>
      )}

      <section style={{ marginTop: 12 }}>
        <h2>Room</h2>
        {room ? (
          <>
            <p>
              <b>ID:</b> {room.id} | <b>État:</b> {room.state} | <b>Round:</b> {room.round}
            </p>
            <p>
              <b>Joueurs:</b>{" "}
              {room.players.map((p) => `${p.nickname}(${p.score})`).join(" • ") || "—"}
            </p>
          </>
        ) : (
          <p>En attente d’état…</p>
        )}
      </section>

      <section style={{ marginTop: 12 }}>
        <h2>Question</h2>
        {question ? (
          <>
            <p>{question.statement}</p>
            <button disabled={answered} onClick={() => emitAnswer(true)}>
              Vrai
            </button>{" "}
            <button disabled={answered} onClick={() => emitAnswer(false)}>
              Faux
            </button>
            {answered && <p>Réponse envoyée ✅</p>}
          </>
        ) : (
          <p>Aucune question en cours.</p>
        )}
      </section>

      <section style={{ marginTop: 12 }}>
        <h2>Admin (pour test)</h2>
        <p>Ouvre 2 onglets. Dans l’onglet “host”, clique “Next question”, puis “Reveal”.</p>
        <button onClick={emitNext}>Next question</button>{" "}
        <button onClick={emitReveal}>Reveal</button>
      </section>

      <section style={{ marginTop: 12 }}>
        <h2>Scoreboard</h2>
        {reveal ? (
          <>
            <p>
              Bonne réponse: <b>{String(reveal.correctAnswer)}</b> | Gagnant:{" "}
              <b>{reveal.winnerId || "—"}</b>
            </p>
            <ol>
              {reveal.scoreboard.map((p) => (
                <li key={p.id}>
                  {p.nickname} — <b>{p.score}</b>
                  {reveal.winnerId === p.id && " 🏆"}
                </li>
              ))}
            </ol>
          </>
        ) : (
          <p>Révèle la manche pour voir le classement.</p>
        )}
      </section>
    </main>
  );
}
