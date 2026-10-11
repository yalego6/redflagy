const express = require("express");
const crypto = require("crypto");
const db = require("../db");
const { classifyArtists } = require("../classify");

const router = express.Router();

router.post("/", async (req, res) => {
  const { playlistName, artistList } = req.body;
  if (!Array.isArray(artistList) || artistList.length === 0) {
    return res.status(400).json({ error: "artistList (tableau non vide) requis." });
  }

  try {
    const knownArtists = db.prepare("SELECT * FROM artists").all();
    const knownByLower = new Map(knownArtists.map((a) => [a.name.toLowerCase(), a]));

    const scanResults = [];
    const unknownNames = [];

    for (const name of artistList) {
      const match = knownByLower.get(name.toLowerCase());
      if (match) {
        scanResults.push({
          artist_name: match.name,
          status: match.status,
          reason: match.reason || "",
          image_url: match.image_url,
          source_url: match.source_url,
          category: match.category,
          gender: match.gender || "inconnu",
          __known: true,
        });
      } else {
        unknownNames.push(name);
      }
    }

    // Single batched classification pass for everyone not already known —
    // this is the piece that previously made one LLM call per artist.
    if (unknownNames.length > 0) {
      const classified = await classifyArtists(unknownNames);
      const insertStmt = db.prepare(
        `INSERT INTO artists (id, name, status, reason, category, gender, image_url, source_url, created_date)
         VALUES (?, ?, ?, ?, ?, ?, NULL, NULL, ?)`
      );

      for (const c of classified) {
        scanResults.push({
          artist_name: c.name,
          status: c.status,
          reason: c.reason,
          category: c.category,
          gender: c.gender,
          __known: false,
        });

        // Persist to the artists DB (skip "green" to keep it focused on flagged people,
        // matching the original app's behavior).
        if (c.status !== "green") {
          insertStmt.run(
            crypto.randomUUID(),
            c.name,
            c.status,
            c.reason,
            c.category,
            c.gender,
            new Date().toISOString()
          );
        }
      }
    }

    const redCount = scanResults.filter((r) => r.status === "red").length;
    const orangeCount = scanResults.filter((r) => r.status === "orange").length;
    const greenCount = scanResults.filter((r) => r.status === "green").length;

    const id = crypto.randomUUID();
    const created_date = new Date().toISOString();
    const finalName = playlistName || `Scan du ${new Date().toLocaleDateString("fr-FR")}`;

    db.prepare(
      `INSERT INTO scans (id, name, artists, results, red_count, orange_count, green_count, created_date)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      id,
      finalName,
      JSON.stringify(artistList),
      JSON.stringify(scanResults),
      redCount,
      orangeCount,
      greenCount,
      created_date
    );

    res.json({
      scan_id: id,
      name: finalName,
      items: scanResults,
      redCount,
      orangeCount,
      greenCount,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
