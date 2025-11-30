#!/bin/bash
# Script to check RAG tool execution logs

echo "=== Recent RAG Tool Logs ==="
echo ""
tail -500 backend.log 2>/dev/null | grep -E "\[RAG Tool\]" | tail -50

echo ""
echo "=== Recent Step Tool Execution Logs ==="
echo ""
tail -500 backend.log 2>/dev/null | grep -E "\[Step Tool Execution\]" | tail -30

echo ""
echo "=== All RAG-related logs (full context) ==="
echo ""
tail -1000 backend.log 2>/dev/null | grep -E "(RAG|rag)" -i | tail -100

