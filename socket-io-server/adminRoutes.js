const express = require("express");
const router = express.Router();
const Question = require("./models/Question");

// (plus tard on mettra une vraie auth admin ici)
function requireAdmin(req, res, next) {
  return next();
}
const { requireAuth } = require("./authRoutes");


// CREATE — POST /admin/questions
router.post("/questions", requireAdmin, async (req, res) => {
  try {
    //  ici on pourrait valider avec Zod; pour l’instant on fait simple
    const q = await Question.create(req.body);
    res.status(201).json(q);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// LIST — GET /admin/questions?category=G1&minDiff=1&maxDiff=3
router.get("/questions", async (req, res) => {
  try {
    const { category, minDiff, maxDiff } = req.query;
    const where = {};
    if (category) where.category = category;
    if (minDiff || maxDiff) {
      where.difficulty = {};
      if (minDiff) where.difficulty.$gte = Number(minDiff);
      if (maxDiff) where.difficulty.$lte = Number(maxDiff);
    }
    const docs = await Question.find(where).sort({ createdAt: -1 }).limit(200);
    res.json(docs);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
