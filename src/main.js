import { fetchPlayerProfile, fetchPlayerStats, fetchLastGames } from './api.js';
import { analyzeGame } from './engine.js';
import {
  escHtml, parsePgnHeader, formatTimeControl, translateResult,
  gameOutcome, countryFlag, titleColor, evalToPct,
  parseMoveClocks, formatClock,
} from './utils.js';
import {
  getProfiles, getProfileFromDb, saveProfile, saveGames,
  getAnalysis, saveAnalysis,
} from './db.js';

// ── State ──────────────────────────────────────────────────────
let currentUsername = '';
let gamesData = [];
let currentGameUrl = '';

// ── DOM refs ───────────────────────────────────────────────────
const input     = document.getElementById('usernameInput');
const btn       = document.getElementById('searchBtn');
const statusEl  = document.getElementById('status');
const gamesEl   = document.getElementById('games');
const overlay   = document.getElementById('overlay');
const modalBody = document.getElementById('modalContent');

input.addEventListener('keydown', e => { if (e.key === 'Enter') search(); });
document.addEventListener('keydown', e => { if (e.key === 'Escape') closeModal(); });
overlay.addEventListener('click', e => { if (e.target === overlay) closeModal(); });

// ── Search ─────────────────────────────────────────────────────
async function search() {
  const username = input.value.trim();
  if (!username) return;

  currentUsername = username.toLowerCase();
  gamesEl.innerHTML = '';
  statusEl.className = '';
  statusEl.textContent = 'Chargement…';
  btn.disabled = true;

  try {
    const [profile, stats, games] = await Promise.all([
      fetchPlayerProfile(username),
      fetchPlayerStats(username),
      fetchLastGames(username, 10),
    ]);

    gamesData = games;
    renderProfile(profile, stats);
    statusEl.textContent = `${games.length} dernières parties`;
    gamesEl.innerHTML = games.map((g, i) => renderCard(g, i)).join('');

    // Sauvegarde en DB (silencieuse)
    saveProfile(currentUsername, profile, stats).catch(() => {});
    saveGames(currentUsername, games).catch(() => {});
    loadHistory();
  } catch (err) {
    statusEl.className = 'error';
    statusEl.textContent = err.message;
  } finally {
    btn.disabled = false;
  }
}

// ── Chargement depuis le cache DB ──────────────────────────────
window.loadProfileFromDb = async function(username) {
  input.value = username;
  currentUsername = username.toLowerCase();
  gamesEl.innerHTML = '';
  statusEl.className = '';
  statusEl.textContent = 'Chargement depuis le cache…';

  try {
    const data = await getProfileFromDb(username);
    if (!data) { search(); return; }

    gamesData = data.games;
    renderProfile(data.profile, data.stats);
    const ago = timeSince(new Date(data.last_fetched_at));
    statusEl.innerHTML =
      `${data.games.length} parties · ${ago}` +
      ` <button class="refresh-btn" onclick="search()">↻ Rafraîchir</button>`;
    gamesEl.innerHTML = data.games.map((g, i) => renderCard(g, i)).join('');
  } catch (err) {
    statusEl.className = 'error';
    statusEl.textContent = err.message;
  }
};

function timeSince(date) {
  const s = Math.floor((Date.now() - date) / 1000);
  if (s < 60)   return 'il y a quelques secondes';
  if (s < 3600) return `il y a ${Math.floor(s / 60)} min`;
  if (s < 86400) return `il y a ${Math.floor(s / 3600)} h`;
  return `il y a ${Math.floor(s / 86400)} j`;
}

// ── Historique des profils ──────────────────────────────────────
async function loadHistory() {
  try {
    const profiles = await getProfiles();
    renderHistoryPanel(profiles);
  } catch (_) { /* API non disponible */ }
}

function renderHistoryPanel(profiles) {
  const panel = document.getElementById('historyPanel');
  const list  = document.getElementById('historyList');
  if (!profiles.length) { panel.style.display = 'none'; return; }

  panel.style.display = 'block';
  list.innerHTML = profiles.map(p => {
    const prof = p.profile_json;
    const date = new Date(p.last_fetched_at).toLocaleDateString('fr-FR', { day:'2-digit', month:'short' });
    const title = prof.title
      ? `<span style="color:${titleColor(prof.title)};font-size:.65rem;font-weight:700">${prof.title}</span> `
      : '';
    const avatar = prof.avatar
      ? `<img class="hp-avatar" src="${escHtml(prof.avatar)}" alt="">`
      : `<div class="hp-avatar hp-avatar-ph">♟</div>`;
    const isActive = p.username === currentUsername;
    return `
      <div class="hp-chip${isActive ? ' hp-active' : ''}" onclick="loadProfileFromDb('${escHtml(p.username)}')">
        ${avatar}
        <div class="hp-info">
          <div class="hp-name">${title}${escHtml(p.username)}</div>
          <div class="hp-date">${date}</div>
        </div>
      </div>`;
  }).join('');
}

window.search = search;

// ── Profile banner ─────────────────────────────────────────────
function renderProfile(profile, stats) {
  document.getElementById('profileBanner').innerHTML = buildProfileHtml(profile, stats);
}

function buildProfileHtml(p, s) {
  const flag    = countryFlag(p.country);
  const title   = p.title ? `<span class="player-title" style="color:${titleColor(p.title)}">${p.title}</span>` : '';
  const avatar  = p.avatar ? `<img class="avatar" src="${escHtml(p.avatar)}" alt="avatar">` : '<div class="avatar-placeholder">♟</div>';
  const status  = p.status === 'premium' ? '★ Premium' : p.status === 'staff' ? '⚙ Staff' : '';

  const ratings = [];
  if (s?.chess_bullet?.last) ratings.push({ label:'Bullet', val: s.chess_bullet.last.rating, best: s.chess_bullet.best?.rating });
  if (s?.chess_blitz?.last)  ratings.push({ label:'Blitz',  val: s.chess_blitz.last.rating,  best: s.chess_blitz.best?.rating });
  if (s?.chess_rapid?.last)  ratings.push({ label:'Rapid',  val: s.chess_rapid.last.rating,  best: s.chess_rapid.best?.rating });
  if (s?.chess_daily?.last)  ratings.push({ label:'Daily',  val: s.chess_daily.last.rating,  best: s.chess_daily.best?.rating });

  const ratingHtml = ratings.map(r =>
    `<div class="rating-chip">
      <span class="rc-label">${r.label}</span>
      <span class="rc-val">${r.val}</span>
      ${r.best ? `<span class="rc-best">↑${r.best}</span>` : ''}
    </div>`
  ).join('');

  const joined = p.joined ? new Date(p.joined * 1000).toLocaleDateString('fr-FR', { year:'numeric', month:'short' }) : '';
  const lastOnline = p.last_online ? new Date(p.last_online * 1000).toLocaleDateString('fr-FR') : '';

  return `
    <div class="profile-inner">
      <div class="profile-left">
        ${avatar}
        <div class="profile-info">
          <div class="profile-name">${title} ${escHtml(p.name || p.username)} ${flag}</div>
          <div class="profile-sub">@${escHtml(p.username)} ${status ? '· ' + status : ''}</div>
          <div class="profile-sub">${joined ? 'Inscrit ' + joined : ''} ${lastOnline ? '· Actif ' + lastOnline : ''}</div>
          <div class="profile-sub">${p.followers ? p.followers.toLocaleString() + ' abonnés' : ''}</div>
        </div>
      </div>
      <div class="profile-ratings">${ratingHtml}</div>
    </div>
  `;
}

// ── Game card ──────────────────────────────────────────────────
function renderCard(game, index) {
  const isWhite  = game.white.username.toLowerCase() === currentUsername;
  const me       = isWhite ? game.white : game.black;
  const opp      = isWhite ? game.black : game.white;
  const { label, css } = gameOutcome(me);
  const date     = new Date(game.end_time * 1000).toLocaleDateString('fr-FR');
  const timeCtl  = formatTimeControl(game.time_control, game.time_class);
  const opening  = parsePgnHeader(game.pgn, 'Opening') || '';
  const eco      = parsePgnHeader(game.pgn, 'ECO') || '';
  const myAcc    = game.accuracies ? (isWhite ? game.accuracies.white : game.accuracies.black) : null;

  return `
    <div class="game-card ${css}" onclick="openModal(${index})">
      <div class="card-dot ${isWhite ? 'white' : 'black'}"></div>
      <div class="card-body">
        <div class="card-players">
          <span class="card-me">${escHtml(me.username)}</span>
          <span class="card-ratings">${me.rating || '?'} vs ${opp.rating || '?'}</span>
        </div>
        <div class="card-meta">
          ${date} · ${escHtml(timeCtl)}
          ${eco ? '· ' + escHtml(eco) : ''}
          ${opening ? '· ' + escHtml(opening) : ''}
        </div>
      </div>
      <div class="card-right">
        <div class="card-result">${label}</div>
        ${myAcc != null ? `<div class="card-acc">${myAcc.toFixed(1)}%</div>` : ''}
      </div>
    </div>
  `;
}

// ── Modal ──────────────────────────────────────────────────────
window.openModal = function(index) {
  const game = gamesData[index];
  currentGameUrl = game.url;
  modalBody.innerHTML = buildModalHtml(game);
  overlay.classList.add('open');
  document.body.style.overflow = 'hidden';

  // Vérifie si une analyse est déjà en cache
  getAnalysis(game.url).then(cached => {
    if (!cached) return;
    const analyseBtn = document.querySelector('.analyze-btn');
    if (analyseBtn && !analyseBtn.disabled) {
      analyseBtn.innerHTML = '⚡ Charger l\'analyse (en cache)';
      analyseBtn.dataset.cached = '1';
    }
  }).catch(() => {});
};

function closeModal() {
  overlay.classList.remove('open');
  document.body.style.overflow = '';
}
window.closeModal = closeModal;

function buildModalHtml(game) {
  const isWhite   = game.white.username.toLowerCase() === currentUsername;
  const me        = isWhite ? game.white : game.black;
  const opp       = isWhite ? game.black : game.white;
  const { label, css } = gameOutcome(me);

  const opening     = parsePgnHeader(game.pgn, 'Opening')     || '—';
  const eco         = parsePgnHeader(game.pgn, 'ECO')         || '';
  const termination = parsePgnHeader(game.pgn, 'Termination') || '—';
  const timeCtl     = formatTimeControl(game.time_control, game.time_class);
  const rated       = game.rated ? 'Classée' : 'Non classée';
  const rules       = game.rules !== 'chess' ? game.rules : 'Standard';

  const endDt   = new Date(game.end_time * 1000);
  const dateStr = endDt.toLocaleDateString('fr-FR', { day:'2-digit', month:'long', year:'numeric' });
  const timeStr = endDt.toLocaleTimeString('fr-FR', { hour:'2-digit', minute:'2-digit' });

  const accWhite = game.accuracies?.white;
  const accBlack = game.accuracies?.black;
  const myAcc    = isWhite ? accWhite : accBlack;
  const oppAcc   = isWhite ? accBlack : accWhite;

  const ratingDiff = (me.rating || 0) - (opp.rating || 0);
  const diffStr    = (ratingDiff > 0 ? '+' : '') + ratingDiff;

  // Moves + clocks
  const clocks = parseMoveClocks(game.pgn);
  const movesHtml = buildMovesHtml(game.pgn, clocks);

  // Accuracy bars
  const accHtml = (accWhite != null || accBlack != null) ? `
    <div class="section-title">Précision (chess.com)</div>
    <div class="acc-row">
      ${accBar('Moi', myAcc, css)}
      ${accBar('Adversaire', oppAcc, null)}
    </div>` : '';

  return `
    <div class="modal-banner ${css}">
      ${ css==='win' ? '🏆' : css==='loss' ? '💀' : '🤝' }
      ${label} · ${translateResult(me.result)}
    </div>

    <div class="players-row">
      <div class="player is-me">
        <span class="piece">${isWhite ? '♙' : '♟'}</span>
        <div class="p-name">${escHtml(me.username)}</div>
        <div class="p-elo">${me.rating || '?'} elo</div>
        <div class="p-res res-${css}">${translateResult(me.result)}</div>
      </div>
      <div class="vs">vs</div>
      <div class="player">
        <span class="piece">${isWhite ? '♟' : '♙'}</span>
        <div class="p-name">${escHtml(opp.username)}</div>
        <div class="p-elo">${opp.rating || '?'} elo <span class="elo-diff">(${diffStr})</span></div>
        <div class="p-res res-neutral">${translateResult(opp.result)}</div>
      </div>
    </div>

    ${accHtml}

    <div class="info-grid">
      <div class="info-cell"><div class="ic-label">Ouverture</div><div class="ic-val">${eco ? eco+' · ' : ''}${escHtml(opening)}</div></div>
      <div class="info-cell"><div class="ic-label">Fin de partie</div><div class="ic-val">${escHtml(termination)}</div></div>
      <div class="info-cell"><div class="ic-label">Cadence</div><div class="ic-val">${escHtml(timeCtl)}</div></div>
      <div class="info-cell"><div class="ic-label">Statut</div><div class="ic-val">${rated}</div></div>
      <div class="info-cell"><div class="ic-label">Variante</div><div class="ic-val">${escHtml(rules)}</div></div>
      <div class="info-cell"><div class="ic-label">Date</div><div class="ic-val">${dateStr} ${timeStr}</div></div>
    </div>

    <!-- Stockfish analysis -->
    <div id="analysisSection">
      <button class="analyze-btn" onclick="startAnalysis(this)">
        ⚙ Analyser avec Stockfish
      </button>
      <div id="analysisResult" style="display:none"></div>
    </div>

    <div class="section-title" style="margin-top:18px">Coups joués</div>
    <div class="moves-list">${movesHtml}</div>

    <a class="view-link" href="${game.url}" target="_blank" rel="noopener">
      Analyser sur Chess.com ↗
    </a>
  `;
}

function accBar(label, val, css) {
  const pct  = val != null ? val.toFixed(1) : null;
  const cls  = val == null ? 'na' : val >= 85 ? 'high' : val >= 65 ? 'medium' : 'low';
  return `
    <div class="acc-block">
      <div class="ab-label">${label}</div>
      <div class="ab-val ${cls}">${pct != null ? pct + '%' : 'N/A'}</div>
      ${pct != null ? `<div class="ab-bar"><div class="ab-fill ${cls}" style="width:${pct}%"></div></div>` : ''}
    </div>`;
}

function buildMovesHtml(pgn, clocks) {
  if (!pgn) return '—';
  const body  = pgn.replace(/\[[^\]]*\]\s*/g, '').trim();
  const clean = body.replace(/\{[^}]*\}/g, '').replace(/\s+/g, ' ').trim();
  const tokens = clean.split(' ').filter(t => t && !/^(1-0|0-1|1\/2-1\/2|\*)$/.test(t));

  let html = '';
  let moveIdx = 0;
  let i = 0;
  while (i < tokens.length) {
    if (/^\d+\./.test(tokens[i])) {
      const num = tokens[i].replace('.', '');
      const w   = tokens[i + 1] || '';
      const b   = (tokens[i + 2] && !/^\d+\./.test(tokens[i + 2])) ? tokens[i + 2] : '';
      const wClock = clocks[moveIdx]     != null ? `<span class="move-clk">${formatClock(clocks[moveIdx])}</span>` : '';
      const bClock = clocks[moveIdx + 1] != null ? `<span class="move-clk">${formatClock(clocks[moveIdx + 1])}</span>` : '';
      html += `<span class="mv-num">${num}.</span> <span class="mv-w">${escHtml(w)}</span>${wClock} `;
      if (b) html += `<span class="mv-b">${escHtml(b)}</span>${bClock} `;
      moveIdx += b ? 2 : 1;
      i += b ? 3 : 2;
    } else { i++; }
  }
  return html;
}

// ── Stockfish analysis ─────────────────────────────────────────
window.startAnalysis = async function(btn) {
  btn.disabled = true;
  const resultDiv = document.getElementById('analysisResult');
  resultDiv.style.display = 'block';

  const game = gamesData.find(g => g.url === currentGameUrl) || gamesData[0];

  // Vérifie le cache DB en premier
  try {
    const cached = await getAnalysis(currentGameUrl);
    if (cached) {
      resultDiv.innerHTML = buildAnalysisHtml(cached.moves_json, cached.evals_json, game) +
        `<div class="cache-notice">⚡ Analyse chargée depuis le cache</div>`;
      btn.textContent = '✓ Analyse chargée';
      return;
    }
  } catch (_) { /* continue sans cache */ }

  btn.textContent = 'Analyse en cours…';
  resultDiv.innerHTML = `
    <div class="analysis-progress">
      <div class="prog-bar"><div class="prog-fill" id="progFill" style="width:0%"></div></div>
      <div class="prog-label" id="progLabel">Initialisation…</div>
    </div>`;

  try {
    const { moves, evals } = await analyzeGame(game.pgn, (done, total) => {
      const pct = Math.round((done / total) * 100);
      const fill  = document.getElementById('progFill');
      const label = document.getElementById('progLabel');
      if (fill)  fill.style.width  = pct + '%';
      if (label) label.textContent = `Analyse : ${done}/${total} positions`;
    });

    resultDiv.innerHTML = buildAnalysisHtml(moves, evals, game);
    btn.textContent = '✓ Analyse terminée';

    // Sauvegarde en DB (silencieuse)
    saveAnalysis(currentGameUrl, moves, evals).catch(() => {});
  } catch (err) {
    resultDiv.innerHTML = `<div class="analysis-error">Erreur : ${escHtml(err.message)}</div>`;
    btn.disabled  = false;
    btn.textContent = '⚙ Réessayer';
  }
};

const CLS_LABELS = {
  best: 'Meilleur',
  excellent: 'Excellent',
  good: 'Bon',
  inaccuracy: 'Imprécision',
  mistake: 'Erreur',
  blunder: 'Gaffe',
};

const CLS_COLORS = {
  best: '#4ade80',
  excellent: '#86efac',
  good: '#d1d5db',
  inaccuracy: '#fbbf24',
  mistake: '#f97316',
  blunder: '#f87171',
};

function buildAnalysisHtml(moves, evals, game) {
  const isWhite = game.white.username.toLowerCase() === currentUsername;

  // Per-player counts
  const counts = { white: {}, black: {} };
  for (const cls of ['best','excellent','good','inaccuracy','mistake','blunder']) {
    counts.white[cls] = 0;
    counts.black[cls] = 0;
  }
  for (const m of moves) {
    counts[m.color === 'w' ? 'white' : 'black'][m.classification]++;
  }
  const myCounts  = isWhite ? counts.white : counts.black;
  const oppCounts = isWhite ? counts.black : counts.white;

  // Eval graph SVG
  const graphSvg = buildEvalGraph(evals);

  // Summary
  const summaryHtml = `
    <div class="analysis-summary">
      <div class="as-col">
        <div class="as-title">Moi (${isWhite ? 'Blancs' : 'Noirs'})</div>
        ${summaryBadges(myCounts)}
      </div>
      <div class="as-col">
        <div class="as-title">Adversaire (${isWhite ? 'Noirs' : 'Blancs'})</div>
        ${summaryBadges(oppCounts)}
      </div>
    </div>`;

  // Move table
  const tableRows = moves.map((m, i) => {
    const isW = m.color === 'w';
    const moveNum = Math.floor(i / 2) + 1;
    const clsColor = CLS_COLORS[m.classification];
    const evalStr = m.afterEval > 0
      ? `+${(m.afterEval / 100).toFixed(2)}`
      : (m.afterEval / 100).toFixed(2);
    return `
      <tr class="mt-row">
        ${isW ? `<td class="mt-num">${moveNum}</td>` : '<td></td>'}
        <td class="mt-san ${isW ? 'mt-white' : 'mt-black'}">${escHtml(m.san)}</td>
        <td><span class="mt-cls" style="color:${clsColor}">${CLS_LABELS[m.classification]}</span></td>
        <td class="mt-loss">${m.cpLoss > 0 ? '-' + m.cpLoss + ' cp' : ''}</td>
        <td class="mt-eval">${evalStr}</td>
      </tr>`;
  }).join('');

  return `
    <div class="section-title" style="margin-top:0">Graphique d'évaluation</div>
    ${graphSvg}
    ${summaryHtml}
    <div class="section-title" style="margin-top:18px">Analyse coup par coup</div>
    <div class="move-table-wrap">
      <table class="move-table">
        <thead><tr><th>#</th><th>Coup</th><th>Qualité</th><th>Perte</th><th>Éval</th></tr></thead>
        <tbody>${tableRows}</tbody>
      </table>
    </div>`;
}

function summaryBadges(counts) {
  return ['blunder','mistake','inaccuracy','good','excellent','best'].map(cls => {
    const n = counts[cls];
    if (!n) return '';
    return `<span class="s-badge" style="background:${CLS_COLORS[cls]}20;color:${CLS_COLORS[cls]};border-color:${CLS_COLORS[cls]}40">
      ${n} ${CLS_LABELS[cls]}${n > 1 ? 's' : ''}
    </span>`;
  }).join('');
}

function buildEvalGraph(evals) {
  const W = 560, H = 100;
  const n = evals.length;
  if (n < 2) return '';

  const points = evals.map((e, i) => {
    const x = (i / (n - 1)) * W;
    const y = (evalToPct(e) / 100) * H;
    return `${x},${y}`;
  }).join(' ');

  // Fill above midline = white advantage; below = black
  const midY = H / 2;
  const pathWhite = `M 0,${midY} ` + evals.map((e, i) => {
    const x = (i / (n - 1)) * W;
    const y = (evalToPct(e) / 100) * H;
    return `L ${x},${y}`;
  }).join(' ') + ` L ${W},${midY} Z`;

  return `
    <svg class="eval-graph" viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg">
      <rect width="${W}" height="${H}" fill="#111827" rx="6"/>
      <rect x="0" y="${midY}" width="${W}" height="${midY}" fill="#1f2937"/>
      <path d="${pathWhite}" fill="rgba(255,255,255,0.15)"/>
      <polyline points="${points}" fill="none" stroke="#f0c040" stroke-width="1.5"/>
      <line x1="0" y1="${midY}" x2="${W}" y2="${midY}" stroke="#374151" stroke-width="1"/>
      <text x="4" y="12" fill="#9ca3af" font-size="9" font-family="sans-serif">Blancs</text>
      <text x="4" y="${H - 4}" fill="#9ca3af" font-size="9" font-family="sans-serif">Noirs</text>
    </svg>`;
}

// ── Init ────────────────────────────────────────────────────────
loadHistory();
