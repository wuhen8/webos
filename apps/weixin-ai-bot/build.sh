#!/bin/bash
set -e
echo "Building weixin-ai-bot wasm (long-poll mode)..."
GOOS=wasip1 GOARCH=wasm go build -buildmode=c-shared -o bot.wasm .
echo "Packaging..."
zip -j weixin-ai-bot.zip bot.wasm manifest.json
echo "Done: weixin-ai-bot.zip ($(du -h weixin-ai-bot.zip | cut -f1))"
