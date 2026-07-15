#!/bin/bash
cd /Users/mandyassistant/Desktop/MarkProjects/hormozi-mentor
export ANTHROPIC_AUTH_TOKEN=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
export VOYAGE_API_KEY=pa-kZ9b6M064OFUiQ-8DO6nuvX2ccEMwqotXezafN1x7MD
export YOUTUBE_API_KEY=AIzaSyAJzgLiXCs7PKn7oRz7-GNb5mYArnRqetw
export PORT=3456
export DB_PATH=/Users/mandyassistant/Desktop/MarkProjects/hormozi-mentor/hormozi.db
exec /opt/homebrew/Cellar/node@22/22.22.0/bin/node dist/src/index.js
