const mongoose = require("mongoose");

const UserSchema = new mongoose.Schema({
  email: { type: String, required: true, unique: true },
  passwordHash: { type: String, required: true }, // on ne veu pas  stocke  le mot de passe brut
  role: { type: String, enum: ["admin", "player"], default: "player" }
}, { timestamps: true });

module.exports = mongoose.model("User", UserSchema);
