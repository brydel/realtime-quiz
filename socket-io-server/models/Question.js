const mongoose = require("mongoose");

const QuestionSchema = new mongoose.Schema(
  {
    statement: { type: String, required: true }, // énoncé de la question
    category: { type: String, enum: ["G1", "G2", "G"], required: true },
    difficulty: { type: Number, min: 1, max: 5, default: 1 },
    type: {
      type: String,
      enum: ["true_false", "single_choice", "multi_choice"],
      default: "true_false",
    },
    choices: [{ text: String, value: String }], // utilisé si single/multi choice
    // answer peut être: boolean | string | string[]
    answer: { type: mongoose.Schema.Types.Mixed, required: true },
    imageUrl: { type: String },      // ex: "/images/signs/stop.png"
    explanation: { type: String },   // explication affichée après reveal
    tags: [String],
    active: { type: Boolean, default: true },
  },
  { timestamps: true }
);

module.exports = mongoose.model("Question", QuestionSchema);
