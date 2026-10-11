const express = require("express");
const crypto = require("crypto");
const db = require("../db");

const router = express.Router();

router.get("/", (req, res) => {
  const rows = db.prepare("SELECT * FROM scans ORDER BY created_date DESC").all();
  const parsed = rows.map((r) => ({
    ...r,
    artists: JSON.parse(r.artists),
    results: JSON.parse(r.results),
  }));
  res.json(parsed);
});

router.post("/", (req, res) => {
  const { name, artists, results, red_count, orange_count, green_count } = req.body;
  if (!Array.isArray(artists) || !Array.isArray(results)) {
    return res.status(400).json({ error: "artists et results doivent être des tableaux." });
  }
  const id = crypto.randomUUID();
  const created_date = new Date().toISOString();
  db.prepare(
    `INSERT INTO scans (id, name, artists, results, red_count, orange_count, green_count, created_date)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    id,
    name || `Scan du ${new Date().toLocaleDateString("fr-FR")}`,
    JSON.stringify(artists),
    JSON.stringify(results),
    red_count || 0,
    orange_count || 0,
    green_count || 0,
    created_date
  );
  const row = db.prepare("SELECT * FROM scans WHERE id = ?").get(id);
  res.status(201).json({ ...row, artists: JSON.parse(row.artists), results: JSON.parse(row.results) });
});

module.exports = router;
