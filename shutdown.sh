#!/bin/bash

echo "-----> Killing Node.js processes related to Cee app..."

# Find and kill Node.js processes related to your app
pids=$(pgrep -f "ts-node-dev --poll --respawn --transpile-only src/index.ts")

if [ -n "$pids" ]; then
  for pid in $pids; do
    echo "Killing process $pid..."
    kill $pid
  done
else
  echo "No Node.js processes related to Cee app found."
fi

# Find and kill the Vite server process
vite_pid=$(pgrep -f "node /Users/josh/Projects/CEE/CeeEHR/node_modules/.bin/vite")

if [ -n "$vite_pid" ]; then
  echo "Killing Vite server process $vite_pid..."
  kill $vite_pid
else
  echo "No Vite server process found."
fi

echo "-----> Stopping docker-compose..."
docker-compose down

echo "-----> All processes have been shut down."
