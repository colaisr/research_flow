# RAG Query Debugging Guide

This document explains how to debug RAG tool queries in pipeline steps.

## What Was Added

Comprehensive logging has been added to track RAG query execution throughout the pipeline. The logs will show:

1. **Query Extraction Process**
   - Context window used (200 chars before/after tool reference)
   - Full prompt text
   - Extracted query from AI
   - Model used for extraction

2. **RAG Search Execution**
   - Tool name and ID
   - Extracted query string
   - RAG name and ID
   - Number of documents in RAG
   - Search parameters (top_k, min_score)

3. **Search Results**
   - Raw results count from vector DB
   - Each result with distance, document title, sheet name (for Excel)
   - Results filtered by similarity threshold
   - Document breakdown (which documents matched)

4. **Result Formatting**
   - Number of results included
   - Which results were truncated (if any)
   - Total character count
   - Preview of formatted text

## How to Debug

### Step 1: Check Backend Logs

After running a test step that uses a RAG tool, check the backend logs:

```bash
tail -f backend.log | grep -E "\[RAG Tool\]"
```

Or check recent logs:
```bash
tail -1000 backend.log | grep -E "\[RAG Tool\]"
```

### Step 2: Look for These Log Messages

#### Query Extraction
```
[RAG Tool] Tool reference found at position X in prompt (length: Y)
[RAG Tool] Context window: chars A to B (Z chars)
[RAG Tool] Context text around tool reference: ...
[RAG Tool] Full prompt text: ...
[RAG Tool] Successfully extracted query for tool 'ToolName': 'extracted query text'
```

#### RAG Execution
```
[RAG Tool] Executing RAG query for tool 'ToolName' (tool_id=X): query='query text'
[RAG Tool] Search parameters: top_k=10, min_score=None
[RAG Tool] Found RAG 'RAGName' (rag_id=X, org_id=Y) with Z documents
```

#### Search Results
```
[RAG Tool] Vector DB search returned X raw results (before filtering)
[RAG Tool] Using minimum score threshold: 1.5
[RAG Tool] Result 1/X: distance=0.XXXX, doc_title='Title', sheet_name=SheetName, preview='...'
[RAG Tool] Final results: X matches after filtering (filtered Y results below threshold)
[RAG Tool] Results breakdown by document: {'Document1': 3, 'Document2': 2, ...}
```

#### Result Formatting
```
[RAG Tool] Formatting X results for query: 'query text' in RAG 'RAGName'
[RAG Tool] Result 1 included fully (500 chars): DocumentTitle
[RAG Tool] Result 2 truncated from 2500 to 2000 chars: DocumentTitle
[RAG Tool] Formatted result: X results, Y truncated, total ~Z chars
```

## Common Issues to Check

### 1. Query Extraction Issues

**Problem**: Query extracted from prompt doesn't match intent
- **Check**: Context window may be too small (200 chars)
- **Check**: AI extraction may be simplifying the query too much
- **Solution**: Increase context window or improve extraction prompt

**Logs to check**:
- `[RAG Tool] Context text around tool reference:` - Is the full query visible?
- `[RAG Tool] Successfully extracted query:` - Does it match your intent?

### 2. Incomplete Results

**Problem**: Results seem incomplete or missing relevant documents
- **Check**: `top_k` parameter (default is 10, may need to increase)
- **Check**: Similarity threshold filtering out good results
- **Check**: Documents not properly indexed/embedded

**Logs to check**:
- `[RAG Tool] Vector DB search returned X raw results` - How many before filtering?
- `[RAG Tool] Final results: X matches after filtering` - How many after filtering?
- `[RAG Tool] Result X filtered out: distance Y > threshold Z` - Are good results being filtered?

### 3. Wrong RAG or Documents

**Problem**: Querying wrong RAG or documents not matching
- **Check**: Tool configuration (rag_id in tool config)
- **Check**: Documents in RAG (document count in logs)
- **Check**: Document titles/sheets in results breakdown

**Logs to check**:
- `[RAG Tool] Found RAG 'RAGName' (rag_id=X)` - Is this the correct RAG?
- `[RAG Tool] Results breakdown by document:` - Are expected documents showing up?

### 4. Results Truncation

**Problem**: Important information truncated from results
- **Check**: Result length (truncation happens at 2000 chars per result)
- **Check**: Number of results (may need to increase top_k)

**Logs to check**:
- `[RAG Tool] Result X truncated from Y to 2000 chars` - Which results were truncated?
- `[RAG Tool] Formatted result: X results, Y truncated` - How many truncated?

## Potential Improvements

Based on the logs, you may want to:

1. **Increase Context Window**: If query extraction misses context, increase `context_window` in `execute_tool_with_context` (currently 200 chars)

2. **Increase top_k**: If results are incomplete, increase default `top_k` in `execute_rag_tool` (currently 10)

3. **Adjust Similarity Threshold**: If good results are filtered, lower `min_score` threshold or check if threshold is too strict

4. **Improve Query Extraction**: If extracted query doesn't match intent, improve the AI extraction prompt or use more context

5. **Increase Truncation Limit**: If important info is truncated, increase from 2000 chars (but be mindful of token limits)

## Example: Investigating a Specific Issue

If you're getting incomplete results:

1. Check the extracted query:
   ```
   [RAG Tool] Successfully extracted query for tool 'MyRAGTool': 'simple query'
   ```
   - Does this match what you intended? If not, the extraction needs improvement.

2. Check search results:
   ```
   [RAG Tool] Vector DB search returned 10 raw results (before filtering)
   [RAG Tool] Final results: 3 matches after filtering (filtered 7 results below threshold)
   ```
   - Are too many results being filtered? Check the threshold.

3. Check document breakdown:
   ```
   [RAG Tool] Results breakdown by document: {'Doc1': 2, 'Doc2': 1}
   ```
   - Are expected documents showing up? If not, documents may not be indexed properly.

4. Check result formatting:
   ```
   [RAG Tool] Result 1 truncated from 3000 to 2000 chars: Doc1
   ```
   - Is important info being truncated? May need to increase limit.

## Next Steps

1. Run a test step with a RAG tool
2. Check the backend logs for `[RAG Tool]` entries
3. Share the logs if you need help interpreting them
4. We can adjust the code based on what the logs reveal

