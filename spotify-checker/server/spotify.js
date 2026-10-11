const fetch = require("node-fetch");

let cachedToken = null;
let cachedTokenExpiresAt = 0;

/**
 * Client Credentials flow: works for PUBLIC playlists only (no user login needed).
 * This sidesteps the popup/COOP OAuth problems entirely.
 */
async function getAccessToken() {
  const now = Date.now();
  if (cachedToken && now < cachedTokenExpiresAt - 10_000) {
    return cachedToken;
  }

  const clientId = process.env.SPOTIFY_CLIENT_ID;
  const clientSecret = process.env.SPOTIFY_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    throw new Error("SPOTIFY_CLIENT_ID / SPOTIFY_CLIENT_SECRET manquants dans .env");
  }

  const basic = Buffer.from(`${clientId}:${clientSecret}`).toString("base64");
  const res = await fetch("https://accounts.spotify.com/api/token", {
    method: "POST",
    headers: {
      Authorization: `Basic ${basic}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: "grant_type=client_credentials",
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Échec auth Spotify (${res.status}): ${text}`);
  }

  const data = await res.json();
  cachedToken = data.access_token;
  cachedTokenExpiresAt = now + data.expires_in * 1000;
  return cachedToken;
}

/**
 * Extracts a Spotify playlist ID from any common URL/URI format:
 * - https://open.spotify.com/playlist/37i9dQZF1DXcBWIGoYBM5M?si=...
 * - spotify:playlist:37i9dQZF1DXcBWIGoYBM5M
 */
function extractPlaylistId(url) {
  const trimmed = (url || "").trim();
  const uriMatch = trimmed.match(/spotify:playlist:([a-zA-Z0-9]+)/);
  if (uriMatch) return uriMatch[1];

  const urlMatch = trimmed.match(/open\.spotify\.com\/(?:intl-[a-z]{2}\/)?playlist\/([a-zA-Z0-9]+)/);
  if (urlMatch) return urlMatch[1];

  return null;
}

/**
 * Fetches ALL tracks of a playlist, following pagination (Spotify caps each
 * page at 100 items via the `limit` param, and signals more pages via `next`).
 * Returns { playlistName, artists: string[] (unique, in first-seen order) }.
 */
async function getPlaylistArtists(url) {
  const playlistId = extractPlaylistId(url);
  if (!playlistId) {
    return { success: false, error: "URL de playlist Spotify invalide." };
  }

  const token = await getAccessToken();
  const authHeaders = { Authorization: `Bearer ${token}` };

  // Playlist metadata (name) — also tells us quickly if it's private/not found.
  const metaRes = await fetch(
    `https://api.spotify.com/v1/playlists/${playlistId}?fields=name,public`,
    { headers: authHeaders }
  );

  if (metaRes.status === 404) {
    return { success: false, needs_auth: true, error: "Playlist introuvable ou privée." };
  }
  if (metaRes.status === 401) {
    return { success: false, error: "Jeton Spotify invalide ou expiré." };
  }
  if (metaRes.status === 429) {
    const retryAfter = metaRes.headers.get("retry-after") || "quelques secondes";
    return { success: false, error: `Limite de requêtes Spotify atteinte. Réessayez dans ${retryAfter}s.` };
  }
  if (!metaRes.ok) {
    return { success: false, error: `Erreur Spotify (${metaRes.status}).` };
  }

  const meta = await metaRes.json();

  // Paginate through every page of tracks, 100 at a time, until `next` is null.
  const artistsOrdered = [];
  const seen = new Set();
  let nextUrl = `https://api.spotify.com/v1/playlists/${playlistId}/tracks?limit=100&fields=items(track(artists(name))),next`;

  while (nextUrl) {
    const res = await fetch(nextUrl, { headers: authHeaders });

    if (res.status === 429) {
      const retryAfter = parseInt(res.headers.get("retry-after") || "1", 10);
      await new Promise((r) => setTimeout(r, (retryAfter + 1) * 1000));
      continue; // retry same page
    }
    if (!res.ok) {
      return { success: false, error: `Erreur Spotify pendant la pagination (${res.status}).` };
    }

    const page = await res.json();
    for (const item of page.items || []) {
      const track = item.track;
      if (!track || !track.artists) continue;
      for (const a of track.artists) {
        const name = (a.name || "").trim();
        if (name && !seen.has(name.toLowerCase())) {
          seen.add(name.toLowerCase());
          artistsOrdered.push(name);
        }
      }
    }

    nextUrl = page.next || null;
  }

  return {
    success: true,
    playlist_name: meta.name || "",
    artists: artistsOrdered,
  };
}

module.exports = { getPlaylistArtists, extractPlaylistId };
