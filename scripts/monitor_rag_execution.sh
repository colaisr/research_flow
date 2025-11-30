#!/bin/bash
# Script to monitor RAG tool execution in real-time

echo "Monitoring RAG Tool executions..."
echo "Waiting for next execution... (Press Ctrl+C to stop)"
echo ""

# Monitor backend.log in real-time for RAG Tool entries
tail -f backend.log 2>/dev/null | grep --line-buffered -E "\[RAG Tool\]" | while read line; do
    echo "[$(date '+%H:%M:%S')] $line"
done

