#!/bin/bash
# Corre este script no Shell do Replit para fazer push para GitHub
set -e

if [ -z "$GITHUB_TOKEN" ]; then
  echo "Erro: GITHUB_TOKEN não está definido."
  exit 1
fi

REMOTE="https://${GITHUB_TOKEN}@github.com/IASantos1/Bet62Novo"

echo "A fazer pull (merge) do remote..."
git pull --no-rebase "$REMOTE" main || true

echo "A fazer push para GitHub..."
git push "$REMOTE" HEAD:main

echo "Push concluído!"
