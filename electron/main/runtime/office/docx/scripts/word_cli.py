#!/usr/bin/env python3
"""
Command-line interface for Word document operations using OOXML approach.

This script provides a simple CLI wrapper around the Document library
for common operations like reading, creating, and editing Word documents.
"""

import argparse
import json
import sys
from pathlib import Path

# Add parent directory to path for imports
sys.path.insert(0, str(Path(__file__).parent))

from document import Document


def read_document(unpacked_dir):
    """Read document and extract content."""
    try:
        doc = Document(unpacked_dir)

        # Extract paragraphs
        document_xml = doc.get("word/document.xml")
        paragraphs = document_xml.dom.getElementsByTagName("w:p")

        content = []
        for i, p in enumerate(paragraphs):
            text_nodes = p.getElementsByTagName("w:t")
            paragraph_text = "".join([n.firstChild.nodeValue for n in text_nodes if n.firstChild])
            if paragraph_text.strip():
                content.append({
                    "index": i,
                    "text": paragraph_text.strip()
                })

        return json.dumps({
            "success": True,
            "content": content
        }, ensure_ascii=False, indent=2)
    except Exception as e:
        return json.dumps({
            "success": False,
            "error": str(e)
        })


def validate_document(unpacked_dir):
    """Validate document structure."""
    try:
        doc = Document(unpacked_dir)

        # Basic validation - check if required files exist
        required_files = ["word/document.xml", "[Content_Types].xml"]
        missing_files = []

        from pathlib import Path
        unpacked_path = Path(unpacked_dir)

        for file in required_files:
            if not (unpacked_path / file).exists():
                missing_files.append(file)

        if missing_files:
            return json.dumps({
                "success": False,
                "valid": False,
                "errors": [f"Missing required files: {', '.join(missing_files)}"]
            }, ensure_ascii=False, indent=2)

        return json.dumps({
            "success": True,
            "valid": True,
            "errors": [],
            "warnings": []
        }, ensure_ascii=False, indent=2)
    except Exception as e:
        return json.dumps({
            "success": False,
            "valid": False,
            "errors": [str(e)]
        }, ensure_ascii=False, indent=2)


def main():
    parser = argparse.ArgumentParser(description="Word document operations CLI")
    parser.add_argument("command", choices=["read", "validate"], help="Command to execute")
    parser.add_argument("unpacked_dir", help="Path to unpacked document directory")

    args = parser.parse_args()

    if args.command == "read":
        print(read_document(args.unpacked_dir))
    elif args.command == "validate":
        print(validate_document(args.unpacked_dir))


if __name__ == "__main__":
    main()
