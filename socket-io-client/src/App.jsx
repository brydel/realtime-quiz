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
  const [selected, setSelected] = useState([]);   // pour multi_choice
  const [timeLeftMs, setTimeLeftMs] = useState(null);


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

    // Pings de latence
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
    setTimeLeftMs(null);
  }
  if (payload.state === "QUESTION") {
    setReveal(null);
  }
});


    // Question en cours
  socket.on("question:new", (payload) => {
    setQuestion(payload);
    setAnswered(false);
    setReveal(null);
    setSelected([]); // reset multi_choice

  // Countdown local (sans ping serveur par seconde)
  if (payload.durationMs && payload.startedAt) {
    const deadline = payload.startedAt + payload.durationMs;
    setTimeLeftMs(Math.max(0, deadline - Date.now()));

    // petit timer local 200ms
    const it = setInterval(() => {
      const left = deadline - Date.now();
      if (left <= 0) {
        setTimeLeftMs(0);
        clearInterval(it);
      } else {
        setTimeLeftMs(left);
      }
    }, 200);
    // NOTE: on nettoie quand on repassera en non-QUESTION
    const stop = () => clearInterval(it);
    // attache une fonction pour ce cycle
    socket.once("question:reveal", stop);
    socket.once("room:state", (st) => { if (st.state !== "QUESTION") stop(); });
  } else {
    setTimeLeftMs(null);
  }
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

  function RulesForm({ onSubmit }) {
  const [category, setCategory] = useState("G1");
  const [minDifficulty, setMin] = useState(1);
  const [maxDifficulty, setMax] = useState(3);

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit({ category, minDifficulty: Number(minDifficulty), maxDifficulty: Number(maxDifficulty) });
      }}
      style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", marginBottom: 8 }}
    >
      <label>Catégorie&nbsp;
        <select value={category} onChange={(e) => setCategory(e.target.value)}>
          <option value="G1">G1</option>
          <option value="G2">G2</option>
          <option value="G">G</option>
        </select>
      </label>
      <label>Min diff&nbsp;
        <input type="number" min="1" max="5" value={minDifficulty} onChange={(e) => setMin(e.target.value)} />
      </label>
      <label>Max diff&nbsp;
        <input type="number" min="1" max="5" value={maxDifficulty} onChange={(e) => setMax(e.target.value)} />
      </label>
      <button type="submit">Appliquer</button>
    </form>
  );
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

    {question.imageUrl && (
      <div style={{ margin: "8px 0" }}>
        <img
          src={`http://localhost:4001${question.imageUrl}`}
          alt="Illustration"
          style={{ maxWidth: "100%", borderRadius: 8 }}
        />
      </div>
    )}

    {question.type === "single_choice" && Array.isArray(question.choices) ? (
      <div style={{ display: "grid", gap: 8, maxWidth: 420 }}>
        {question.choices.map((c) => (
          <button>
            {/* compte à rebours */}
              {typeof timeLeftMs === "number" && (
                <div style={{ margin: "8px 0" }}>
                  <div style={{ fontSize: 12, opacity: 0.75 }}>
                    Temps restant: {Math.ceil(timeLeftMs / 1000)}s
                  </div>
                  <div style={{ height: 6, background: "#eee", borderRadius: 4, overflow: "hidden" }}>
                    {question.durationMs && (
                      <div
                        style={{
                          height: "100%",
                          width: `${Math.max(0, (timeLeftMs / question.durationMs) * 100)}%`,
                          background: "#4caf50",
                          transition: "width 0.2s linear",
                        }}
                      />
                    )}
                  </div>
                </div>
              )}

              {/* rendu dynamique selon le type */}
              {question.type === "single_choice" && Array.isArray(question.choices) ? (
                <div style={{ display: "grid", gap: 8, maxWidth: 420 }}>
                  {question.choices.map((c) => (
                    <button key={c.value} disabled={answered} onClick={() => emitAnswer(c.value)}>
                      {c.text}
                    </button>
                  ))}
                </div>
              ) : question.type === "multi_choice" && Array.isArray(question.choices) ? (
                <div style={{ display: "grid", gap: 8, maxWidth: 420 }}>
                  {question.choices.map((c) => {
                    const checked = selected.includes(c.value);
                    return (
                      <label key={c.value} style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        <input
                          type="checkbox"
                          disabled={answered}
                          checked={checked}
                          onChange={(e) => {
                            if (answered) return;
                            setSelected((prev) => {
                              if (e.target.checked) return Array.from(new Set([...prev, c.value]));
                              return prev.filter((v) => v !== c.value);
                            });
                          }}
                        />
                        <span>{c.text}</span>
                      </label>
                    );
                  })}
                  <button
                    disabled={answered || selected.length === 0}
                    onClick={() => emitAnswer(selected)}
                  >
                    Envoyer ma réponse
                  </button>
                </div>
              ) : (
                <>
                  <button disabled={answered} onClick={() => emitAnswer(true)}>Vrai</button>{" "}
                  <button disabled={answered} onClick={() => emitAnswer(false)}>Faux</button>
                </>
              )}

          
          </button>
        ))}
      </div>
    ) : (
      <>
        <button disabled={answered} onClick={() => emitAnswer(true)}>
          Vrai
        </button>{" "}
        <button disabled={answered} onClick={() => emitAnswer(false)}>
          Faux
        </button>
      </>
    )}

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
        <h3>Règles (host)</h3>
        <RulesForm onSubmit={(rules) => {
          const s = socketRef.current;
          if (!s || !room) return;
          s.emit("admin:rules", rules);
        }} />
      </section>


      <section style={{ marginTop: 12 }}>
        <h2>Scoreboard</h2>
        {reveal ? (
  <>
    <p>
      Bonne réponse: <b>{String(reveal.correctAnswer)}</b> | Gagnant:{" "}
      <b>{reveal.winnerId || "—"}</b>
    </p>
    {reveal.explanation && (
      <p style={{ opacity: 0.85 }}>
        <i>Explication:</i> {reveal.explanation}
      </p>
    )}
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
