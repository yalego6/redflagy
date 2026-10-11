const express = require("express");
const { getPlaylistArtists } = require("../spotify");

const router = express.Router();

router.post("/playlist", async (req, res) => {
  const { url } = req.body;
  if (!url) return res.status(400).json({ success: false, error: "url manquante." });

  try {
    const result = await getPlaylistArtists(url);
    res.json(result);
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = router;
