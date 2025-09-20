const express = require("express");
const router = express.Router();
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const User = require("./models/User");

const JWT_SECRET = process.env.JWT_SECRET || "supersecret";

// REGISTER (crée un compte)
router.post("/register", async (req, res) => {
  const { email, password, role } = req.body;
  try {
    const existing = await User.findOne({ email });
    if (existing) return res.status(400).json({ error: "Email déjà utilisé" });

    const passwordHash = await bcrypt.hash(password, 10);
    const user = await User.create({ email, passwordHash, role: role || "player" });
    res.status(201).json({ message: "Utilisateur créé", id: user._id });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// LOGIN (retourne un JWT)
router.post("/login", async (req, res) => {
  const { email, password } = req.body;
  try {
    const user = await User.findOne({ email });
    if (!user) return res.status(400).json({ error: "Utilisateur introuvable" });

    const valid = await bcrypt.compare(password, user.passwordHash);
    if (!valid) return res.status(400).json({ error: "Mot de passe incorrect" });

    const token = jwt.sign(
      { id: user._id, role: user.role },
      JWT_SECRET,
      { expiresIn: "2h" }
    );

    // On envoie le token dans un cookie httpOnly
    res.cookie("token", token, { httpOnly: true, secure: false });
    res.json({ message: "Login réussi", role: user.role });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});


// MIDDLEWARE pour vérifier un JWT
function requireAuth(role = null) {
  return (req, res, next) => {
    const token = req.cookies?.token;
    if (!token) return res.status(401).json({ error: "Non authentifié" });

    try {
      const payload = jwt.verify(token, JWT_SECRET);
      if (role && payload.role !== role) {
        return res.status(403).json({ error: "Accès interdit" });
      }
      req.user = payload; // on stocke l’utilisateur pour la suite
      next();
    } catch (err) {
      return res.status(401).json({ error: "Token invalide" });
    }
  };
}

module.exports = { router, requireAuth };