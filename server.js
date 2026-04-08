import express from 'express';
import pg from 'pg';
import cors from 'cors';
import dotenv from 'dotenv';

dotenv.config();

const app = express();
app.use(cors());
app.use(express.json({ limit: '20mb' }));

const pool = new pg.Pool({
  host:     process.env.DB_HOST     || 'localhost',
  port:     parseInt(process.env.DB_PORT || '5432'),
  database: process.env.DB_NAME     || 'bakia',
  user:     process.env.DB_USER     || 'postgres',
  password: process.env.DB_PASSWORD || '',
});

async function initDb() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS profiles (
      username        TEXT PRIMARY KEY,
      profile_json    JSONB NOT NULL,
      stats_json      JSONB,
      last_fetched_at TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS games (
      game_url   TEXT PRIMARY KEY,
      username   TEXT NOT NULL,
      game_json  JSONB NOT NULL,
      fetched_at TIMESTAMPTZ DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS games_username_idx ON games (username);

    CREATE TABLE IF NOT EXISTS analysis (
      game_url    TEXT PRIMARY KEY,
      moves_json  JSONB NOT NULL,
      evals_json  JSONB NOT NULL,
      analyzed_at TIMESTAMPTZ DEFAULT NOW()
    );
  `);
  console.log('Tables DB prêtes');
}

// ── GET /api/profiles ────────────────────────────────────────────
app.get('/api/profiles', async (_req, res) => {
  try {
    const result = await pool.query(
      'SELECT username, profile_json, stats_json, last_fetched_at FROM profiles ORDER BY last_fetched_at DESC'
    );
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── GET /api/profiles/:username ──────────────────────────────────
app.get('/api/profiles/:username', async (req, res) => {
  try {
    const uname = req.params.username.toLowerCase();
    const pRow = await pool.query(
      'SELECT profile_json, stats_json, last_fetched_at FROM profiles WHERE username = $1',
      [uname]
    );
    if (!pRow.rows.length) return res.status(404).json({ error: 'Profil non trouvé' });

    const gRows = await pool.query(
      `SELECT game_json FROM games WHERE username = $1
       ORDER BY (game_json->>'end_time')::bigint DESC LIMIT 30`,
      [uname]
    );

    res.json({
      profile:        pRow.rows[0].profile_json,
      stats:          pRow.rows[0].stats_json,
      games:          gRows.rows.map(r => r.game_json),
      last_fetched_at: pRow.rows[0].last_fetched_at,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── POST /api/profiles ────────────────────────────────────────────
app.post('/api/profiles', async (req, res) => {
  try {
    const { username, profile, stats } = req.body;
    await pool.query(
      `INSERT INTO profiles (username, profile_json, stats_json, last_fetched_at)
       VALUES ($1, $2, $3, NOW())
       ON CONFLICT (username) DO UPDATE SET
         profile_json = $2, stats_json = $3, last_fetched_at = NOW()`,
      [username.toLowerCase(), profile, stats]
    );
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── POST /api/games ───────────────────────────────────────────────
app.post('/api/games', async (req, res) => {
  try {
    const { username, games } = req.body;
    for (const game of games) {
      await pool.query(
        `INSERT INTO games (game_url, username, game_json, fetched_at)
         VALUES ($1, $2, $3, NOW())
         ON CONFLICT (game_url) DO UPDATE SET game_json = $3, fetched_at = NOW()`,
        [game.url, username.toLowerCase(), game]
      );
    }
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── GET /api/analysis?url=... ─────────────────────────────────────
app.get('/api/analysis', async (req, res) => {
  try {
    const { url } = req.query;
    if (!url) return res.status(400).json({ error: 'url manquante' });
    const result = await pool.query(
      'SELECT moves_json, evals_json, analyzed_at FROM analysis WHERE game_url = $1',
      [url]
    );
    if (!result.rows.length) return res.status(404).json({ error: 'Non trouvé' });
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── POST /api/analysis ────────────────────────────────────────────
app.post('/api/analysis', async (req, res) => {
  try {
    const { url, moves, evals } = req.body;
    await pool.query(
      `INSERT INTO analysis (game_url, moves_json, evals_json, analyzed_at)
       VALUES ($1, $2, $3, NOW())
       ON CONFLICT (game_url) DO UPDATE SET
         moves_json = $2, evals_json = $3, analyzed_at = NOW()`,
      [url, moves, evals]
    );
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

const PORT = process.env.PORT || 3001;
initDb()
  .then(() => app.listen(PORT, () => console.log(`Serveur API sur le port ${PORT}`)))
  .catch(err => { console.error('Échec init DB :', err.message); process.exit(1); });
