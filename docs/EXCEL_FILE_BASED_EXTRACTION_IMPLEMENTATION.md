# Excel File-Based Extraction Implementation

## Overview

This document describes the implementation of **Option 2: RAG for Discovery, File Access for Extraction** to solve the Excel data retrieval reliability problem.

## Problem Solved

Previously, when querying Excel files in RAG, the system would:
1. Use semantic search to find relevant chunks
2. Expand to get all chunks from matching sheets
3. Send text chunks to LLM for extraction

This approach had reliability issues:
- LLM struggled to extract all data from large text contexts (e.g., only 15-19 out of 38 students)
- Chunk-based approach lost structural integrity
- Extraction was inconsistent

## Solution

**New Approach**: Use RAG to find which Excel file/sheet is relevant, then load the actual Excel file and extract structured data.

### Architecture

```
User Query
    ↓
RAG Semantic Search (finds relevant chunks)
    ↓
Detect Excel Files (sheet_name in metadata)
    ↓
Identify Primary Sheet (most relevant)
    ↓
Load Actual Excel File (from storage)
    ↓
Extract Structured Data (pandas → JSON)
    ↓
Format for LLM (clean JSON structure)
    ↓
LLM Extraction (reliable, complete data)
```

## Implementation Details

### 1. Excel Loader Utility (`backend/app/services/rag/excel_loader.py`)

New module that provides:

- **`ExcelLoader.load_sheet_as_structured_data()`**: Loads a specific sheet from an Excel file and converts it to structured JSON format
  - Handles file existence checks
  - Handles missing sheets
  - Handles empty sheets
  - Converts pandas DataFrame to JSON-serializable records
  - Handles data type conversions (dates, numbers, etc.)

- **`ExcelLoader.format_structured_data_for_llm()`**: Formats structured data for LLM consumption
  - Includes metadata (file name, sheet name, column names, row count)
  - Formats as clean JSON with proper Unicode support
  - Includes clear headers and structure

### 2. RAG Tool Executor Updates (`backend/app/services/tools/executor.py`)

Modified `execute_rag_tool()` method:

**Before**: 
- Detected Excel chunks
- Expanded to get all chunks from sheet
- Sent text chunks to LLM

**After**:
1. **Detect Excel files** from search results (checks for `sheet_name` in metadata)
2. **Identify primary sheet** (sheet with most matching chunks)
3. **Load Excel file** from storage using `RAGStorage.get_absolute_path()`
4. **Extract structured data** using `ExcelLoader.load_sheet_as_structured_data()`
5. **Replace chunks with structured data** (single structured result instead of multiple chunks)
6. **Fallback to chunks** if file loading fails (backward compatible)

### 3. Result Formatting Updates

Updated `_format_tool_result()` to recognize structured Excel data:

- Detects `data_type: "excel_structured"` in metadata
- Includes structured data without truncation
- Formats with clear headers and metadata
- Logs row counts and column information

## File Changes

### New Files

- `backend/app/services/rag/excel_loader.py`: Excel file loading utility

### Modified Files

- `backend/app/services/tools/executor.py`: 
  - Added imports: `RAGStorage`, `ExcelLoader`, `RAGDocument`
  - Modified `execute_rag_tool()`: Added Excel file loading logic
  - Modified `_format_tool_result()`: Handle structured Excel data

- `backend/app/services/rag/__init__.py`: 
  - Added `ExcelLoader` export

## Edge Cases Handled

1. **Missing file**: Checks file existence, falls back to chunks
2. **Missing sheet**: Handles ValueError from pandas, falls back to chunks
3. **Empty sheet**: Returns empty data structure, logs warning
4. **Corrupted file**: Catches exceptions, falls back to chunks
5. **Large files**: Limits to 10,000 rows by default (configurable)
6. **Missing file_path**: Checks if document has file_path, falls back to chunks
7. **Database errors**: Catches query errors, falls back to chunks

## Benefits

✅ **Reliable Extraction**: LLM gets complete, structured data instead of fragmented chunks
✅ **Complete Data**: Entire sheet available, not limited by chunk boundaries
✅ **Backward Compatible**: Falls back to chunk-based approach if file loading fails
✅ **General-Purpose**: Works for any Excel query, not just specific use cases
✅ **Better Performance**: Single structured result instead of multiple chunks to process
✅ **Clear Logging**: Comprehensive logging for debugging

## Configuration

- **Max rows limit**: Default 10,000 rows (configurable in `ExcelLoader.load_sheet_as_structured_data()`)
- **Fallback behavior**: Automatic fallback to chunk-based approach if file loading fails

## Example Flow

### Before (Chunk-based):
```
Query: "список учеников 9 класса"
→ RAG finds 10 chunks from "Кросс продажи" sheet
→ Expand to 15 chunks
→ Send 15 text chunks to LLM (~90K chars)
→ LLM extracts 15-19 students (incomplete)
```

### After (File-based):
```
Query: "список учеников 9 класса"
→ RAG finds chunks from "Кросс продажи" sheet
→ Detect Excel file: doc_id=123, sheet="Кросс продажи"
→ Load Excel file: storage/rag_documents/rag_10/doc_123_file.xlsx
→ Extract sheet as structured JSON (38 rows)
→ Format as clean JSON with metadata
→ Send to LLM (~15K chars, structured)
→ LLM extracts all 38 students (complete, reliable)
```

## Testing

To test the implementation:

1. **Upload Excel file** to RAG with a sheet containing student data
2. **Run pipeline** with RAG tool query: "список учеников 9 класса"
3. **Check logs** for:
   - `[RAG Tool] Detected Excel file with N matching sheet(s)`
   - `[RAG Tool] Loading actual Excel file for structured data extraction`
   - `[RAG Tool] Successfully loaded Excel sheet: N rows, M columns`
   - `[RAG Tool] Using structured Excel data instead of chunks`
4. **Verify results**: All students should be extracted reliably

## Future Enhancements

Potential improvements:

1. **Multi-sheet support**: Load multiple sheets if query matches multiple sheets
2. **CSV support**: Extend to CSV files using similar approach
3. **Caching**: Cache structured data for frequently accessed sheets
4. **Pagination**: For very large sheets (>10K rows), implement pagination
5. **SQLite integration**: Option 3 from analysis - use SQLite for complex queries

## Related Documents

- `docs/EXCEL_RETRIEVAL_PROBLEM_ANALYSIS.md`: Detailed problem analysis and solution discussion
- `docs/RAG_SHEET_EXPANSION.md`: Previous chunk-based approach (now used as fallback)

