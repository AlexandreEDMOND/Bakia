import { Chess } from 'chess.js';

// ── Stockfish worker ──────────────────────────────────────────
let worker = null;

function getWorker() {
  if (!worker) worker = new Worker('/stockfish.js');
  return worker;
}

function sendCmd(sf, cmd) {
  sf.postMessage(cmd);
}

function evalPosition(sf, fen, depth = 16) {
  return new Promise((resolve) => {
    let bestScore = null;
    let bestMove  = null;

    const handler = (e) => {
      const line = e.data;

      // Parse score
      const cpMatch   = line.match(/score cp (-?\d+)/);
      const mateMatch = line.match(/score mate (-?\d+)/);
      const pvMatch   = line.match(/ pv ([a-h][1-8][a-h][1-8][qrbn]?)/);

      if (cpMatch)   bestScore = parseInt(cpMatch[1], 10);
      if (mateMatch) bestScore = parseInt(mateMatch[1], 10) > 0 ? 99999 : -99999;
      if (pvMatch)   bestMove  = pvMatch[1];

      if (line.startsWith(`bestmove`)) {
        sf.removeEventListener('message', handler);
        resolve({ score: bestScore, move: bestMove });
      }
    };

    sf.addEventListener('message', handler);
    sendCmd(sf, `position fen ${fen}`);
    sendCmd(sf, `go depth ${depth}`);
  });
}

// ── Classify a move based on centipawn loss ───────────────────
// score = eval after move (from perspective of side that just moved, negated)
// prev  = eval before move
export function classifyMove(prevScore, afterScore) {
  // Both scores in white's POV (positive = white better)
  const loss = prevScore - afterScore; // positive means the moving side lost something

  if (loss < 10)  return 'best';
  if (loss < 25)  return 'excellent';
  if (loss < 50)  return 'good';
  if (loss < 100) return 'inaccuracy';
  if (loss < 200) return 'mistake';
  return 'blunder';
}

// ── Main analysis function ────────────────────────────────────
export async function analyzeGame(pgn, onProgress) {
  const chess = new Chess();
  chess.loadPgn(pgn);
  const history = chess.history({ verbose: true });

  // Replay from start to collect FENs
  const replayChess = new Chess();
  const fens = [replayChess.fen()]; // starting position
  for (const move of history) {
    replayChess.move(move);
    fens.push(replayChess.fen());
  }

  const sf = getWorker();
  sendCmd(sf, 'uci');
  sendCmd(sf, 'ucinewgame');

  const evals = []; // centipawn scores (from white's perspective)
  for (let i = 0; i < fens.length; i++) {
    onProgress?.(i, fens.length);
    const { score } = await evalPosition(sf, fens[i], 16);
    // Normalise: always from white's POV
    const isBlackToMove = fens[i].split(' ')[1] === 'b';
    const whitePov = isBlackToMove ? -(score ?? 0) : (score ?? 0);
    evals.push(whitePov);
  }

  // Build per-move analysis
  const moves = history.map((move, i) => {
    const prevEval = evals[i];
    const afterEval = evals[i + 1];
    const isWhiteMove = i % 2 === 0;

    // Loss from the perspective of the player who just moved
    const prevFromMoving = isWhiteMove ?  prevEval : -prevEval;
    const afterFromMoving = isWhiteMove ? afterEval : -afterEval;
    const cpLoss = prevFromMoving - afterFromMoving;

    return {
      san: move.san,
      from: move.from,
      to: move.to,
      color: move.color, // 'w' | 'b'
      prevEval,
      afterEval,
      cpLoss: Math.max(0, cpLoss),
      classification: classifyMove(prevFromMoving, afterFromMoving),
    };
  });

  onProgress?.(fens.length, fens.length);
  return { moves, evals };
}
