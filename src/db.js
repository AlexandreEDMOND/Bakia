// Client frontend pour l'API backend Bakia

const API = '/api';

export async function getProfiles() {
  const res = await fetch(`${API}/profiles`);
  if (!res.ok) throw new Error('API indisponible');
  return res.json();
}

export async function getProfileFromDb(username) {
  const res = await fetch(`${API}/profiles/${encodeURIComponent(username.toLowerCase())}`);
  if (res.status === 404) return null;
  if (!res.ok) throw new Error('Erreur serveur');
  return res.json();
}

export async function saveProfile(username, profile, stats) {
  await fetch(`${API}/profiles`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, profile, stats }),
  });
}

export async function saveGames(username, games) {
  await fetch(`${API}/games`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, games }),
  });
}

export async function getAnalysis(gameUrl) {
  const res = await fetch(`${API}/analysis?url=${encodeURIComponent(gameUrl)}`);
  if (res.status === 404) return null;
  if (!res.ok) return null;
  return res.json();
}

export async function saveAnalysis(gameUrl, moves, evals) {
  await fetch(`${API}/analysis`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ url: gameUrl, moves, evals }),
  });
}
