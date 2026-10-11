const express = require("express");
const crypto = require("crypto");
const db = require("../db");

const router = express.Router();

router.get("/", (req, res) => {
  const rows = db.prepare("SELECT * FROM artists ORDER BY created_date DESC").all();
  res.json(rows);
});

router.post("/", (req, res) => {
  const { name, status, reason, category, gender, image_url, source_url } = req.body;
  if (!name || !status) {
    return res.status(400).json({ error: "name et status sont requis." });
  }
  const id = crypto.randomUUID();
  const created_date = new Date().toISOString();
  db.prepare(
    `INSERT INTO artists (id, name, status, reason, category, gender, image_url, source_url, created_date)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(id, name, status, reason || "", category || "rien", gender || "inconnu", image_url || null, source_url || null, created_date);

  const row = db.prepare("SELECT * FROM artists WHERE id = ?").get(id);
  res.status(201).json(row);
});

router.delete("/:id", (req, res) => {
  db.prepare("DELETE FROM artists WHERE id = ?").run(req.params.id);
  res.status(204).end();
});

module.exports = router;
