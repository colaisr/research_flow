"""
Excel file loader for RAG structured data extraction.

This module provides utilities to load Excel files and extract structured data
from specific sheets, enabling reliable data extraction for LLM processing.
"""
from pathlib import Path
from typing import Optional, Dict, Any, List
import logging
import json

logger = logging.getLogger(__name__)


class ExcelLoader:
    """Load Excel files and extract structured data from sheets."""
    
    @staticmethod
    def load_sheet_as_structured_data(
        file_path: Path,
        sheet_name: str,
        max_rows: Optional[int] = None
    ) -> Dict[str, Any]:
        """Load a specific sheet from an Excel file as structured data.
        
        Args:
            file_path: Path to Excel file (.xlsx or .xls)
            sheet_name: Name of the sheet to load
            max_rows: Optional maximum number of rows to load (for very large sheets)
            
        Returns:
            Dict with:
                - "data": List of dicts (JSON-serializable records)
                - "columns": List of column names
                - "row_count": Total number of rows
                - "sheet_name": Sheet name
                - "success": bool
                - "error": Optional error message
        """
        try:
            import pandas as pd
        except ImportError:
            error_msg = "pandas is required for Excel file loading. Install with: pip install pandas openpyxl"
            logger.error(error_msg)
            return {
                "data": [],
                "columns": [],
                "row_count": 0,
                "sheet_name": sheet_name,
                "success": False,
                "error": error_msg
            }
        
        try:
            # Check if file exists
            if not file_path.exists():
                error_msg = f"Excel file not found: {file_path}"
                logger.error(error_msg)
                return {
                    "data": [],
                    "columns": [],
                    "row_count": 0,
                    "sheet_name": sheet_name,
                    "success": False,
                    "error": error_msg
                }
            
            # Determine engine based on file extension
            engine = 'openpyxl' if file_path.suffix.lower() == '.xlsx' else None
            
            # Read the specific sheet
            try:
                df = pd.read_excel(file_path, sheet_name=sheet_name, engine=engine)
            except ValueError as e:
                # Sheet not found
                error_msg = f"Sheet '{sheet_name}' not found in Excel file {file_path.name}: {e}"
                logger.error(error_msg)
                return {
                    "data": [],
                    "columns": [],
                    "row_count": 0,
                    "sheet_name": sheet_name,
                    "success": False,
                    "error": error_msg
                }
            
            # Handle empty sheet
            if df.empty:
                logger.info(f"Sheet '{sheet_name}' in {file_path.name} is empty")
                return {
                    "data": [],
                    "columns": [],
                    "row_count": 0,
                    "sheet_name": sheet_name,
                    "success": True,
                    "error": None
                }
            
            # Limit rows if specified
            if max_rows and len(df) > max_rows:
                logger.warning(f"Sheet '{sheet_name}' has {len(df)} rows, limiting to {max_rows}")
                df = df.head(max_rows)
            
            # Convert column names to strings (handle any type)
            df.columns = [str(col) for col in df.columns]
            
            # Convert DataFrame to list of dicts (records format)
            # Replace NaN with None for JSON serialization
            df_cleaned = df.replace({pd.NA: None, float('nan'): None})
            
            # Convert to records (list of dicts)
            records = df_cleaned.to_dict('records')
            
            # Ensure all values are JSON-serializable
            serializable_records = []
            for record in records:
                serializable_record = {}
                for key, value in record.items():
                    # Handle pandas Timestamp, numpy types, etc.
                    if pd.isna(value):
                        serializable_record[key] = None
                    elif isinstance(value, (pd.Timestamp,)):
                        serializable_record[key] = value.isoformat()
                    elif hasattr(value, 'item'):  # numpy scalars
                        serializable_record[key] = value.item()
                    else:
                        serializable_record[key] = value
                serializable_records.append(serializable_record)
            
            logger.info(
                f"Successfully loaded sheet '{sheet_name}' from {file_path.name}: "
                f"{len(serializable_records)} rows, {len(df.columns)} columns"
            )
            
            return {
                "data": serializable_records,
                "columns": list(df.columns),
                "row_count": len(serializable_records),
                "sheet_name": sheet_name,
                "success": True,
                "error": None
            }
            
        except Exception as e:
            error_msg = f"Failed to load sheet '{sheet_name}' from Excel file {file_path.name}: {str(e)}"
            logger.error(error_msg, exc_info=True)
            return {
                "data": [],
                "columns": [],
                "row_count": 0,
                "sheet_name": sheet_name,
                "success": False,
                "error": error_msg
            }
    
    @staticmethod
    def format_structured_data_for_llm(
        structured_data: Dict[str, Any],
        document_title: str
    ) -> str:
        """Format structured Excel data for LLM consumption.
        
        Args:
            structured_data: Result from load_sheet_as_structured_data()
            document_title: Document title/filename
            
        Returns:
            Formatted string ready for LLM prompt
        """
        if not structured_data.get("success"):
            error = structured_data.get("error", "Unknown error")
            return f"Error loading Excel data from {document_title}: {error}"
        
        sheet_name = structured_data.get("sheet_name", "Unknown")
        columns = structured_data.get("columns", [])
        data = structured_data.get("data", [])
        row_count = structured_data.get("row_count", 0)
        
        if not data:
            return f"Excel File: {document_title}\nSheet: {sheet_name}\n\nSheet is empty or contains no data."
        
        # Format header
        formatted = f"Excel File: {document_title}\n"
        formatted += f"Sheet: {sheet_name}\n"
        formatted += f"Columns: {', '.join(columns)}\n"
        formatted += f"Total rows: {row_count}\n\n"
        formatted += "Data (JSON format):\n"
        formatted += "=" * 80 + "\n"
        
        # Format as JSON for clean structure
        # Use ensure_ascii=False to preserve Unicode characters
        formatted += json.dumps(data, indent=2, ensure_ascii=False)
        
        formatted += "\n" + "=" * 80 + "\n"
        formatted += f"\nTotal: {row_count} rows"
        
        return formatted

