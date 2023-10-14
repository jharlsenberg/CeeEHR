#!/bin/bash

# Ensure the script stops if any command fails
set -e

echo "-----> Starting docker-compose with build..."
docker-compose up -d --build
echo "-----> docker-compose started successfully."

echo "-----> Navigating to packages/server and running npm..."
cd packages/server
npm run dev &
echo "-----> npm run dev in packages/server completed."

echo "-----> Navigating to packages/app and running npm..."
cd ../app
npm run dev &
echo "-----> npm run dev in packages/app completed."

echo "-----> All tasks completed successfully."
