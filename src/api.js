const BASE = 'https://api.chess.com/pub';

export async function fetchPlayerProfile(username) {
  const res = await fetch(`${BASE}/player/${username}`);
  if (!res.ok) throw new Error('Joueur introuvable');
  return res.json();
}

export async function fetchPlayerStats(username) {
  const res = await fetch(`${BASE}/player/${username}/stats`);
  if (!res.ok) return null;
  return res.json();
}

export async function fetchLastGames(username, count = 10) {
  const archivesRes = await fetch(`${BASE}/player/${username}/games/archives`);
  if (!archivesRes.ok) throw new Error('Joueur introuvable');
  const { archives } = await archivesRes.json();
  if (!archives?.length) throw new Error('Aucune partie trouvée');

  let games = [];
  for (let i = archives.length - 1; i >= 0 && games.length < count; i--) {
    const res = await fetch(archives[i]);
    if (!res.ok) continue;
    const data = await res.json();
    games = [...(data.games || []), ...games];
  }
  return games.slice(-count).reverse();
}
