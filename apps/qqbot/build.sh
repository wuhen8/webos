#!/bin/bash
set -e
echo "Building qq-ai-bot wasm (reactor mode)..."
GOOS=wasip1 GOARCH=wasm go build -buildmode=c-shared -o bot.wasm .
echo "Packaging..."
zip -j qq-ai-bot.zip bot.wasm manifest.json
echo "Done: qq-ai-bot.zip ($(du -h qq-ai-bot.zip | cut -f1))"
