# RAG Excel Sheet Expansion Feature

## Overview

When querying Excel files in RAG, the system now automatically expands results to include **ALL chunks from matching sheets**, ensuring complete data without truncation.

## How It Works

1. **Initial Search**: Performs semantic search and gets top matching chunks
2. **Excel Detection**: Detects if results come from Excel files (checks for `sheet_name` in metadata)
3. **Sheet Identification**: Identifies which sheets matched the query
4. **Sheet Expansion**: Fetches ALL chunks from each matching sheet (not just the top matches)
5. **Result Combination**: Merges original results with expanded chunks (deduplicates)

## What Changed

### Code Changes
- **`backend/app/services/rag/vector_db.py`**: Added `get_chunks_by_sheet()` method to fetch all chunks from a specific sheet
- **`backend/app/services/tools/executor.py`**: Added sheet expansion logic after initial search results

### Default Improvements
- Increased default `top_k` from 10 to 50 for RAG tool queries
- Automatic increase to 100 for list/count queries (detects keywords like "список", "list", "сколько", etc.)

## Checking Results

### View Logs After Execution

After running a test step with a RAG tool, check the backend logs:

```bash
# View recent RAG Tool logs
tail -500 backend.log | grep "\[RAG Tool\]"

# Or monitor in real-time
./scripts/monitor_rag_execution.sh
```

### Key Log Messages to Look For

1. **Sheet Detection**:
   ```
   [RAG Tool] Detected Excel file with 1 matching sheet(s): {'Кросс продажи'}
   [RAG Tool] Expanding to include ALL chunks from matching sheets
   ```

2. **Sheet Expansion**:
   ```
   [RAG Tool] Retrieved 15 total chunks from sheet 'Кросс продажи'
   [RAG Tool] Added 5 new chunks from sheet 'Кросс продажи' (already had 10)
   ```

3. **Final Results**:
   ```
   [RAG Tool] After sheet expansion: 15 total chunks (was 10 before)
   [RAG Tool] Results breakdown by document: {'ОП ЮГ-3.xlsx (Лист: Кросс продажи)': 15}
   ```

### Expected Results

For your Excel file with 38 grade 9 students:
- **Before**: Only 10 students returned (limited by top_k)
- **After**: All 38 students returned (complete sheet data)

## Testing

1. **Restart Backend** (if you haven't already):
   ```bash
   # If running manually
   # Stop and restart uvicorn
   
   # If using systemd
   sudo systemctl restart research-flow-backend
   ```

2. **Run Test Step**:
   - Open your pipeline editor
   - Run the test step that uses the RAG tool
   - Query: "верни список клиентов учеников 9го класса"

3. **Check Results**:
   - Should see all 38 grade 9 students (not just 10)
   - Check backend logs for expansion messages

## Benefits

✅ **Complete Data**: Gets all rows from matching sheets, not just top chunks  
✅ **No Truncation**: Avoids missing students or data points  
✅ **Targeted**: Only expands Excel sheets, not other document types  
✅ **Efficient**: Only fetches relevant sheets, not entire database  
✅ **Smart**: Automatically detects when expansion is needed

## Technical Details

- Sheet expansion only happens for Excel files (detected by `sheet_name` metadata)
- Regular documents (PDF, TXT, etc.) use standard chunking
- Chunks are deduplicated by ID to avoid duplicates
- Original search distances are preserved for expanded chunks

