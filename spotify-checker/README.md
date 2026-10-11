# 🚩 Redflagy — version autonome (sans base44)

Redflagy analyse vos playlists afin de signaler les affaires judiciaires
connues, grâce à un système de drapeaux simple et clair :
- 🔴 **Rouge** = condamnation pénale définitive, documentée par des sources publiques vérifiées
- 🟠 **Orange** = suspicion / accusation / mise en examen / enquête en cours
- 🟢 **Vert** = rien à signaler

Tout tourne en local sur ta machine, avec une base SQLite (aucun service
externe payant hormis Spotify et Anthropic).

> ⚠️ **Sur les exemples "rouge"/"orange"** : un classement "rouge" suppose une
> condamnation *définitive* (toutes voies de recours épuisées). Une affaire en
> cours de procès ou en instruction — même très médiatisée — reste "orange"
> tant qu'il n'y a pas de jugement définitif, par présomption d'innocence.
> C'est le modèle (Claude) qui applique cette règle dynamiquement à chaque
> scan ; aucun nom n'est codé en dur dans l'app, pour que le classement reste
> à jour avec l'actualité judiciaire de chacun.

## Ce qui a changé par rapport à l'app base44

- **Base de données** : SQLite locale (`data.sqlite`, créée automatiquement au
  premier lancement) au lieu de `base44.entities`.
- **Spotify** : Client Credentials Flow (pas de login utilisateur, pas de
  popup, pas de souci COOP) → **playlists publiques uniquement**. Les
  playlists privées ne sont pas supportées dans cette version ; utilise le
  mode "Exportify (CSV)" pour celles-ci, comme dans l'app d'origine.
- **Pagination Spotify corrigée** : toutes les pages de la playlist sont
  récupérées (le bug des "100 artistes max" est réglé dans `server/spotify.js`).
- **Classification LLM par lots (batch)** : au lieu d'un appel à l'API par
  artiste, les artistes inconnus sont envoyés par groupes de 15 à Claude en un
  seul appel (`server/classify.js`, `BATCH_SIZE`). C'est ce qui causait la
  surconsommation de quota avant.
- **Deezer, détection de genre avancée, OAuth Spotify utilisateur** : non
  implémentés dans cette version (voir "Pour aller plus loin" en bas).

## Installation

### 1. Prérequis
- Node.js 18+ installé (`node -v` pour vérifier)

### 2. Installer les dépendances
```bash
cd spotify-checker
npm install
```

### 3. Obtenir tes clés API

**Spotify** (gratuit) :
1. Va sur https://developer.spotify.com/dashboard
2. Crée une app (le "Redirect URI" n'a pas d'importance ici, tu peux mettre
   `http://localhost:3000`)
3. Récupère le **Client ID** et le **Client Secret**

**Anthropic (Claude)** :
1. Va sur https://console.anthropic.com/
2. Crée une clé API dans la section "API Keys"

### 4. Configurer les variables d'environnement
```bash
cp .env.example .env
```
Puis édite `.env` et remplace :
```
SPOTIFY_CLIENT_ID=ton_client_id
SPOTIFY_CLIENT_SECRET=ton_client_secret
ANTHROPIC_API_KEY=ta_cle_api
```

### 5. Lancer l'app
```bash
npm start
```
Puis ouvre http://localhost:3000 dans ton navigateur.

## Structure du projet

```
spotify-checker/
├── server/
│   ├── server.js       # point d'entrée Express
│   ├── db.js            # schéma + connexion SQLite
│   ├── spotify.js       # auth Spotify + extraction paginée des artistes
│   ├── classify.js      # classification par lots via Claude
│   └── routes/
│       ├── artists.js   # CRUD base de personnalités
│       ├── scans.js     # historique des scans
│       ├── spotify.js   # POST /api/spotify/playlist
│       └── run-scan.js  # orchestration complète d'un scan
├── public/
│   ├── index.html
│   ├── style.css
│   └── app.js            # frontend vanilla JS (3 pages : Scan / Artistes / Historique)
├── .env.example
└── package.json
```

## Limites connues / pour aller plus loin

- **Playlists privées Spotify** : nécessiteraient l'Authorization Code Flow
  (login utilisateur). Faisable, mais demande un domaine avec HTTPS pour la
  redirect URI en production — je peux l'ajouter si tu en as besoin.
- **Rate limiting Spotify (429)** : géré avec retry automatique dans
  `spotify.js`, mais sur de très grosses playlists (>1000 titres) ça peut
  prendre un peu de temps.
- **Coût Anthropic** : chaque scan avec des artistes inconnus déclenche des
  appels API payants. Le batching réduit fortement le nombre d'appels, mais
  pas le coût total lié au volume de texte. Pense à surveiller ta
  consommation sur https://console.anthropic.com/
- **Pas d'authentification utilisateur** : cette version est mono-utilisateur,
  pensée pour tourner en local. Pour un déploiement public multi-utilisateurs,
  il faudrait ajouter une couche d'auth (ex: sessions + comptes).
