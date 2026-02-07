"""
OOXML Scripts Module

This module provides core OOXML operations for Office documents:
- Unpack: Extract Office documents to XML
- Pack: Package XML back to Office documents
- Validate: Verify document structure and integrity
"""

from .unpack import main as unpack_main
from .pack import main as pack_main
from .validate import main as validate_main

__all__ = ['unpack_main', 'pack_main', 'validate_main']
