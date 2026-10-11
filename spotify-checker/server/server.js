require("dotenv").config();
const path = require("path");
const express = require("express");
const cors = require("cors");

const artistsRouter = require("./routes/artists");
const scansRouter = require("./routes/scans");
const spotifyRouter = require("./routes/spotify");
const runScanRouter = require("./routes/run-scan");

const app = express();
app.use(cors());
app.use(express.json({ limit: "2mb" }));

app.use("/api/artists", artistsRouter);
app.use("/api/scans", scansRouter);
app.use("/api/spotify", spotifyRouter);
app.use("/api/run-scan", runScanRouter);

app.use(express.static(path.join(__dirname, "..", "public")));
app.get("*", (req, res) => {
  res.sendFile(path.join(__dirname, "..", "public", "index.html"));
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`✅ Serveur lancé sur http://localhost:${PORT}`);
  if (!process.env.SPOTIFY_CLIENT_ID) {
    console.warn("⚠️  SPOTIFY_CLIENT_ID absent de .env — l'extraction de playlists échouera.");
  }
  if (!process.env.ANTHROPIC_API_KEY) {
    console.warn("⚠️  ANTHROPIC_API_KEY absent de .env — la classification échouera.");
  }
});
