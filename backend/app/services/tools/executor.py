"""
Tool execution engine for user-configured tools.
"""
from typing import Dict, Any, Optional
from sqlalchemy.orm import Session
import logging
import re
import json
import hashlib
from functools import lru_cache
from app.models.user_tool import UserTool, ToolType
from app.models.rag_knowledge_base import RAGKnowledgeBase
from app.models.rag_access import RAGAccess, RAGRole
from app.services.data.adapters import CCXTAdapter, YFinanceAdapter, TinkoffAdapter, get_tinkoff_token
from app.services.tools.encryption import decrypt_tool_config
from app.services.llm.client import LLMClient
from app.services.rag import VectorDB, EmbeddingService
from app.core.config import RAG_MIN_SIMILARITY_SCORE

logger = logging.getLogger(__name__)

# Simple in-memory cache for AI extraction results
# Key: hash(context_text + step_context + tool_id + model)
# Value: extracted parameters dict
_extraction_cache: Dict[str, Dict[str, Any]] = {}


class ToolExecutor:
    """Executes user-configured tools based on tool type."""
    
    def __init__(self, db: Optional[Session] = None):
        """Initialize tool executor.
        
        Args:
            db: Optional database session for loading adapter tokens
        """
        self.db = db
    
    def execute_tool(
        self,
        tool: UserTool,
        params: Optional[Dict[str, Any]] = None
    ) -> Dict[str, Any]:
        """Execute a tool based on its type.
        
        Args:
            tool: UserTool instance to execute
            params: Optional parameters for tool execution
            
        Returns:
            Dict with execution results
            
        Raises:
            ValueError: If tool type is not supported or execution fails
        """
        # Check if tool is active
        if not tool.is_active:
            raise ValueError(f"Tool '{tool.display_name}' is not active and cannot be executed")
        
        if tool.tool_type == ToolType.API.value:
            return self.execute_api_tool(tool, params)
        elif tool.tool_type == ToolType.DATABASE.value:
            return self.execute_database_tool(tool, params)
        elif tool.tool_type == ToolType.RAG.value:
            return self.execute_rag_tool(tool, params)
        else:
            raise ValueError(f"Unsupported tool type: {tool.tool_type}")
    
    def execute_tool_with_context(
        self,
        tool: UserTool,
        prompt_text: str,
        tool_variable_name: str,
        step_context: Optional[Dict[str, Any]] = None,
        model: Optional[str] = None,
        llm_client: Optional[LLMClient] = None
    ) -> str:
        """Execute a tool with AI-based parameter extraction from prompt context.
        
        This method uses AI/LLM to extract parameters from the prompt text around the tool reference,
        executes the tool, and returns a formatted result string ready for injection into the prompt.
        
        Args:
            tool: UserTool instance to execute
            prompt_text: Full prompt text containing tool reference
            tool_variable_name: Variable name used in prompt (e.g., "binance_api")
            step_context: Optional step context (instrument, timeframe, previous steps, etc.)
            model: Model to use for AI extraction (should be same as step model)
            llm_client: Optional LLMClient instance (will create if not provided)
            
        Returns:
            Formatted string result ready for prompt injection
            
        Raises:
            ValueError: If tool execution fails or parameter extraction fails
        """
        step_context = step_context or {}
        context_window = 200  # Fixed context window (200 chars before/after)
        
        # Find tool reference in prompt
        tool_ref_pattern = f"{{{tool_variable_name}}}"
        tool_position = prompt_text.find(tool_ref_pattern)
        
        if tool_position == -1:
            logger.warning(f"Tool reference {tool_ref_pattern} not found in prompt")
            return f"[Tool {tool.display_name} execution failed: reference not found]"
        
        # Extract context around tool reference
        start = max(0, tool_position - context_window)
        end = min(len(prompt_text), tool_position + len(tool_ref_pattern) + context_window)
        context_text = prompt_text[start:end]
        
        # Extract parameters using AI
        try:
            params = self._extract_params_with_ai(
                context_text=context_text,
                tool=tool,
                step_context=step_context,
                model=model,
                llm_client=llm_client
            )
            logger.info(f"AI extraction completed for {tool.display_name}, extracted params: {params}")
            
            # Execute tool
            result = self.execute_tool(tool, params)
            
            # Format result for prompt injection
            return self._format_tool_result(result, tool.tool_type, tool)
            
        except Exception as e:
            logger.error(f"Tool execution failed for {tool.display_name}: {e}", exc_info=True)
            return f"[Tool {tool.display_name} execution failed: {str(e)}]"
    
    def _extract_params_with_ai(
        self,
        context_text: str,
        tool: UserTool,
        step_context: Dict[str, Any],
        model: Optional[str] = None,
        llm_client: Optional[LLMClient] = None
    ) -> Dict[str, Any]:
        """Extract tool parameters using AI/LLM.
        
        Uses the same model as the step to extract parameters from context text.
        Results are cached to optimize performance.
        
        Args:
            context_text: Text around tool reference
            tool: UserTool instance
            step_context: Step context (instrument, timeframe, previous steps, etc.)
            model: Model to use for extraction (should be same as step model)
            llm_client: Optional LLMClient instance
            
        Returns:
            Parameters dict for tool execution
        """
        if not model:
            logger.warning(f"No model provided for AI extraction, using default")
            model = "openai/gpt-4o-mini"  # Fallback to default
        
        # Check cache
        cache_key = self._get_extraction_cache_key(context_text, step_context, tool.id, model)
        if cache_key in _extraction_cache:
            logger.debug(f"Using cached extraction result for tool {tool.display_name}")
            return _extraction_cache[cache_key]
        
        # Create LLM client if not provided
        if not llm_client:
            if not self.db:
                raise ValueError("Database session required for LLM client creation")
            llm_client = LLMClient(db=self.db)
        
        # Build system prompt based on tool type
        system_prompt = self._build_extraction_system_prompt(tool.tool_type)
        
        # Build user prompt
        user_prompt = self._build_extraction_user_prompt(
            context_text=context_text,
            tool=tool,
            step_context=step_context
        )
        
        # Call LLM
        try:
            logger.info(f"Calling LLM for parameter extraction: tool={tool.display_name}, model={model}")
            response = llm_client.call(
                system_prompt=system_prompt,
                user_prompt=user_prompt,
                model=model,
                temperature=0.1,  # Low temperature for consistent extraction
                max_tokens=500
            )
            
            content = response.get("content", "")
            
            # Parse JSON response
            params = self._parse_extraction_response(content, tool.tool_type)
            
            # Cache result
            _extraction_cache[cache_key] = params
            
            logger.info(f"Successfully extracted parameters for {tool.display_name}: {params}")
            return params
            
        except Exception as e:
            logger.error(f"AI extraction failed for {tool.display_name}: {e}", exc_info=True)
            # Fallback to empty params (tool may have defaults)
            return {}
    
    def _get_extraction_cache_key(
        self,
        context_text: str,
        step_context: Dict[str, Any],
        tool_id: int,
        model: str
    ) -> str:
        """Generate cache key for extraction result."""
        # Create hash from context text, step context, tool_id, and model
        context_str = json.dumps({
            "context_text": context_text,
            "step_context": step_context,
            "tool_id": tool_id,
            "model": model
        }, sort_keys=True)
        return hashlib.md5(context_str.encode()).hexdigest()
    
    def _build_extraction_system_prompt(self, tool_type: str) -> str:
        """Build system prompt for parameter extraction based on tool type."""
        base_prompt = """You are a tool parameter extraction assistant. Your task is to extract parameters needed to execute a tool based on the context around the tool reference in a prompt.

Rules:
1. Analyze the context text around the tool reference
2. Extract parameters needed for the tool type
3. Validate parameters and provide guardrails (prevent SQL injection, validate formats)
4. Return ONLY valid JSON, no explanations or markdown formatting
5. If parameters cannot be extracted, return empty JSON object: {}

Tool types:
- API: Extract endpoint, method, params (instrument, timeframe, etc.)
- Database: Convert natural language questions to valid SQL queries
- RAG: Extract search query/question
"""
        
        if tool_type == ToolType.API.value:
            return base_prompt + """
For API tools, extract parameters like:
{"instrument": "BTC/USDT", "timeframe": "H1"}
or
{"endpoint": "/api/orders", "method": "GET", "params": {"customer_id": 123}}
"""
        elif tool_type == ToolType.DATABASE.value:
            return base_prompt + """
For Database tools, convert the question to SQL:
{"query": "SELECT * FROM orders WHERE customer_id = 123"}

IMPORTANT:
- Only generate SELECT queries (no INSERT, UPDATE, DELETE, DROP, etc.)
- Use parameterized queries where possible
- Validate SQL syntax
- If question is unclear, return empty query: {"query": ""}
"""
        elif tool_type == ToolType.RAG.value:
            return base_prompt + """
For RAG tools, extract the search query:
{"query": "transactions from Tom Jankins on 21/5/2025"}
"""
        else:
            return base_prompt
    
    def _build_extraction_user_prompt(
        self,
        context_text: str,
        tool: UserTool,
        step_context: Dict[str, Any]
    ) -> str:
        """Build user prompt for parameter extraction."""
        step_context_json = json.dumps(step_context, ensure_ascii=False, indent=2)
        
        return f"""Context around tool reference:
"{context_text}"

Tool information:
- Type: {tool.tool_type}
- Name: {tool.display_name}
- Variable name: {tool.display_name.lower().replace(' ', '_')}

Available step context:
{step_context_json}

Extract parameters needed to execute this tool. Return ONLY valid JSON."""
    
    def _parse_extraction_response(self, content: str, tool_type: str) -> Dict[str, Any]:
        """Parse LLM response and extract parameters."""
        # Remove markdown code blocks if present
        content = content.strip()
        if content.startswith("```"):
            # Extract JSON from code block
            lines = content.split("\n")
            json_lines = []
            in_json = False
            for line in lines:
                if line.strip().startswith("```"):
                    if "json" in line.lower():
                        in_json = True
                    elif in_json:
                        break
                    continue
                if in_json:
                    json_lines.append(line)
            content = "\n".join(json_lines)
        
        try:
            params = json.loads(content)
            if not isinstance(params, dict):
                logger.warning(f"LLM returned non-dict response: {params}")
                return {}
            return params
        except json.JSONDecodeError as e:
            logger.error(f"Failed to parse LLM response as JSON: {content[:200]}... Error: {e}")
            return {}
    
    def _extract_api_params(
        self,
        context_text: str,
        tool: UserTool,
        step_context: Dict[str, Any],
        extraction_config: Dict[str, Any]
    ) -> Dict[str, Any]:
        """Extract API tool parameters from context text.
        
        For API tools, we use the tool's configured endpoint by default.
        If the prompt contains specific parameters (like instrument), we can pass them.
        
        Args:
            context_text: Text around tool reference
            tool: UserTool instance
            step_context: Step context with instrument, timeframe, etc.
            extraction_config: Extraction configuration
            
        Returns:
            Parameters dict for API tool execution
        """
        params = {}
        
        # Remove tool variable references from context to avoid false matches
        # Example: {yahoo_finance_api} -> remove it so we don't match "YAHOO_FINANCE" as instrument
        cleaned_context = context_text
        # Remove {variable_name} patterns
        cleaned_context = re.sub(r'\{[^}]+\}', '', cleaned_context)
        
        # First, try to extract parameters from context text (prompt)
        # Look for instrument patterns: BTC/USDT, BTC-USDT, BTC_USDT, AAPL, etc.
        # Priority: simple tickers first (AAPL, BTC), then pairs (BTC/USDT)
        instrument_patterns = [
            r'\b([A-Z]{2,5})\b',  # Simple tickers: AAPL, BTC, TSLA (2-5 uppercase letters, word boundary)
            r'([A-Z0-9]+/[A-Z0-9]+)',  # BTC/USDT format
            r'([A-Z0-9]+-[A-Z0-9]+)',  # BTC-USDT format
            r'([A-Z0-9]+_[A-Z0-9]+)',  # BTC_USDT format (last priority)
        ]
        for pattern in instrument_patterns:
            match = re.search(pattern, cleaned_context, re.IGNORECASE)
            if match:
                candidate = match.group(1).upper()
                # Skip common tool/service names that might be matched
                skip_names = {'API', 'HTTP', 'HTTPS', 'GET', 'POST', 'PUT', 'DELETE', 'YAHOO', 'FINANCE', 'BINANCE', 'TINKOFF'}
                if candidate not in skip_names and len(candidate) >= 2:
                    params["instrument"] = candidate
                    break
        
        # Look for timeframe patterns: H1, H4, D1, 1h, 4h, 1d, etc.
        timeframe_patterns = [
            r'\b([HMD]\d+)\b',  # H1, H4, D1, M1, etc.
            r'\b(\d+[hdm])\b',  # 1h, 4h, 1d, 5m, etc.
            r'\b(таймфрейм[е]?\s+([HMD]\d+|\d+[hdm]))',  # Russian: "таймфрейме H1"
        ]
        for pattern in timeframe_patterns:
            match = re.search(pattern, cleaned_context, re.IGNORECASE)
            if match:
                timeframe = match.group(1) if len(match.groups()) == 1 else match.group(2)
                # Normalize timeframe format (convert 1h to H1, etc.)
                if timeframe and not timeframe[0].isalpha():
                    # Convert 1h -> H1, 4h -> H4, etc.
                    num = re.match(r'(\d+)', timeframe)
                    unit = re.search(r'([hdm])', timeframe.lower())
                    if num and unit:
                        unit_map = {'h': 'H', 'd': 'D', 'm': 'M'}
                        timeframe = f"{unit_map.get(unit.group(1), 'H')}{num.group(1)}"
                params["timeframe"] = timeframe.upper()
                break
        
        # Use step context variables only if:
        # 1. Not already extracted from prompt, AND
        # 2. Not "N/A" (which means not set)
        if "instrument" not in params and "instrument" in step_context:
            if step_context["instrument"] and step_context["instrument"] != "N/A":
                params["instrument"] = step_context["instrument"]
        
        if "timeframe" not in params and "timeframe" in step_context:
            if step_context["timeframe"] and step_context["timeframe"] != "N/A":
                params["timeframe"] = step_context["timeframe"]
        
        return params
    
    def _extract_database_params(
        self,
        context_text: str,
        tool: UserTool,
        step_context: Dict[str, Any],
        extraction_config: Dict[str, Any]
    ) -> Dict[str, Any]:
        """Extract database tool parameters from context text.
        
        For database tools, we look for:
        1. Query template in extraction_config
        2. SQL query in context text
        3. Natural language query that can be converted to SQL
        
        Args:
            context_text: Text around tool reference
            tool: UserTool instance
            step_context: Step context
            extraction_config: Extraction configuration (may contain query_template)
            
        Returns:
            Parameters dict with SQL query
        """
        params = {}
        
        # Check for query template in extraction_config
        query_template = extraction_config.get("query_template")
        if query_template:
            # Replace template variables with step context values
            query = query_template
            for key, value in step_context.items():
                query = query.replace(f"{{{key}}}", str(value))
            params["query"] = query
            return params
        
        # Look for SQL query in context text (simple pattern matching)
        # Check for common SQL keywords
        sql_pattern = r"(SELECT|INSERT|UPDATE|DELETE|CREATE|ALTER|DROP)\s+.*?(?=\s|$)"
        sql_match = re.search(sql_pattern, context_text, re.IGNORECASE | re.DOTALL)
        if sql_match:
            params["query"] = sql_match.group(0).strip()
            return params
        
        # If no SQL found, return empty params (will use tool's default query if configured)
        logger.warning(f"No SQL query found in context for database tool {tool.display_name}")
        return params
    
    def _extract_rag_params(
        self,
        context_text: str,
        tool: UserTool,
        step_context: Dict[str, Any],
        extraction_config: Dict[str, Any]
    ) -> Dict[str, Any]:
        """Extract RAG tool parameters (query) from context text.
        
        For RAG tools, we extract the question/query from the text around the tool reference.
        
        Args:
            context_text: Text around tool reference
            tool: UserTool instance
            step_context: Step context
            extraction_config: Extraction configuration
            
        Returns:
            Parameters dict with query string
        """
        # Extract query from context text
        # Simple approach: Extract text that looks like a question or query
        # Remove the tool reference itself - try different patterns
        tool_ref_patterns = [
            f"{{{tool.display_name.lower().replace(' ', '_')}}}",
            f"{{{tool.display_name.replace(' ', '_')}}}",
            f"{{{tool.display_name}}}"
        ]
        query_text = context_text
        for pattern in tool_ref_patterns:
            query_text = query_text.replace(pattern, "")
        
        query_text = query_text.strip()
        
        # Replace step context variables
        for key, value in step_context.items():
            query_text = query_text.replace(f"{{{key}}}", str(value))
        
        # Clean up query text
        query_text = re.sub(r'\s+', ' ', query_text)  # Normalize whitespace
        
        return {"query": query_text}
    
    def _format_tool_result(self, result: Dict[str, Any], tool_type: str, tool: Optional[UserTool] = None) -> str:
        """Format tool execution result as string for prompt injection.
        
        Args:
            result: Tool execution result dict
            tool_type: Tool type (api, database, rag)
            tool: Optional UserTool instance (used to detect market data tools)
            
        Returns:
            Formatted string result
        """
        if tool_type == ToolType.RAG.value:
            # Format RAG results as "Relevant context: ..."
            if "results" in result and result["results"]:
                formatted = "Relevant context from knowledge base"
                if "rag_name" in result:
                    formatted += f" ({result['rag_name']})"
                formatted += ":\n"
                # Include all results (up to top_k, which is now 10 by default)
                for idx, item in enumerate(result["results"], 1):
                    document_text = item.get('document', '')
                    if document_text:
                        # Include full content, not truncated (let LLM decide what's relevant)
                        # Only truncate if extremely long (>2000 chars) to avoid token limits
                        if len(document_text) > 2000:
                            truncated = document_text[:2000] + "..."
                            formatted += f"{idx}. {truncated}\n"
                        else:
                            formatted += f"{idx}. {document_text}\n"
                return formatted
            return "Relevant context: No results found."
        
        elif tool_type == ToolType.DATABASE.value:
            # Format database results as table or JSON
            if "rows" in result:
                if not result["rows"]:
                    return "Database query returned no results."
                # Format as simple table
                formatted = "Database results:\n"
                for row in result["rows"][:10]:  # Limit to 10 rows
                    formatted += str(row) + "\n"
                return formatted
            return str(result)
        
        elif tool_type == ToolType.API.value:
            # Check if this is a market data tool (Binance, Tinkoff, Yahoo Finance)
            is_market_data_tool = False
            if tool:
                try:
                    # Decrypt config to check connector name
                    from app.services.tools.encryption import decrypt_tool_config
                    config = decrypt_tool_config(tool.config)
                    connector_name = config.get('connector_name', '').lower() if isinstance(config, dict) else ''
                    if connector_name in ['binance', 'ccxt', 'tinkoff', 'yfinance']:
                        is_market_data_tool = True
                except:
                    pass  # If decryption fails, treat as regular API
            
            # Format market data tools as market_data_summary format
            if is_market_data_tool and "data" in result:
                data = result.get("data", {})
                candles_data = data.get("candles", [])
                if candles_data:
                    formatted = ""
                    # Sort candles by timestamp (oldest first)
                    sorted_candles = sorted(candles_data, key=lambda c: c.get('timestamp', ''))
                    # Take last 50 candles (or all if less)
                    candles_to_show = sorted_candles[-50:] if len(sorted_candles) > 50 else sorted_candles
                    
                    for candle in candles_to_show:
                        timestamp_str = candle.get('timestamp', '')
                        # Format timestamp
                        if isinstance(timestamp_str, str):
                            # Try to parse and format timestamp
                            try:
                                from datetime import datetime
                                if 'T' in timestamp_str:
                                    dt = datetime.fromisoformat(timestamp_str.replace('Z', '+00:00'))
                                    timestamp_formatted = dt.strftime('%Y-%m-%d %H:%M')
                                else:
                                    timestamp_formatted = timestamp_str
                            except:
                                timestamp_formatted = timestamp_str
                        else:
                            timestamp_formatted = str(timestamp_str)
                        
                        formatted += f"- {timestamp_formatted}: O={candle.get('open', 0):.2f} H={candle.get('high', 0):.2f} L={candle.get('low', 0):.2f} C={candle.get('close', 0):.2f} V={candle.get('volume', 0):.2f}\n"
                    
                    return formatted if formatted else "No market data available."
            
            # Format other API results as JSON or text
            if "data" in result:
                return f"API response:\n{json.dumps(result['data'], indent=2)[:500]}"
            return str(result)
        
        return str(result)
    
    def execute_api_tool(
        self,
        tool: UserTool,
        params: Optional[Dict[str, Any]] = None
    ) -> Dict[str, Any]:
        """Execute an API tool.
        
        Supports:
        - Predefined connectors (CCXT, yfinance, Tinkoff) via adapter pattern
        - Generic REST APIs
        
        Args:
            tool: UserTool with tool_type='api'
            params: Optional parameters (e.g., {'endpoint': '/api/v1/data', 'method': 'GET', 'body': {...}})
            
        Returns:
            Dict with API response data
        """
        # Decrypt credentials in config
        config = decrypt_tool_config(tool.config)
        connector_type = config.get('connector_type', 'custom')
        
        if connector_type == 'predefined':
            # Use adapter pattern for predefined connectors
            connector_name = config.get('connector_name', '').lower()
            
            if connector_name in ['binance', 'ccxt']:
                return self._execute_ccxt_adapter(tool, params)
            elif connector_name == 'yfinance':
                return self._execute_yfinance_adapter(tool, params)
            elif connector_name == 'tinkoff':
                return self._execute_tinkoff_adapter(tool, params)
            else:
                raise ValueError(f"Unknown predefined connector: {connector_name}")
        else:
            # Generic REST API
            return self._execute_generic_api(tool, params)
    
    def execute_database_tool(
        self,
        tool: UserTool,
        params: Optional[Dict[str, Any]] = None
    ) -> Dict[str, Any]:
        """Execute a database tool query.
        
        Args:
            tool: UserTool with tool_type='database'
            params: Must include 'query' key with SQL query string
            
        Returns:
            Dict with query results
            
        Note: Only read-only queries are supported for now.
        """
        if not params or 'query' not in params:
            raise ValueError("Database tool execution requires 'query' parameter")
        
        query = params['query']
        
        # Validate query is read-only (basic check)
        query_upper = query.strip().upper()
        forbidden_keywords = ['INSERT', 'UPDATE', 'DELETE', 'DROP', 'CREATE', 'ALTER', 'TRUNCATE']
        for keyword in forbidden_keywords:
            if keyword in query_upper:
                raise ValueError(f"Write operations not allowed. Query contains forbidden keyword: {keyword}")
        
        # Decrypt credentials in config
        config = decrypt_tool_config(tool.config)
        connector_type = config.get('connector_type', 'custom')
        
        if connector_type == 'predefined':
            connector_name = config.get('connector_name', '').lower()
            if connector_name == 'mysql':
                return self._execute_mysql_query(config, query)
            elif connector_name == 'postgresql':
                return self._execute_postgresql_query(config, query)
            elif connector_name == 'mongodb':
                return self._execute_mongodb_query(config, query)
            else:
                raise ValueError(f"Unknown database connector: {connector_name}")
        else:
            # Generic database connection
            # Try to detect database type from connection string
            connection_string = config.get('connection_string', '')
            if 'mysql' in connection_string.lower() or 'mariadb' in connection_string.lower():
                return self._execute_mysql_query(config, query)
            elif 'postgresql' in connection_string.lower() or 'postgres' in connection_string.lower():
                return self._execute_postgresql_query(config, query)
            else:
                raise ValueError("Could not determine database type from configuration")
    
    def execute_rag_tool(
        self,
        tool: UserTool,
        params: Optional[Dict[str, Any]] = None
    ) -> Dict[str, Any]:
        """Execute a RAG tool query.
        
        Args:
            tool: UserTool with tool_type='rag'
            params: Must include 'query' key with search query string, optional 'top_k' (default: 5), optional 'min_score'
            
        Returns:
            Dict with RAG query results in format: {"results": [{"document": str, "metadata": dict, "distance": float, "id": str}]}
            
        Note: Token/cost counts to RAG Owner's account (via EmbeddingService using global API key).
        """
        if not self.db:
            raise ValueError("Database session required for RAG tool execution")
        
        if not params or 'query' not in params:
            raise ValueError("RAG tool execution requires 'query' parameter")
        
        query = params.get('query', '').strip()
        if not query:
            raise ValueError("RAG tool query cannot be empty")
        
        top_k = params.get('top_k', 10)  # Default to 10 results (increased from 5 for better coverage)
        min_score = params.get('min_score')  # Optional min_score override
        
        # Decrypt tool config to get rag_id
        try:
            config = decrypt_tool_config(tool.config)
            rag_id = config.get('rag_id')
            if not rag_id:
                raise ValueError(f"RAG tool {tool.display_name} is missing 'rag_id' in config")
        except Exception as e:
            logger.error(f"Failed to decrypt RAG tool config: {e}")
            raise ValueError(f"Invalid RAG tool configuration: {str(e)}")
        
        # Get RAG from database
        rag = self.db.query(RAGKnowledgeBase).filter(
            RAGKnowledgeBase.id == rag_id,
            RAGKnowledgeBase.organization_id == tool.organization_id
        ).first()
        
        if not rag:
            raise ValueError(f"RAG knowledge base {rag_id} not found or not accessible")
        
        # Generate query embedding
        embedding_service = EmbeddingService(db=self.db)
        try:
            query_embedding = embedding_service.generate_embedding(query)
        except Exception as e:
            logger.error(f"Failed to generate embedding for RAG query: {e}")
            raise ValueError(f"Failed to process query: {str(e)}")
        
        # Search vector DB
        vector_db = VectorDB()
        try:
            results = vector_db.search(rag_id, query_embedding, top_k=top_k)
        except Exception as e:
            logger.error(f"Failed to search vector DB for RAG {rag_id}: {e}")
            raise ValueError(f"Failed to search knowledge base: {str(e)}")
        
        # Format results and apply minimum score threshold
        # Priority: params.min_score > rag.min_similarity_score > global config
        effective_min_score = min_score
        if effective_min_score is None:
            effective_min_score = rag.min_similarity_score
        if effective_min_score is None:
            effective_min_score = RAG_MIN_SIMILARITY_SCORE
        
        formatted_results = []
        for result in results:
            distance = result.get('distance')
            
            # Filter by minimum score if specified
            # For ChromaDB L2 distance: lower is better, so we check if distance <= threshold
            if effective_min_score is not None and distance is not None:
                if distance > effective_min_score:
                    continue  # Skip results below threshold
            
            formatted_results.append({
                "document": result.get('document', ''),
                "metadata": result.get('metadata', {}),
                "distance": distance,
                "id": result.get('id'),
            })
        
        # Note: Token/cost counts to RAG Owner's account (handled by EmbeddingService using global API key)
        # The Owner is the one who pays for all queries (via organization's OpenRouter API key)
        
        return {
            "results": formatted_results,
            "query": query,
            "top_k": top_k,
            "rag_id": rag_id,
            "rag_name": rag.name
        }
    
    def _execute_ccxt_adapter(
        self,
        tool: UserTool,
        params: Optional[Dict[str, Any]] = None
    ) -> Dict[str, Any]:
        """Execute CCXT adapter for crypto exchanges."""
        config = tool.config
        adapter_config = config.get('adapter_config', {})
        exchange_name = adapter_config.get('exchange_name', 'binance')
        
        adapter = CCXTAdapter(exchange_name=exchange_name)
        
        # Extract parameters for fetch_ohlcv
        # AI extraction may return params in nested format: {'params': {'instrument': ...}}
        # or flat format: {'instrument': ...}
        if params and 'params' in params and isinstance(params['params'], dict):
            # Nested format from AI extraction
            actual_params = params['params']
        else:
            # Flat format
            actual_params = params or {}
        
        instrument = actual_params.get('instrument')
        timeframe = actual_params.get('timeframe', 'H1')
        limit = actual_params.get('limit', 500)
        
        if not instrument:
            raise ValueError("CCXT adapter requires 'instrument' parameter")
        
        market_data = adapter.fetch_ohlcv(instrument, timeframe, limit=limit)
        
        return {
            'success': True,
            'data': {
                'instrument': market_data.instrument,
                'timeframe': market_data.timeframe,
                'exchange': market_data.exchange,
                'candles': [
                    {
                        'timestamp': candle.timestamp.isoformat(),
                        'open': candle.open,
                        'high': candle.high,
                        'low': candle.low,
                        'close': candle.close,
                        'volume': candle.volume
                    }
                    for candle in market_data.candles
                ],
                'fetched_at': market_data.fetched_at.isoformat()
            }
        }
    
    def _execute_yfinance_adapter(
        self,
        tool: UserTool,
        params: Optional[Dict[str, Any]] = None
    ) -> Dict[str, Any]:
        """Execute yfinance adapter for equities."""
        adapter = YFinanceAdapter()
        
        # Extract parameters
        instrument = params.get('instrument') if params else None
        timeframe = params.get('timeframe', 'D1') if params else 'D1'
        limit = params.get('limit', 500) if params else 500
        
        if not instrument:
            raise ValueError("yfinance adapter requires 'instrument' parameter")
        
        market_data = adapter.fetch_ohlcv(instrument, timeframe, limit=limit)
        
        return {
            'success': True,
            'data': {
                'instrument': market_data.instrument,
                'timeframe': market_data.timeframe,
                'exchange': market_data.exchange,
                'candles': [
                    {
                        'timestamp': candle.timestamp.isoformat(),
                        'open': candle.open,
                        'high': candle.high,
                        'low': candle.low,
                        'close': candle.close,
                        'volume': candle.volume
                    }
                    for candle in market_data.candles
                ],
                'fetched_at': market_data.fetched_at.isoformat()
            }
        }
    
    def _execute_tinkoff_adapter(
        self,
        tool: UserTool,
        params: Optional[Dict[str, Any]] = None
    ) -> Dict[str, Any]:
        """Execute Tinkoff adapter for MOEX instruments."""
        # Get API token from config or settings
        config = tool.config
        api_token = config.get('api_token')
        
        if not api_token and self.db:
            # Try to get from settings
            api_token = get_tinkoff_token(self.db)
        
        if not api_token:
            raise ValueError("Tinkoff adapter requires API token in tool config or settings")
        
        adapter = TinkoffAdapter(api_token=api_token)
        
        # Extract parameters
        instrument = params.get('instrument') if params else None
        timeframe = params.get('timeframe', 'D1') if params else 'D1'
        limit = params.get('limit', 500) if params else 500
        
        if not instrument:
            raise ValueError("Tinkoff adapter requires 'instrument' parameter")
        
        market_data = adapter.fetch_ohlcv(instrument, timeframe, limit=limit)
        
        return {
            'success': True,
            'data': {
                'instrument': market_data.instrument,
                'timeframe': market_data.timeframe,
                'exchange': market_data.exchange,
                'candles': [
                    {
                        'timestamp': candle.timestamp.isoformat(),
                        'open': candle.open,
                        'high': candle.high,
                        'low': candle.low,
                        'close': candle.close,
                        'volume': candle.volume
                    }
                    for candle in market_data.candles
                ],
                'fetched_at': market_data.fetched_at.isoformat()
            }
        }
    
    def _execute_generic_api(
        self,
        tool: UserTool,
        params: Optional[Dict[str, Any]] = None
    ) -> Dict[str, Any]:
        """Execute generic REST API request."""
        import httpx
        
        # Config is already decrypted by execute_api_tool
        # But we need to get it from the tool, so decrypt again if needed
        # Actually, since execute_api_tool calls this with decrypted config in tool.config,
        # we need to check if it's already decrypted or decrypt here
        # For safety, decrypt again (it's idempotent if already decrypted)
        config = decrypt_tool_config(tool.config)
        base_url = config.get('base_url', '').rstrip('/')
        auth_type = config.get('auth_type', 'none')
        # Use decrypted api_key (from decrypt_tool_config)
        api_key = config.get('api_key', '') or config.get('api_key_encrypted', '')
        headers = config.get('headers', {})
        timeout = config.get('timeout', 30)
        
        # Extract request parameters
        endpoint = params.get('endpoint', '') if params else ''
        method = params.get('method', 'GET').upper() if params else 'GET'
        body = params.get('body') if params else None
        
        # Build full URL
        if endpoint.startswith('http'):
            url = endpoint
        else:
            url = f"{base_url}{endpoint}"
        
        # Add authentication headers
        if auth_type == 'api_key':
            if 'Authorization' not in headers:
                headers['Authorization'] = f"Bearer {api_key}"
        elif auth_type == 'basic':
            import base64
            # Basic auth requires username:password in config
            username = config.get('username', '')
            # Use decrypted password (from decrypt_tool_config)
            password = config.get('password', '') or config.get('password_encrypted', '')
            credentials = base64.b64encode(f"{username}:{password}".encode()).decode()
            headers['Authorization'] = f"Basic {credentials}"
        
        # Make request
        try:
            with httpx.Client(timeout=timeout) as client:
                if method == 'GET':
                    response = client.get(url, headers=headers)
                elif method == 'POST':
                    response = client.post(url, headers=headers, json=body)
                elif method == 'PUT':
                    response = client.put(url, headers=headers, json=body)
                elif method == 'DELETE':
                    response = client.delete(url, headers=headers)
                else:
                    raise ValueError(f"Unsupported HTTP method: {method}")
                
                response.raise_for_status()
                
                return {
                    'success': True,
                    'status_code': response.status_code,
                    'data': response.json() if response.headers.get('content-type', '').startswith('application/json') else response.text,
                    'headers': dict(response.headers)
                }
        except httpx.HTTPError as e:
            raise ValueError(f"API request failed: {str(e)}")
    
    def _execute_mysql_query(
        self,
        config: Dict[str, Any],
        query: str
    ) -> Dict[str, Any]:
        """Execute MySQL query."""
        import pymysql
        
        # Extract connection details (password already decrypted)
        host = config.get('host', 'localhost')
        port = config.get('port', 3306)
        database = config.get('database', '')
        username = config.get('username', '')
        password = config.get('password', '') or config.get('password_encrypted', '')
        ssl_mode = config.get('ssl_mode', 'DISABLED')
        
        try:
            connection = pymysql.connect(
                host=host,
                port=port,
                user=username,
                password=password,
                database=database,
                ssl={'ssl': {'ssl-mode': ssl_mode}} if ssl_mode != 'DISABLED' else None,
                cursorclass=pymysql.cursors.DictCursor
            )
            
            with connection.cursor() as cursor:
                cursor.execute(query)
                results = cursor.fetchall()
                
            connection.close()
            
            return {
                'success': True,
                'rows': results,
                'row_count': len(results)
            }
        except Exception as e:
            raise ValueError(f"MySQL query failed: {str(e)}")
    
    def _execute_postgresql_query(
        self,
        config: Dict[str, Any],
        query: str
    ) -> Dict[str, Any]:
        """Execute PostgreSQL query."""
        import psycopg2
        from psycopg2.extras import RealDictCursor
        
        # Extract connection details (password already decrypted)
        host = config.get('host', 'localhost')
        port = config.get('port', 5432)
        database = config.get('database', '')
        username = config.get('username', '')
        password = config.get('password', '') or config.get('password_encrypted', '')
        ssl_mode = config.get('ssl_mode', 'disable')
        
        try:
            connection = psycopg2.connect(
                host=host,
                port=port,
                database=database,
                user=username,
                password=password,
                sslmode=ssl_mode
            )
            
            with connection.cursor(cursor_factory=RealDictCursor) as cursor:
                cursor.execute(query)
                results = cursor.fetchall()
                
            connection.close()
            
            return {
                'success': True,
                'rows': [dict(row) for row in results],
                'row_count': len(results)
            }
        except Exception as e:
            raise ValueError(f"PostgreSQL query failed: {str(e)}")
    
    def _execute_mongodb_query(
        self,
        config: Dict[str, Any],
        query: str
    ) -> Dict[str, Any]:
        """Execute MongoDB query."""
        from pymongo import MongoClient
        
        # Extract connection details (password already decrypted)
        host = config.get('host', 'localhost')
        port = config.get('port', 27017)
        database = config.get('database', '')
        username = config.get('username', '')
        password = config.get('password', '') or config.get('password_encrypted', '')
        
        try:
            # Build connection string
            if username and password:
                connection_string = f"mongodb://{username}:{password}@{host}:{port}/{database}"
            else:
                connection_string = f"mongodb://{host}:{port}/{database}"
            
            client = MongoClient(connection_string)
            db = client[database]
            
            # Parse query (simplified - assumes JSON query string)
            import json
            query_dict = json.loads(query) if isinstance(query, str) else query
            
            # Execute query
            collection_name = query_dict.get('collection', '')
            if not collection_name:
                raise ValueError("MongoDB query must specify 'collection'")
            
            collection = db[collection_name]
            filter_query = query_dict.get('filter', {})
            limit = query_dict.get('limit', 100)
            
            results = list(collection.find(filter_query).limit(limit))
            
            # Convert ObjectId to string for JSON serialization
            for result in results:
                if '_id' in result:
                    result['_id'] = str(result['_id'])
            
            client.close()
            
            return {
                'success': True,
                'rows': results,
                'row_count': len(results)
            }
        except Exception as e:
            raise ValueError(f"MongoDB query failed: {str(e)}")

