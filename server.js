// server.js
const express = require('express');
const bodyParser = require('body-parser');
const fs = require('fs');
const cors = require('cors');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;
const DATA_DIR = path.join(__dirname, 'data');
const STATE_FILE = path.join(DATA_DIR, 'state.json');

app.use(cors());
app.use(bodyParser.json({ limit: '2mb' }));
app.use(express.static(path.join(__dirname, 'public')));

// util: read/write state
function ensureDataDir() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR);
}
function readState() {
  try {
    ensureDataDir();
    if (!fs.existsSync(STATE_FILE)) {
      // seed example state
      const seed = {
        meta: { title: "Mon Kanban", updatedAt: new Date().toISOString() },
        boards: [
          {
            id: 'board-1',
            title: 'Projet principal',
            columns: [
              { id: 'col-todo', title: 'À faire', tasks: [
                  { id: 't-1', title: 'Créer layout', description: 'Faire la page d\'accueil', labels: ['frontend'], dueDate: null, checklist: [], comments: [], archived: false },
                ] },
              { id: 'col-doing', title: 'En cours', tasks: [] },
              { id: 'col-done', title: 'Fait', tasks: [] }
            ]
          }
        ],
        ui: { openBoardId: 'board-1' }
      };
      fs.writeFileSync(STATE_FILE, JSON.stringify(seed, null, 2));
      return seed;
    }
    const raw = fs.readFileSync(STATE_FILE, 'utf-8');
    return JSON.parse(raw || '{}');
  } catch (err) {
    console.error('readState error', err);
    return { boards: [], ui: {} };
  }
}
function writeState(state) {
  try {
    ensureDataDir();
    state.meta = state.meta || {};
    state.meta.updatedAt = new Date().toISOString();
    fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2));
    return true;
  } catch (err) {
    console.error('writeState error', err);
    return false;
  }
}

// API: get whole state
app.get('/api/state', (req, res) => {
  const s = readState();
  res.json(s);
});

// API: save whole state (overwrite)
app.post('/api/state', (req, res) => {
  const state = req.body;
  if (!state || typeof state !== 'object') return res.status(400).json({ error: 'Invalid state' });
  const ok = writeState(state);
  if (!ok) return res.status(500).json({ error: 'Save failed' });
  res.json({ success: true, savedAt: new Date().toISOString() });
});

// small endpoint: health
app.get('/api/health', (req, res) => res.json({ ok: true, now: new Date().toISOString() }));

app.listen(PORT, () => console.log(`✅ Kanban server listening on :${PORT}`));
