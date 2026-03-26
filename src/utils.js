export function escHtml(str) {
  if (!str) return '';
  return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}

export function parsePgnHeader(pgn, key) {
  if (!pgn) return null;
  const m = pgn.match(new RegExp(`\\[${key}\\s+"([^"]+)"\\]`));
  return m ? m[1] : null;
}

export function formatTimeControl(tc, cls) {
  if (!tc) return cls || '?';
  if (tc === '-') return 'Quotidien';
  const [base, inc] = tc.split('+').map(Number);
  const mins = Math.floor(base / 60);
  const secs = base % 60;
  let str = mins > 0 ? `${mins} min` : `${secs} sec`;
  if (inc) str += ` +${inc}s`;
  return str;
}

export function translateResult(result) {
  const map = {
    win: 'Victoire', checkmated: 'Mat', resigned: 'Abandon',
    timeout: 'Temps écoulé', stalemate: 'Pat',
    insufficient: 'Mat impossible', '50move': 'Règle des 50 coups',
    repetition: 'Répétition', agreed: 'Accord mutuel',
    timevsinsufficient: 'Temps vs mat impossible',
    abandoned: 'Abandon', lose: 'Défaite',
  };
  return map[result] || result;
}

export function gameOutcome(me) {
  const r = me.result;
  if (r === 'win') return { label: 'Victoire', css: 'win' };
  if (['checkmated','resigned','timeout','abandoned','lose'].includes(r))
    return { label: 'Défaite', css: 'loss' };
  return { label: 'Nulle', css: 'draw' };
}

// Country code → flag emoji
export function countryFlag(countryUrl) {
  if (!countryUrl) return '';
  const code = countryUrl.split('/').pop().toUpperCase();
  if (code.length !== 2) return '';
  return [...code].map(c => String.fromCodePoint(0x1F1E0 + c.charCodeAt(0) - 65)).join('');
}

// Title badge colour
export function titleColor(title) {
  const map = { GM:'#f0c040', IM:'#f0c040', FM:'#f0c040', WGM:'#f9a8d4', WIM:'#f9a8d4', CM:'#d1d5db', WFM:'#f9a8d4' };
  return map[title] || '#9ca3af';
}

// Clamp eval to ±1000 for display
export function evalToPct(cp) {
  const clamped = Math.max(-600, Math.min(600, cp));
  return 50 - (clamped / 600) * 50; // 0 = white winning, 100 = black winning
}

export function parseMoveClocks(pgn) {
  if (!pgn) return [];
  const clocks = [];
  const re = /\{.*?\[%clk (\d+):(\d+):(\d+)\].*?\}/g;
  let m;
  while ((m = re.exec(pgn)) !== null) {
    const secs = parseInt(m[1]) * 3600 + parseInt(m[2]) * 60 + parseInt(m[3]);
    clocks.push(secs);
  }
  return clocks;
}

export function formatClock(secs) {
  if (secs === undefined) return '';
  const m = Math.floor(secs / 60);
  const s = secs % 60;
  return `${m}:${String(s).padStart(2,'0')}`;
}
