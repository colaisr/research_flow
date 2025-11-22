"""
Tool execution engine for user-configured tools.
"""
from typing import Dict, Any, Optional
from sqlalchemy.orm import Session
import logging
from app.models.user_tool import UserTool, ToolType
from app.services.data.adapters import CCXTAdapter, YFinanceAdapter, TinkoffAdapter, get_tinkoff_token
from app.services.tools.encryption import decrypt_tool_config

logger = logging.getLogger(__name__)


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
            params: Must include 'query' key with search query string
            
        Returns:
            Dict with RAG query results
            
        Note: RAG implementation is deferred to Phase 2.
        """
        if not params or 'query' not in params:
            raise ValueError("RAG tool execution requires 'query' parameter")
        
        raise NotImplementedError("RAG tool execution will be implemented in Phase 2")
    
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
        instrument = params.get('instrument') if params else None
        timeframe = params.get('timeframe', 'H1') if params else 'H1'
        limit = params.get('limit', 500) if params else 500
        
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

