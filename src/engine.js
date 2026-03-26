import { Chess } from 'chess.js';

// ── Stockfish worker singleton ─────────────────────────────────
let worker  = null;
let ready   = false;
let readyPromise = null;

function getWorker() {
  if (worker) return { worker, ready: readyPromise };

  worker = new Worker('/stockfish.js');

  readyPromise = new Promise((resolve) => {
    worker.addEventListener('message', function onReady(e) {
      // Stockfish sends 'uciok' after receiving 'uci'
      if (typeof e.data === 'string' && e.data.includes('uciok')) {
        worker.removeEventListener('message', onReady);
        ready = true;
        resolve();
      }
    });
    worker.postMessage('uci');
  });

  return { worker, ready: readyPromise };
}

// ── Send a command and wait for 'bestmove' response ────────────
function evalPosition(sf, fen, depth = 16) {
  return new Promise((resolve) => {
    let bestScore = null;
    let bestMove  = null;

    const handler = (e) => {
      const line = typeof e.data === 'string' ? e.data : '';

      const cpMatch   = line.match(/score cp (-?\d+)/);
      const mateMatch = line.match(/score mate (-?\d+)/);
      const pvMatch   = line.match(/ pv ([a-h][1-8][a-h][1-8][qrbn]?)/);

      if (cpMatch)   bestScore = parseInt(cpMatch[1], 10);
      if (mateMatch) bestScore = parseInt(mateMatch[1], 10) > 0 ? 99999 : -99999;
      if (pvMatch)   bestMove  = pvMatch[1];

      if (line.startsWith('bestmove')) {
        sf.removeEventListener('message', handler);
        resolve({ score: bestScore ?? 0, move: bestMove });
      }
    };

    sf.addEventListener('message', handler);
    sf.postMessage(`position fen ${fen}`);
    sf.postMessage(`go depth ${depth}`);
  });
}

// ── Classify a move by centipawn loss ──────────────────────────
export function classifyMove(prevFromMoving, afterFromMoving) {
  const loss = prevFromMoving - afterFromMoving;
  if (loss < 10)  return 'best';
  if (loss < 25)  return 'excellent';
  if (loss < 50)  return 'good';
  if (loss < 100) return 'inaccuracy';
  if (loss < 200) return 'mistake';
  return 'blunder';
}

// ── Main analysis ──────────────────────────────────────────────
export async function analyzeGame(pgn, onProgress) {
  const chess = new Chess();
  chess.loadPgn(pgn);
  const history = chess.history({ verbose: true });

  // Replay from start to collect FENs after each move
  const replayChess = new Chess();
  const fens = [replayChess.fen()];
  for (const move of history) {
    replayChess.move(move);
    fens.push(replayChess.fen());
  }

  const { worker: sf, ready } = getWorker();
  await ready; // Wait for 'uciok' before sending commands
  sf.postMessage('ucinewgame');

  const evals = [];
  for (let i = 0; i < fens.length; i++) {
    onProgress?.(i, fens.length);
    const { score } = await evalPosition(sf, fens[i], 16);
    // Normalise to white's POV
    const isBlackToMove = fens[i].split(' ')[1] === 'b';
    evals.push(isBlackToMove ? -score : score);
  }
  onProgress?.(fens.length, fens.length);

  const moves = history.map((move, i) => {
    const isWhiteMove      = i % 2 === 0;
    const prevFromMoving   = isWhiteMove ?  evals[i]     : -evals[i];
    const afterFromMoving  = isWhiteMove ?  evals[i + 1] : -evals[i + 1];
    const cpLoss           = Math.max(0, prevFromMoving - afterFromMoving);

    return {
      san:            move.san,
      color:          move.color,
      prevEval:       evals[i],
      afterEval:      evals[i + 1],
      cpLoss,
      classification: classifyMove(prevFromMoving, afterFromMoving),
    };
  });

  return { moves, evals };
}
