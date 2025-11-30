#!/usr/bin/env python3
"""Script to check RAG results and sheet expansion."""
import sys
import os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', 'backend'))

from app.services.rag.vector_db import VectorDB
from app.core.config import STORAGE_BASE_PATH
from pathlib import Path

# Check which RAG ID to inspect
rag_id = 9  # Change if needed

print(f"Checking RAG {rag_id}...")
vector_db = VectorDB()

# Get all chunks from the "Кросс продажи" sheet
try:
    all_chunks = vector_db.get_chunks_by_sheet(rag_id, "Кросс продажи")
    print(f"\nTotal chunks in sheet 'Кросс продажи': {len(all_chunks)}")
    
    # Count chunks per document
    by_doc = {}
    for chunk in all_chunks:
        doc_id = chunk['metadata'].get('document_id', 'unknown')
        doc_title = chunk['metadata'].get('title', 'Unknown')
        key = f"{doc_title} (doc_id={doc_id})"
        by_doc[key] = by_doc.get(key, 0) + 1
    
    print(f"\nChunks by document:")
    for doc, count in by_doc.items():
        print(f"  {doc}: {count} chunks")
    
    # Show preview of first chunk
    if all_chunks:
        print(f"\nFirst chunk preview (first 300 chars):")
        print(all_chunks[0]['document'][:300])
        
except Exception as e:
    print(f"Error: {e}")
    import traceback
    traceback.print_exc()

