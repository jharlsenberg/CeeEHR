#!/bin/bash

echo "-----> Killing npm run dev processes..."

# Kill npm processes related to 'server'
pkill -f "npm run dev.*packages/server"

# Give some delay to ensure npm processes are fully terminated
sleep 1

# Kill npm processes related to 'app'
pkill -f "npm run dev.*packages/app"

# Give some delay to ensure npm processes are fully terminated
sleep 1

echo "-----> Stopping docker-compose..."
docker-compose down

echo "-----> All processes have been shut down."
