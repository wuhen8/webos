#!/bin/bash
set -e
echo "Building telegram-ai-bot wasm (reactor mode)..."
GOOS=wasip1 GOARCH=wasm go build -buildmode=c-shared -o bot.wasm .
echo "Packaging..."
zip -j telegram-ai-bot.zip bot.wasm manifest.json
echo "Done: telegram-ai-bot.zip ($(du -h telegram-ai-bot.zip | cut -f1))"
