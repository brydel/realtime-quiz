const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const {RoomManager} = require('./engine/RoomManager');

const PORT = process.env.PORT || 4001;

// 1 APP http

const app = express();

//2 cors http

app.use(cors({ origin: "http://localhost:5173", credentials: true }));

// 3 route essais

app.get("/essais", (req, res) => res.status(200).json({ok:true}));

// 4 serveur http pour que socket.io se branche dessus

const server = http.createServer(app);

//5 instance socket.io avec cors du côté websocket

const io = new Server(server, {
    cors: {
        origin: "http://localhost:5173",
        methods: ["GET", "POST"],
        credentials: true
    }
});
//-- branchement de la logique du jeu RoomManager

const rooms = new RoomManager(io);

io.on("connection", (socket) => {
  console.log(`Utilisateur connecté : ${socket.id}`);


  // horloge, pour verifier le temps reel
  const intervalId = setInterval(() => {
    socket.emit("demo:time", { now: new Date().toISOString() });
  }, 1000);

  socket.on("room:join", ({ roomId, nickname }) => rooms.joinRoom(socket, { roomId, nickname }));
  socket.on("room:leave", () => room.leaveRoom(socket));
  socket.on("answer:submit", (payload) => rooms.submitAnswer(socket, payload));


  // admin host: demarer question + reveal

  socket.on("admin:nextQuestion", ({ roomId }) => rooms.startQuestion({ roomId }));
  socket.on("admin:reveal", ({ roomId }) => rooms.reveal({ roomId }));


  socket.on("disconnect", () => {
    clearInterval(intervalId);
    room.leaveRoom(socket);
    console.log("Client disconnected:", socket.id);
  });
  
});



//--evenements de gestion des rooms



// 6 ecoute des connexion en temp reel

// io.on("connection", (socket) => {
//     console.log(`Utilisateur connecté : ${socket.id}`);

//     //a message 
//     socket.emit("system:hello", {message: "Bienvenue sur le serveur Socket.io", socketId: socket.id});


//     // b horloge ems chaque seconde

//    const intervalId = setInterval(() => {
//     socket.emit("demo:time", { now: new Date().toISOString() });
//   }, 1000);

//   // c Nettoyage quand le client sedeconnecte
//   socket.on("disconnect", () => {
//     clearInterval(intervalId);
//     console.log("Client disconnected:", socket.id);
//   });
// });

// 7 Lancement
server.listen(PORT, () => console.log(`Listening on port ${PORT}`));