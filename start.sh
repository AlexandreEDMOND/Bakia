#!/bin/bash
set -e

if [ ! -d "node_modules" ]; then
  echo "Installation des dépendances..."
  npm install
fi

if [ ! -f ".env" ]; then
  echo "⚠️  Fichier .env manquant. Création depuis .env.example..."
  cp .env.example .env
  echo "→ Édite .env avec tes paramètres PostgreSQL, puis relance start.sh"
  exit 1
fi

echo "Démarrage du serveur API (port 3001)..."
node server.js &
API_PID=$!
trap "kill $API_PID 2>/dev/null; exit" SIGINT SIGTERM EXIT

sleep 1

echo "Démarrage de Vite..."
npm run dev
