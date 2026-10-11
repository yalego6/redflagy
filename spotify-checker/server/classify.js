const fetch = require("node-fetch");

const BATCH_SIZE = 15; // artists per LLM call — tune down if responses get truncated

const SYSTEM_PROMPT = `Tu es un expert juridique et en actualité publique française et internationale.
Pour CHAQUE nom de personnalité publique fourni (artiste, acteur, actrice, politique, sportif, influenceur, etc.),
détermine son statut selon ces critères STRICTS :

- "red" : UNIQUEMENT si la personnalité a fait l'objet d'une condamnation pénale DÉFINITIVE (jugement rendu,
  toutes voies de recours épuisées ou délai dépassé), pour des faits graves (violences, agressions sexuelles,
  meurtre, pédocriminalité, corruption, etc.). La condamnation doit être publiquement documentée dans des
  sources fiables, vérifiable et non contestée. En cas de doute sur le caractère définitif, NE PAS mettre "red".
- "orange" : accusation publique crédible, mise en examen, renvoi en correctionnel, ou condamnation non
  définitive (appel en cours). Inclut aussi les aveux publics sur des comportements problématiques.
- "green" : aucune affaire judiciaire connue ou affaire classée sans suite.

Sois factuel, précis et prudent. Si tu n'as pas d'information certaine sur une condamnation définitive,
préfère "orange" ou "green". Indique également le genre : "homme", "femme", ou "inconnu".

Réponds UNIQUEMENT avec un objet JSON valide de cette forme, sans aucun texte autour, sans balises markdown :
{
  "results": [
    { "name": "<nom exact fourni>", "status": "red|orange|green", "reason": "<explication courte factuelle en français>", "category": "condamnation|accusation|delit|rien", "gender": "homme|femme|inconnu" }
  ]
}
L'ordre et le nombre d'éléments dans "results" doivent correspondre exactement à la liste de noms fournie.`;

function chunk(arr, size) {
  const out = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

async function classifyBatch(names) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY manquant dans .env");
  const model = process.env.CLAUDE_MODEL || "claude-sonnet-4-5";

  const userMessage = `Liste des noms à analyser (${names.length}) :\n` +
    names.map((n, i) => `${i + 1}. ${n}`).join("\n");

  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model,
      max_tokens: 4000,
      system: SYSTEM_PROMPT,
      messages: [{ role: "user", content: userMessage }],
    }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Erreur API Anthropic (${res.status}): ${text}`);
  }

  const data = await res.json();
  const text = (data.content || [])
    .filter((b) => b.type === "text")
    .map((b) => b.text)
    .join("\n");

  const cleaned = text.replace(/```json|```/g, "").trim();
  let parsed;
  try {
    parsed = JSON.parse(cleaned);
  } catch (e) {
    throw new Error("Réponse du modèle non-JSON, impossible de parser: " + cleaned.slice(0, 300));
  }

  const results = Array.isArray(parsed.results) ? parsed.results : [];

  // Defensive: map back by position, falling back to a safe default if the
  // model returned fewer/more items than requested.
  return names.map((name, i) => {
    const r = results[i] || {};
    return {
      name,
      status: ["red", "orange", "green"].includes(r.status) ? r.status : "green",
      reason: r.reason || "",
      category: r.category || "rien",
      gender: ["homme", "femme", "inconnu"].includes(r.gender) ? r.gender : "inconnu",
    };
  });
}

/**
 * Classifies a list of artist names in batches (default 15/call) instead of
 * one LLM call per artist — this is what was blowing through base44's quota.
 */
async function classifyArtists(names) {
  const batches = chunk(names, BATCH_SIZE);
  const all = [];
  for (const batch of batches) {
    const result = await classifyBatch(batch);
    all.push(...result);
  }
  return all;
}

module.exports = { classifyArtists };
