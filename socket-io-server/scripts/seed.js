const mongoose = require("mongoose");
const Question = require("../models/Question");

(async () => {
  try {
    await mongoose.connect(process.env.MONGO_URL || "mongodb://127.0.0.1:27017/realtime_quiz");

    const data = [
      {
        statement: "Quel panneau indique un arrêt obligatoire ?",
        category: "G1",
        difficulty: 1,
        type: "single_choice",
        choices: [
          { text: "Cédez", value: "yield" },
          { text: "Stop", value: "stop" },
          { text: "Interdiction de tourner", value: "no_turn" },
        ],
        answer: "stop",
        imageUrl: "/images/stop.png",
        explanation: "Le panneau octogonal rouge indique l'obligation de s'arrêter.",
        tags: ["sign","priority"],
      },
      {
        statement: "À un feu vert, vous pouvez avancer si l’intersection est libre.",
        category: "G1",
        difficulty: 1,
        type: "true_false",
        answer: true,
        imageUrl: null,
        explanation: "Ne vous engagez jamais si l'intersection est bouchée.",
        tags: ["traffic_light","intersection"],
      },
    ];

    await Question.deleteMany({});
    await Question.insertMany(data);
    console.log("Seed done");
    process.exit(0);
  } catch (e) {
    console.error(e);
    process.exit(1);
  }
})();
