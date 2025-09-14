

const STATES ={
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

class RoomManager {
    constructor(io) {
        this.io = io;
        this.rooms = new Map(); // on map chaque roomId à une room

        //demo avec un petit jeux
        this.demoQuestions = DEFAULT_QUESTIONS;
            
    }

    // ---Helpers internes---   

    ensureRoom(roomId) {
        if (!this.rooms.has(roomId)) {
            this.rooms.set(roomId, {
                id: roomId,
                state: STATES.LOBBY,
                round:0,
                players: new Map(), // playerId -> {id, Nickname, score}
                question: null,
                answers: new Map(), // playerId -> answer
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
            players: Array.from(room.players.values()).map(p => ({ id: p.id, nickname: p.nickname, score: p.score })),
            question: room.state === STATES.QUESTION ? { id: room.question.id, statement: room.question.statement } : null,

        };
        this.io.to(room.id).emit("room:state", payload);
    }

    // api appler depuis app.js

    joinRoom(socket, {roomId, nickname}) {
        const room = this.ensureRoom(roomId);

        socket.join(roomId);
        socket.data.roomId = room.id;

        if (!nickname) nickname =`Guest-${socket.id.slice(0,4)}`;

        // premier a arriver est l'host

        if(!room.hostId) room.hostId = socket.id;

        room.players.set(socket.id, {id: socket.id, nickname, score:0});
        socket.emit("system:hello", {message: "`Bienvenue dans la room ," , sockeId: socket.id, roomId: room.id} );
        this.emitRoomState(room)
        
    }


    //quitter la room

    leaveRoom(socket) {
        const roomId = socket.data.roomId;
        if(!roomId) return;
        const room = this.rooms.get(roomId);
        if(!room) return;

        room.players.delete(socket.id);
        socket.leave(roomId);

        // si le host part on nomme une autre personne en attente

        if(room.hostId === socket.id) {
            const nextPlayer = room.players.keys().next();
            room.hostId = nextPlayer && !nextPlayer.done ? nextPlayer.value : null;
        }


        // si la room est vide on la supprime
        if(room.players.size === 0) {
            this.rooms.delete(roomId);
            return;
        }
        this.emitRoomState(room);
    }

    //on lance les question

    startQuestion({roomId}) {
        const room = this.rooms.get(roomId);

        if(!room) return;

        // on demarre seulement depuis lobby ou scoreboard

        if(![STATES.LOBBY, STATES.SCOREBOARD].includes(room.state)) return;

        room.round +=1;
        room.state = STATES.QUESTION;
        room.answers.clear();
        const bank = Array.isArray(this.demoQuestions) && this.demoQuestions.length
           ? this.demoQuestions
           : DEFAULT_QUESTIONS;
           
        room.question = this.demoQuestions[(room.round - 1) % this.demoQuestions.length];

        this.io.to(room.id).emit("question:new",{
            id: room.question.id,
            statement: room.question.statement,
            round: room.round,
            startedAt: Date.now(),
        });
        this.emitRoomState(room);
    }

    // on soumet les 

    submitAnswer(socket, {answer}) {
        const roomId = socket.data.roomId;
        const room = this.rooms.get(roomId);

        if(!room || room.state !== STATES.QUESTION || !room.question) return;

        // on veux une seul reponse pas joueur

        if(room.answers.has(socket.id)) return;

        const normalized = Boolean(answer);

        room.answers.set(socket.id, { answer: normalized, tRecv: Date.now() });
        socket.emit("answer:ack", { ok: true });
    }

    // on revele la reponse

    reveal({roomId}) {
        const room = this.rooms.get(roomId);
        if(!room || room.state !== STATES.QUESTION) return;

        room.state = STATES.REVEAL;

        // calcul des scores

        const correct =[];

        for(const [sid,rec] of room.answers.entries()) {
           room.answers.set(socket.id, { answer: normalized, tRecv: Date.now() });
           socket.emit("answer:ack", { ok: true });
        }

        // tri par temps de reponse (min = plus rapide)

        correct.sort((a,b) => a.t - b.t);
        const winner = correct.lenght ? correct[0].id : null;


        // on ajoute +1 au score au plus rapide quia eu juste

        if(winner && room.players.has(winner)){
            room.players.get(winner).score +=1;
        }

        this.io.to(room.id).emit("question:reveal", {
            correctAnswer: room.question.answer,
            winnerId: winner,
            scoreboard: Array.from(room.players.values())
            .sort((a,b) => b.score - a.score)
            .map(p => ({ id: p.id, nickname: p.nickname, score: p.score })),
        });

        //on n'affiche le scoreboard

        room.state = STATES.SCOREBOARD;
        this.emitRoomState(room);
    }

   

}
module.exports = { RoomManager, STATES};