#!/bin/bash
set -e

if [ ! -d "node_modules" ]; then
  echo "Installation des dépendances..."
  npm install
fi

npm run dev
