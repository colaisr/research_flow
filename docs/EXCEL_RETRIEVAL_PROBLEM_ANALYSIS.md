# Excel Data Retrieval Problem Analysis & Solution Discussion

## Problem Summary

### The Core Issue
When querying Excel files stored in RAG, the system is **unable to reliably extract complete structured data** (e.g., all 38 students from a 9th-grade list). Despite retrieving all relevant chunks from the matching sheet, the LLM fails to extract all entries from the large context.

### Timeline of Issues Encountered
1. **Initial**: RAG returned "No results found" → Fixed with improved query extraction
2. **First truncation**: Only 10 students returned → Fixed by increasing `top_k` from 10 to 50-100
3. **Chunk limitation**: Still incomplete results (15-33 students) → Fixed with sheet-level expansion
4. **Context overflow**: Exceeded 128K token limit when expanding all sheets → Fixed by expanding only primary sheet
5. **LLM extraction failure**: All chunks present (90K+ chars), but LLM only extracted 15-19 students → **This is the current unresolved issue**

### Root Causes Identified

#### 1. **Semantic Search Limitations**
- Vector similarity search works well for **finding relevant chunks** but doesn't guarantee **complete data extraction**
- Excel data is structured (rows/columns), but we're treating it as unstructured text
- Semantic search may find chunks that "mention" students but not all chunks containing students

#### 2. **Chunking Strategy Issues**
- Excel files are chunked by character limits (default ~2000 tokens = ~8000 chars per chunk)
- A single sheet with 200 rows might be split into 10-15 chunks
- If semantic search doesn't return all chunks, data is incomplete
- Even with sheet expansion, we're sending **text representations** of tables, not structured data

#### 3. **LLM Context Processing Limitations**
- When LLM receives 90K+ characters of table data, it struggles to:
  - Parse all rows systematically
  - Maintain consistency in extraction
  - Handle duplicates across chunks
  - Extract structured data from plain text tables
- This is **not a token limit issue** - it's an **extraction reliability issue** with large structured contexts

#### 4. **Data Representation Mismatch**
- Excel files are **structured** (tables with rows/columns)
- RAG stores them as **unstructured text** (pipe-separated tables)
- LLM is trying to parse and extract from text representation, losing structural integrity

---

## Current Approach - What We Have Now

### How Excel Files Are Processed

1. **Upload & Extraction**:
   - Excel file uploaded → Extracted as text with pipe-separated tables
   - Format: `[Лист: SheetName]` followed by table rows: `Column1 | Column2 | Column3`

2. **Chunking**:
   - Split by sheet boundaries (each sheet is separate)
   - Within each sheet: chunked by character limits (~8000 chars per chunk)
   - Each chunk includes sheet header: `[Лист: SheetName]`
   - Metadata includes: `sheet_name`, `document_id`, `chunk_index`

3. **Embedding**:
   - Each chunk is embedded as a vector
   - Stored in ChromaDB with metadata

4. **Query & Retrieval**:
   - User query → Semantic search finds relevant chunks
   - If Excel detected → Expand to get ALL chunks from primary matching sheet
   - All chunks sent to LLM as text (no truncation for Excel)

5. **LLM Extraction**:
   - LLM receives concatenated chunks with all table data
   - Expected to extract complete list (e.g., all 38 students)
   - **Problem**: LLM inconsistently extracts 15-19 out of 38

---

## Proposed Solutions - Discussion

### Option 1: Embed Excel Files Differently

**Concept**: Change how we chunk and embed Excel files to preserve more structure.

**Possible Approaches**:
- **Row-level chunking**: Instead of character-based chunks, chunk by rows (e.g., 50 rows per chunk)
- **Column-aware chunking**: Chunk by semantic columns (all "name" cells together, all "grade" cells together)
- **Table structure embedding**: Include column headers in every chunk for better context
- **Hierarchical embedding**: Embed at multiple levels (sheet → table → row)

**Pros**:
- More structured representation
- Better semantic search (can find "all 9th grade students" more accurately)
- Maintains table relationships better

**Cons**:
- More complex chunking logic
- Still fundamentally text-based (no true structure)
- May create too many chunks for large sheets
- Doesn't solve LLM extraction reliability issue

**Verdict**: ❌ **Partial solution** - Helps with search but doesn't solve extraction reliability.

---

### Option 2: Hybrid Approach - RAG for Discovery, Raw File Access for Extraction

**Concept**: Use RAG to **find** which Excel file/sheet is relevant, then provide the **raw Excel file** (or specific sheet) to the LLM for structured extraction.

**How it would work**:
1. **RAG Query Phase**:
   - User query → Semantic search finds relevant chunks
   - Identifies: document_id, sheet_name, file_path
   
2. **File Access Phase**:
   - If data source is Excel → Load the actual Excel file
   - Extract the relevant sheet(s) as structured data
   - Pass to LLM as:
     - **Option A**: CSV/JSON representation
     - **Option B**: Excel file attachment (if LLM supports it)
     - **Option C**: Structured prompt with all rows in clear format

3. **LLM Extraction Phase**:
   - LLM works with structured data, not text chunks
   - Can use tools/function calling to query the data programmatically

**Implementation Details**:
- Modify `ToolExecutor.execute_rag_tool()` to detect Excel results
- If Excel detected → call new method: `get_excel_sheet_as_structured_data()`
- Store original Excel files in RAG storage (we already do this via `file_path`)
- Use `pandas` or `openpyxl` to read Excel and convert to structured format
- Pass structured data to LLM instead of text chunks

**Pros**:
- ✅ **Solves extraction reliability** - LLM works with clean, structured data
- ✅ **Complete data** - Always gets entire sheet, not chunks
- ✅ **Preserves structure** - Tables remain tables, not text
- ✅ **General-purpose** - Works for any structured data query
- ✅ **Backward compatible** - RAG still works for non-Excel documents
- ✅ **Can combine with RAG** - RAG finds the file, file provides the data

**Cons**:
- Need to store and access original Excel files (already done via `file_path`)
- Requires file I/O on every Excel query (performance consideration)
- Need to handle file format conversion (Excel → JSON/CSV/structured text)
- For very large sheets, might still hit token limits (but more manageable)

**Verdict**: ✅ **Best solution** - Addresses root cause by providing structured data instead of text.

---

### Option 3: SQLite Database per Excel File

**Concept**: Convert each uploaded Excel file into a SQLite database, embed for search, but query SQL for extraction.

**How it would work**:
1. **Upload Phase**:
   - Excel file uploaded → Convert to SQLite database
   - Each sheet becomes a table
   - Row 1 = column names, subsequent rows = data
   - Store SQLite file alongside original Excel
   
2. **Embedding Phase**:
   - Generate embeddings from Excel text (as we do now) for semantic search
   - Store mapping: chunk → sheet_name → table_name in SQLite
   
3. **Query Phase**:
   - RAG query finds relevant chunks → Identifies table_name
   - Generate SQL query from user query (using LLM)
   - Execute SQL query against SQLite database
   - Return structured results (JSON/CSV)

**Implementation Details**:
- New service: `ExcelToSQLiteConverter`
- Store SQLite files: `storage/rags/{rag_id}/documents/{doc_id}/data.db`
- Query generation: Use LLM to convert natural language → SQL
- Execute SQL: Use Python's `sqlite3` library
- Results: Return as JSON, can be passed to LLM for further processing

**Pros**:
- ✅ **Perfect for structured queries** - SQL excels at filtering, aggregating, sorting
- ✅ **Fast extraction** - Database queries are much faster than text parsing
- ✅ **Scalable** - Can handle large datasets efficiently
- ✅ **Flexible queries** - Support complex queries ("all students in 9th grade with score > 80")
- ✅ **Preserves relationships** - Multiple sheets can be joined if needed

**Cons**:
- ❌ **Complex implementation** - Need SQL query generation, database management
- ❌ **Maintenance overhead** - Need to keep SQLite DBs in sync if Excel updated
- ❌ **Limited to structured data** - Doesn't help with PDFs, Word docs, etc.
- ❌ **SQL generation errors** - LLM-generated SQL might have bugs
- ❌ **Overkill for simple queries** - Most queries just need "get all rows from this sheet"

**Verdict**: ⚠️ **Over-engineered** - Great for complex queries, but too complex for simple "get all students" use case. Good for future enhancement.

---

### Option 4: Enhanced Structured Data Extraction

**Concept**: Keep current RAG approach but add a **pre-processing step** that extracts structured data from Excel chunks **before** sending to LLM.

**How it would work**:
1. **RAG Retrieval**: Same as now - get all chunks from matching sheet
2. **Pre-processing Phase**:
   - Detect Excel chunks (has `sheet_name` metadata)
   - Parse pipe-separated table text into structured format
   - Extract all rows into a clean data structure (JSON/CSV)
   - Deduplicate rows across chunks
   - Sort/normalize data if needed
   
3. **LLM Phase**:
   - Pass clean, structured data to LLM
   - LLM works with clean JSON/CSV instead of messy chunked text

**Implementation Details**:
- New method: `_extract_structured_data_from_excel_chunks(chunks)`
- Parse chunks: Extract table rows from pipe-separated format
- Combine: Merge rows from all chunks into single dataset
- Deduplicate: Remove duplicate rows
- Format: Convert to clean JSON or CSV
- Pass to LLM: "Here's the complete dataset: [JSON/CSV]"

**Pros**:
- ✅ **Solves extraction reliability** - Clean data is easier for LLM to process
- ✅ **Minimal changes** - Builds on existing infrastructure
- ✅ **Handles chunk boundaries** - Automatically merges data from multiple chunks
- ✅ **General-purpose** - Works for any structured data in chunks

**Cons**:
- Need to reliably parse pipe-separated table format
- Edge cases: What if chunks overlap? What if format is inconsistent?
- Still relies on RAG to retrieve all chunks (same search issues)
- Doesn't solve the case where RAG doesn't find all chunks

**Verdict**: ✅ **Good complementary solution** - Combine with Option 2 for best results.

---

## Recommended Hybrid Approach: Option 2 + Option 4

### The Best Solution: **RAG for Discovery, File Access for Extraction**

**Core Principle**: 
- **RAG's job**: Find which file/sheet contains the data
- **File's job**: Provide complete, structured data

**Implementation Strategy**:

1. **RAG Query** (as now):
   - Semantic search finds relevant chunks
   - Identifies: `document_id`, `sheet_name`, `file_path`

2. **Excel Detection & File Access**:
   ```python
   if excel_file_detected:
       # Load actual Excel file
       excel_file_path = storage.get_document_file_path(rag_id, doc_id, filename)
       
       # Read specific sheet using pandas/openpyxl
       df = pd.read_excel(excel_file_path, sheet_name=sheet_name)
       
       # Convert to structured format
       structured_data = df.to_dict('records')  # or to_json(), or to_csv()
       
       # Return structured data instead of text chunks
       return {
           "type": "excel_structured",
           "document": doc_title,
           "sheet": sheet_name,
           "data": structured_data,  # JSON array of records
           "row_count": len(df),
           "columns": list(df.columns)
       }
   else:
       # Regular documents: return text chunks as before
       return {"type": "text_chunks", "results": formatted_results}
   ```

3. **LLM Interaction**:
   - For Excel structured data: Pass as clean JSON/CSV in prompt
   - For text chunks: Use existing format
   - LLM can process structured data much more reliably

4. **Format Tool Result**:
   ```python
   if result["type"] == "excel_structured":
       formatted = f"Excel File: {result['document']}, Sheet: {result['sheet']}\n"
       formatted += f"Columns: {', '.join(result['columns'])}\n"
       formatted += f"Total rows: {result['row_count']}\n\n"
       formatted += "Data:\n"
       formatted += json.dumps(result['data'], indent=2, ensure_ascii=False)
       return formatted
   ```

**Benefits**:
- ✅ **Reliable extraction** - LLM gets complete, clean data
- ✅ **No chunking issues** - Entire sheet available, not chunks
- ✅ **Backward compatible** - Non-Excel documents work as before
- ✅ **General-purpose** - Works for any Excel query
- ✅ **Performance** - File I/O is fast (Excel files are typically < 10MB)
- ✅ **Simple** - Minimal changes to existing code

**Trade-offs**:
- File I/O on every Excel query (acceptable - Excel files are small)
- Need to handle file format conversion (straightforward with pandas)
- For very large sheets (1000+ rows), might need pagination (can add later)

---

## Implementation Plan (If We Choose Option 2)

### Phase 1: Core Infrastructure
1. Add `get_excel_file_path()` method to storage/RAG storage
2. Add `read_excel_sheet()` helper that uses pandas/openpyxl
3. Modify `execute_rag_tool()` to detect Excel results

### Phase 2: Structured Data Extraction
4. Add logic to load Excel file when Excel chunks detected
5. Convert sheet to structured format (JSON/CSV)
6. Format as tool result instead of text chunks

### Phase 3: Testing & Refinement
7. Test with various Excel files and queries
8. Handle edge cases (missing files, corrupted files, etc.)
9. Optimize for performance if needed

### Phase 4: Documentation
10. Update docs to explain new behavior
11. Add examples of Excel query results

---

## Questions for Discussion

1. **Performance**: Are Excel files typically small enough (< 10MB) that file I/O on every query is acceptable?

2. **Storage**: We already store original files via `file_path`. Is this sufficient, or do we need additional checks?

3. **Multiple Sheets**: If query matches multiple sheets, do we return all of them or just the primary one?

4. **File Updates**: If user re-uploads Excel file, should we automatically update structured data, or require manual refresh?

5. **Fallback**: If Excel file is missing/corrupted, should we fall back to chunk-based approach?

6. **Other Formats**: Should we extend this to CSV files? Google Sheets? Database exports?

---

## Comparison Table

| Approach | Extraction Reliability | Complexity | Performance | General-Purpose | Verdict |
|----------|----------------------|------------|-------------|-----------------|---------|
| **Option 1: Better Embedding** | ⚠️ Partial | Low | Same | ✅ Yes | ❌ Doesn't solve core issue |
| **Option 2: File Access** | ✅ High | Medium | Good | ✅ Yes | ✅ **Best choice** |
| **Option 3: SQLite** | ✅ Very High | High | Excellent | ❌ Excel only | ⚠️ Over-engineered |
| **Option 4: Pre-processing** | ✅ Good | Medium | Same | ✅ Yes | ✅ Good complement |

---

## Recommendation

**Implement Option 2 (File Access)** as the primary solution:
- Solves the extraction reliability problem
- General-purpose and backward compatible
- Reasonable complexity
- Can be enhanced later with Option 4 (pre-processing) for edge cases

**Consider Option 3 (SQLite)** as a future enhancement for:
- Complex analytical queries
- Large datasets (1000+ rows)
- Multi-sheet joins
- Aggregations and filters

