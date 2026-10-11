// --- Tiny API helper ---
const api = {
  async get(url) {
    const res = await fetch(url);
    if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || `Erreur ${res.status}`);
    return res.json();
  },
  async post(url, body) {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body || {}),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || `Erreur ${res.status}`);
    return data;
  },
  async del(url) {
    const res = await fetch(url, { method: "DELETE" });
    if (!res.ok && res.status !== 204) throw new Error(`Erreur ${res.status}`);
  },
};

function escapeHtml(str) {
  return String(str ?? "").replace(/[&<>"']/g, (c) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  }[c]));
}

function badge(status, count) {
  const labels = { red: "Rouge", orange: "Orange", green: "Vert" };
  return `<span class="badge ${status}">${labels[status]} ${count !== undefined ? `· ${count}` : ""}</span>`;
}

function artistCardHtml(a) {
  const categoryLabels = { condamnation: "Condamnation", accusation: "Accusation", delit: "Délit", rien: "Rien à signaler" };
  return `
    <div class="card artist-card ${a.status}">
      <div class="row" style="justify-content: space-between; align-items: flex-start;">
        <div>
          <strong>${escapeHtml(a.name || a.artist_name)}</strong>
          ${badge(a.status)}
          <div class="muted" style="margin-top:4px;">${categoryLabels[a.category] || ""}</div>
        </div>
        ${a.deleteId ? `<button class="btn" data-del-artist="${a.deleteId}">🗑</button>` : ""}
      </div>
      ${a.reason ? `<p style="margin: 8px 0 0; font-size: 14px;">${escapeHtml(a.reason)}</p>` : ""}
    </div>
  `;
}

// --- Router ---
const pages = {};
let currentPage = "scan";

function navigate(page) {
  currentPage = page;
  document.querySelectorAll(".nav-btn").forEach((b) => b.classList.toggle("active", b.dataset.page === page));
  pages[page]();
}

document.querySelectorAll(".nav-btn").forEach((btn) => {
  btn.addEventListener("click", () => navigate(btn.dataset.page));
});

// ============================================================
// SCAN PAGE
// ============================================================
const scanState = {
  playlistName: "",
  artistList: [],
  mode: "single",
  extracting: false,
  extractError: "",
  scanning: false,
  results: null,
  genderFilter: [],
};

pages.scan = function renderScan() {
  const s = scanState;
  const el = document.getElementById("content");

  if (s.results) {
    el.innerHTML = renderScanResults(s.results);
    bindScanResultsEvents();
    return;
  }

  el.innerHTML = `
    <h2>Scanner une playlist</h2>
    <p class="muted">Importez ou saisissez les noms à vérifier</p>

    <div class="row legend" style="margin: 12px 0 20px; font-size: 13px;">
      <span class="badge red">Rouge</span><span class="muted">condamnation pénale définitive</span>
      <span class="badge orange" style="margin-left:12px;">Orange</span><span class="muted">accusation / mise en examen / enquête en cours</span>
      <span class="badge green" style="margin-left:12px;">Vert</span><span class="muted">rien à signaler</span>
    </div>
    <p class="muted" style="font-size: 12px; margin-top: -12px;">
      ⚠️ Classement généré automatiquement à partir de sources publiques, à vérifier par vous-même avant toute conclusion.
      Une accusation ou une mise en examen (orange) ne vaut pas condamnation — présomption d'innocence.
    </p>

    ${s.extracting ? `<div class="loading"><div class="spinner"></div> Extraction de la playlist en cours…</div>` : ""}
    ${s.extractError ? `<div class="error-box">${escapeHtml(s.extractError)}</div>` : ""}

    <div style="margin: 16px 0;">
      <label style="font-size:14px; font-weight:500; display:block; margin-bottom:6px;">Nom de la playlist / session (optionnel)</label>
      <input type="text" id="playlistNameInput" value="${escapeHtml(s.playlistName)}" placeholder="Ma playlist du moment..." style="max-width: 400px;" />
    </div>

    <div class="mode-tabs">
      <button class="btn ${s.mode === "single" ? "active" : ""}" data-mode="single">+ Ajouter un par un</button>
      <button class="btn ${s.mode === "bulk" ? "active" : ""}" data-mode="bulk">Coller une liste</button>
      <button class="btn ${s.mode === "url" ? "active" : ""}" data-mode="url">🔗 Importer via URL</button>
      <button class="btn ${s.mode === "exportify" ? "active" : ""}" data-mode="exportify">Exportify (Spotify CSV)</button>
    </div>

    ${renderModeBody(s)}

    ${s.artistList.length > 0 ? `
      <div style="margin: 20px 0;">
        <p style="font-size:14px; font-weight:500;">${s.artistList.length} personnalité(s) à analyser</p>
        <div>
          ${s.artistList.map((n) => `<span class="chip">${escapeHtml(n)} <button data-remove="${escapeHtml(n)}">✕</button></span>`).join("")}
        </div>
      </div>
    ` : ""}

    <button class="btn primary" id="runScanBtn" ${s.artistList.length === 0 || s.scanning ? "disabled" : ""}>
      ${s.scanning ? "Analyse en cours..." : "▶ Lancer l'analyse"}
    </button>
  `;

  bindScanEvents();
};

function renderModeBody(s) {
  if (s.mode === "single") {
    return `
      <div class="row" style="margin-bottom: 16px;">
        <input type="text" id="artistInput" placeholder="Nom de l'artiste ou personnalité..." style="max-width: 400px;" />
        <button class="btn" id="addArtistBtn">+ Ajouter</button>
      </div>
    `;
  }
  if (s.mode === "bulk") {
    return `
      <div style="margin-bottom: 16px;">
        <textarea id="bulkInput" placeholder="Collez votre liste (un par ligne, ou séparés par des virgules)..."></textarea>
        <button class="btn" id="addBulkBtn" style="margin-top:8px;">+ Ajouter tous</button>
      </div>
    `;
  }
  if (s.mode === "url") {
    return `
      <div class="card" style="margin-bottom: 16px;">
        <p class="muted">Collez l'URL d'une playlist Spotify <strong>publique</strong>.</p>
        <div class="row">
          <input type="text" id="urlInput" placeholder="https://open.spotify.com/playlist/..." style="flex:1;" />
          <button class="btn" id="extractUrlBtn" ${s.extracting ? "disabled" : ""}>🔗 Extraire</button>
        </div>
      </div>
    `;
  }
  if (s.mode === "exportify") {
    return `
      <div class="card" style="margin-bottom: 16px;">
        <p><strong>📥 Importer via Exportify</strong></p>
        <ol class="muted" style="font-size: 14px;">
          <li>Allez sur <a href="https://exportify.net" target="_blank">exportify.net</a></li>
          <li>Connectez-vous avec Spotify et cliquez <strong>Export</strong> sur votre playlist</li>
          <li>Téléchargez le fichier CSV et importez-le ici :</li>
        </ol>
        <input type="file" id="csvInput" accept=".csv" />
      </div>
    `;
  }
  return "";
}

function bindScanEvents() {
  const s = scanState;

  document.getElementById("playlistNameInput")?.addEventListener("input", (e) => { s.playlistName = e.target.value; });

  document.querySelectorAll("[data-mode]").forEach((b) => {
    b.addEventListener("click", () => { s.mode = b.dataset.mode; pages.scan(); });
  });

  document.querySelectorAll("[data-remove]").forEach((b) => {
    b.addEventListener("click", () => {
      s.artistList = s.artistList.filter((n) => n !== b.dataset.remove);
      pages.scan();
    });
  });

  document.getElementById("addArtistBtn")?.addEventListener("click", () => {
    const input = document.getElementById("artistInput");
    const name = input.value.trim();
    if (name && !s.artistList.includes(name)) {
      s.artistList.push(name);
      pages.scan();
    }
  });
  document.getElementById("artistInput")?.addEventListener("keydown", (e) => {
    if (e.key === "Enter") { e.preventDefault(); document.getElementById("addArtistBtn").click(); }
  });

  document.getElementById("addBulkBtn")?.addEventListener("click", () => {
    const text = document.getElementById("bulkInput").value;
    const names = text.split(/[\n,;]+/).map((n) => n.trim()).filter(Boolean);
    s.artistList = [...new Set([...s.artistList, ...names])];
    s.mode = "single";
    pages.scan();
  });

  document.getElementById("extractUrlBtn")?.addEventListener("click", async () => {
    const url = document.getElementById("urlInput").value.trim();
    if (!url) return;
    s.extractError = "";
    s.extracting = true;
    pages.scan();
    try {
      const result = await api.post("/api/spotify/playlist", { url });
      if (result.success && result.artists?.length > 0) {
        s.artistList = [...new Set([...s.artistList, ...result.artists])];
        if (result.playlist_name && !s.playlistName) s.playlistName = result.playlist_name;
        s.mode = "single";
      } else if (result.needs_auth) {
        s.extractError = "Cette playlist est privée ou inaccessible. Utilisez le mode Exportify (Spotify CSV).";
      } else {
        s.extractError = result.error || "Impossible d'extraire les artistes de cette playlist.";
      }
    } catch (err) {
      s.extractError = "Erreur : " + err.message;
    } finally {
      s.extracting = false;
      pages.scan();
    }
  });

  document.getElementById("csvInput")?.addEventListener("change", (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const parseCSVLine = (line) => {
        const result = [];
        let cur = "", inQuotes = false;
        for (let i = 0; i < line.length; i++) {
          const ch = line[i];
          if (ch === '"') {
            if (inQuotes && line[i + 1] === '"') { cur += '"'; i++; }
            else inQuotes = !inQuotes;
          } else if (ch === "," && !inQuotes) { result.push(cur.trim()); cur = ""; }
          else cur += ch;
        }
        result.push(cur.trim());
        return result;
      };
      const lines = ev.target.result.split("\n").filter((l) => l.trim());
      const header = parseCSVLine(lines[0]).map((h) => h.toLowerCase());
      const artistIdx = header.findIndex((h) => h.includes("artist name"));
      if (artistIdx === -1) { alert("Colonne 'Artist Name(s)' introuvable dans ce CSV."); return; }
      const artists = [];
      for (let i = 1; i < lines.length; i++) {
        const cols = parseCSVLine(lines[i]);
        const cell = (cols[artistIdx] || "").trim();
        if (!cell) continue;
        cell.split(/\s*,\s*/).map((n) => n.trim()).filter(Boolean).forEach((n) => {
          if (!artists.includes(n)) artists.push(n);
        });
      }
      if (artists.length === 0) { alert("Aucun artiste trouvé dans ce fichier."); return; }
      s.artistList = [...new Set([...s.artistList, ...artists])];
      s.mode = "single";
      pages.scan();
    };
    reader.readAsText(file);
  });

  document.getElementById("runScanBtn")?.addEventListener("click", async () => {
    if (s.artistList.length === 0) return;
    s.scanning = true;
    pages.scan();
    try {
      const result = await api.post("/api/run-scan", {
        playlistName: s.playlistName,
        artistList: s.artistList,
      });
      s.results = result;
      s.genderFilter = [];
    } catch (err) {
      alert("Erreur pendant l'analyse : " + err.message);
    } finally {
      s.scanning = false;
      pages.scan();
    }
  });
}

function renderScanResults(results) {
  const flagged = results.items.filter((r) => r.status !== "green");
  return `
    <h2>Résultats</h2>
    <div class="summary-grid">
      <div class="summary-card red"><div class="num">${results.redCount}</div><div>Rouge</div></div>
      <div class="summary-card orange"><div class="num">${results.orangeCount}</div><div>Orange</div></div>
      <div class="summary-card green"><div class="num">${results.greenCount}</div><div>Vert</div></div>
    </div>
    <h3>✨ Personnalités signalées</h3>
    ${flagged.length === 0
      ? `<p class="muted">✅ Aucun signalement.</p>`
      : ["red", "orange"].map((status) =>
          flagged.filter((r) => r.status === status).map((r) => artistCardHtml(r)).join("")
        ).join("")}
    <div class="row" style="margin-top: 20px;">
      <button class="btn" id="newScanBtn">▶ Nouvelle analyse</button>
    </div>
  `;
}

function bindScanResultsEvents() {
  document.getElementById("newScanBtn")?.addEventListener("click", () => {
    scanState.results = null;
    scanState.artistList = [];
    scanState.playlistName = "";
    pages.scan();
  });
}

// ============================================================
// ARTISTS PAGE
// ============================================================
const artistsState = { search: "", filterStatus: "all", artists: [], loading: true };

pages.artists = async function renderArtists() {
  const el = document.getElementById("content");
  if (artistsState.loading) {
    el.innerHTML = `<h2>Base de personnalités</h2><div class="loading"><div class="spinner"></div> Chargement…</div>`;
    try {
      artistsState.artists = await api.get("/api/artists");
    } catch (err) {
      el.innerHTML += `<div class="error-box">${escapeHtml(err.message)}</div>`;
      return;
    }
    artistsState.loading = false;
  }
  renderArtistsList();
};

function renderArtistsList() {
  const s = artistsState;
  const el = document.getElementById("content");
  const filtered = s.artists.filter((a) => {
    const matchSearch = a.name.toLowerCase().includes(s.search.toLowerCase());
    const matchStatus = s.filterStatus === "all" || a.status === s.filterStatus;
    return matchSearch && matchStatus;
  });
  const order = { red: 0, orange: 1, green: 2 };
  filtered.sort((a, b) => (order[a.status] ?? 3) - (order[b.status] ?? 3));

  el.innerHTML = `
    <h2>Base de personnalités</h2>
    <p class="muted">${s.artists.length} personnalité(s) référencée(s)</p>

    <div class="row" style="margin: 16px 0;">
      <input type="text" id="artistSearch" placeholder="Rechercher un artiste..." value="${escapeHtml(s.search)}" style="max-width: 300px;" />
      <select id="statusFilter" style="padding: 10px; border-radius: 8px; border: 1px solid var(--border);">
        <option value="all" ${s.filterStatus === "all" ? "selected" : ""}>Tous les statuts</option>
        <option value="red" ${s.filterStatus === "red" ? "selected" : ""}>Rouge</option>
        <option value="orange" ${s.filterStatus === "orange" ? "selected" : ""}>Orange</option>
        <option value="green" ${s.filterStatus === "green" ? "selected" : ""}>Vert</option>
      </select>
    </div>

    <details style="margin-bottom: 16px;">
      <summary class="btn" style="display:inline-block;">+ Ajouter une personnalité</summary>
      <div class="card" style="margin-top: 10px; max-width: 480px;">
        <label style="font-size:13px;">Nom</label>
        <input type="text" id="newName" style="margin-bottom:8px;" />
        <label style="font-size:13px;">Statut</label>
        <select id="newStatus" style="width:100%; padding:10px; margin-bottom:8px; border-radius:8px; border:1px solid var(--border);">
          <option value="red">Rouge — Condamnation pénale définitive</option>
          <option value="orange">Orange — Délit / Accusation</option>
          <option value="green">Vert — Rien à signaler</option>
        </select>
        <label style="font-size:13px;">Raison / Détails</label>
        <textarea id="newReason" style="margin-bottom:8px;"></textarea>
        <button class="btn primary" id="createArtistBtn">Ajouter</button>
      </div>
    </details>

    ${filtered.length === 0
      ? `<p class="muted">Aucune personnalité trouvée.</p>`
      : filtered.map((a) => artistCardHtml({ ...a, deleteId: a.id })).join("")}
  `;

  document.getElementById("artistSearch").addEventListener("input", (e) => { s.search = e.target.value; renderArtistsList(); });
  document.getElementById("statusFilter").addEventListener("change", (e) => { s.filterStatus = e.target.value; renderArtistsList(); });

  document.getElementById("createArtistBtn").addEventListener("click", async () => {
    const name = document.getElementById("newName").value.trim();
    const status = document.getElementById("newStatus").value;
    const reason = document.getElementById("newReason").value.trim();
    if (!name) return;
    try {
      await api.post("/api/artists", { name, status, reason, category: status === "green" ? "rien" : "accusation" });
      s.loading = true;
      pages.artists();
    } catch (err) {
      alert("Erreur : " + err.message);
    }
  });

  document.querySelectorAll("[data-del-artist]").forEach((btn) => {
    btn.addEventListener("click", async () => {
      if (!confirm("Supprimer cette personnalité ?")) return;
      try {
        await api.del(`/api/artists/${btn.dataset.delArtist}`);
        s.artists = s.artists.filter((a) => a.id !== btn.dataset.delArtist);
        renderArtistsList();
      } catch (err) {
        alert("Erreur : " + err.message);
      }
    });
  });
}

// ============================================================
// HISTORY PAGE
// ============================================================
pages.history = async function renderHistory() {
  const el = document.getElementById("content");
  el.innerHTML = `<h2>Historique des scans</h2><div class="loading"><div class="spinner"></div> Chargement…</div>`;
  let scans;
  try {
    scans = await api.get("/api/scans");
  } catch (err) {
    el.innerHTML = `<h2>Historique des scans</h2><div class="error-box">${escapeHtml(err.message)}</div>`;
    return;
  }

  el.innerHTML = `
    <h2>Historique des scans</h2>
    <p class="muted">Retrouvez tous vos scans précédents</p>
    ${scans.length === 0
      ? `<p class="muted">Aucun scan pour le moment.</p>`
      : scans.map((scan) => `
        <div class="card">
          <div class="row" style="justify-content: space-between;">
            <div>
              <strong>${escapeHtml(scan.name)}</strong>
              <div class="muted" style="font-size: 13px;">
                ${new Date(scan.created_date).toLocaleString("fr-FR")} · ${scan.artists.length} artistes
              </div>
            </div>
            <div class="row">
              ${scan.red_count > 0 ? badge("red", scan.red_count) : ""}
              ${scan.orange_count > 0 ? badge("orange", scan.orange_count) : ""}
              ${scan.green_count > 0 ? badge("green", scan.green_count) : ""}
            </div>
          </div>
        </div>
      `).join("")}
  `;
};

// --- Boot ---
navigate("scan");
