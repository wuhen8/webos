#!/bin/bash
set -e
echo "Building feishu-ai-bot wasm (reactor mode)..."
GOOS=wasip1 GOARCH=wasm go build -buildmode=c-shared -o bot.wasm .
echo "Packaging..."
zip -j feishu-ai-bot.zip bot.wasm manifest.json
echo "Done: feishu-ai-bot.zip ($(du -h feishu-ai-bot.zip | cut -f1))"
