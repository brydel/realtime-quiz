import { useEffect, useState  } from "react";
import { io } from "socket.io-client";

const SERVER_URL = "http://localhost:4001"; 

export default function App() {
  const [connected, setConnected] = useState(false);
  const [socketID, setSocketID] = useState("");
  const [tick, setTick] = useState("");


  useEffect(() => {

    // 1 ouvrir e connexion temp reel vers le serveur
    const socket = io(SERVER_URL,{
      transports: ["websocket"],
      withCredentials: true,
      
    
  });

  //2 etat de la connexion
  socket.on("connect", () => {
    setConnected(true);
    setSocketID(socket.id);
  });

  // 3 msessage de bienvenu
  socket.on("system:hello", (payload) => {
    console.log("system:hello", payload);
  });

  //4 horloge temp reel
  socket.on("demo:time", (payload) => {
    setTick(payload.now);
  });

  //5 nettoyage a la fermeture du composant
  return () => {
    socket.disconnect();
  };
},[]);

  return (
    <div style={{ fontFamily: "system-ui", padding: 16 }}>
      <h1>Socket.IO React Client</h1>
      <p>Statut de la connexion: {connected ? "Connecté" : "Déconnecté"}</p>
      <p>ID du socket: {socketID}</p>
      <p>Horloge du serveur: {tick}</p>
    </div>
  );
}
