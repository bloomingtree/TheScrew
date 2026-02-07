#!/usr/bin/env python3
"""
Word operations wrapper for comment and revision tracking functionality.

This script provides CLI functions for:
- Adding comments to documents
- Enabling revision tracking with RSID
- Suggesting insertions/deletions with tracked changes
- Validating document structure

Usage:
    python word_ops.py add_comment --docx_path=document.docx --location=10 --text="Comment"
    python word_ops.py enable_tracking --docx_path=document.docx --author="Name"
    python word_ops.py suggest_insertion --docx_path=document.docx --location=10 --text="New text"
    python word_ops.py suggest_deletion --docx_path=document.docx --location=10
"""

import argparse
import json
import sys
import tempfile
from pathlib import Path

# Import the Document class
try:
    from document import Document
except ImportError:
    # Try relative import
    try:
        from .document import Document
    except ImportError:
        # Add parent directory to path
        sys.path.insert(0, str(Path(__file__).parent))
        from document import Document


def add_comment(docx_path: str, location: int, text: str, author: str = "Claude"):
    """Add a comment to the document at the specified location.

    Args:
        docx_path: Path to the DOCX file
        location: Paragraph/line number where to add the comment
        text: Comment text
        author: Comment author name
    """
    with tempfile.TemporaryDirectory() as temp_dir:
        # Import unpack here to avoid circular imports
        from ooxml.scripts.unpack import unpack_document

        # Unpack the document
        unpack_dir = Path(temp_dir) / "unpacked"
        unpack_document(docx_path, str(unpack_dir))

        # Initialize Document
        doc = Document(str(unpack_dir), author=author)

        # Get the document.xml editor
        doc_xml = doc["word/document.xml"]

        # Find the paragraph at the specified location
        node = doc_xml.get_node(tag="w:p", line_number=location)

        if not node:
            # Try to find by index
            paragraphs = doc_xml.dom.getElementsByTagName("w:p")
            if 0 <= location < len(paragraphs):
                node = paragraphs[location]

        if not node:
            return {
                "success": False,
                "error": f"Could not find paragraph at location {location}"
            }

        # Add the comment
        doc.add_comment(start=node, end=node, text=text)

        # Save changes
        doc.save()

        # Pack back to DOCX
        from ooxml.scripts.pack import pack_document
        pack_document(str(unpack_dir), docx_path)

        return {
            "success": True,
            "message": f"Comment added at location {location}",
            "location": location,
            "text": text,
            "author": author
        }


def enable_tracking(docx_path: str, author: str = "Claude", initials: str = "C"):
    """Enable revision tracking on the document.

    This ensures all future edits will have RSID and author information.

    Args:
        docx_path: Path to the DOCX file
        author: Author name for tracked changes
        initials: Author initials
    """
    with tempfile.TemporaryDirectory() as temp_dir:
        from ooxml.scripts.unpack import unpack_document

        # Unpack the document
        unpack_dir = Path(temp_dir) / "unpacked"
        unpack_document(docx_path, str(unpack_dir))

        # Initialize Document with author info
        doc = Document(str(unpack_dir), author=author, initials=initials)

        # Ensure RSID is set on root element
        doc_xml = doc["word/document.xml"]
        root = doc_xml.dom.documentElement

        # Generate RSID if not present
        if not root.hasAttribute("w:rsidRDefault"):
            import random
            rsid = f"{random.randint(0, 0xFFFF):04X}"
            root.setAttribute("w:rsidRDefault", rsid)

        # Save changes
        doc.save()

        # Pack back to DOCX
        from ooxml.scripts.pack import pack_document
        pack_document(str(unpack_dir), docx_path)

        return {
            "success": True,
            "message": "Revision tracking enabled",
            "author": author,
            "initials": initials
        }


def suggest_insertion(docx_path: str, location: int, text: str, author: str = "Claude"):
    """Suggest an insertion with tracked changes.

    Args:
        docx_path: Path to the DOCX file
        location: Paragraph/line number
        text: Text to insert
        author: Author name
    """
    with tempfile.TemporaryDirectory() as temp_dir:
        from ooxml.scripts.unpack import unpack_document

        # Unpack the document
        unpack_dir = Path(temp_dir) / "unpacked"
        unpack_document(docx_path, str(unpack_dir))

        # Initialize Document
        doc = Document(str(unpack_dir), author=author)

        # Get the document.xml editor
        doc_xml = doc["word/document.xml"]

        # Find the paragraph at the specified location
        node = doc_xml.get_node(tag="w:p", line_number=location)

        if not node:
            paragraphs = doc_xml.dom.getElementsByTagName("w:p")
            if 0 <= location < len(paragraphs):
                node = paragraphs[location]

        if not node:
            return {
                "success": False,
                "error": f"Could not find paragraph at location {location}"
            }

        # Suggest insertion using the Document class method
        # The document.py suggests using w:ins tags for insertions
        doc_xml.suggest_insertion(node, text)

        # Save changes
        doc.save()

        # Pack back to DOCX
        from ooxml.scripts.pack import pack_document
        pack_document(str(unpack_dir), docx_path)

        return {
            "success": True,
            "message": f"Insertion suggested at location {location}",
            "location": location,
            "text": text
        }


def suggest_deletion(docx_path: str, location: int, author: str = "Claude"):
    """Suggest a deletion with tracked changes.

    Args:
        docx_path: Path to the DOCX file
        location: Paragraph/line number to delete
        author: Author name
    """
    with tempfile.TemporaryDirectory() as temp_dir:
        from ooxml.scripts.unpack import unpack_document

        # Unpack the document
        unpack_dir = Path(temp_dir) / "unpacked"
        unpack_document(docx_path, str(unpack_dir))

        # Initialize Document
        doc = Document(str(unpack_dir), author=author)

        # Get the document.xml editor
        doc_xml = doc["word/document.xml"]

        # Find the paragraph at the specified location
        node = doc_xml.get_node(tag="w:p", line_number=location)

        if not node:
            paragraphs = doc_xml.dom.getElementsByTagName("w:p")
            if 0 <= location < len(paragraphs):
                node = paragraphs[location]

        if not node:
            return {
                "success": False,
                "error": f"Could not find paragraph at location {location}"
            }

        # Suggest deletion
        doc_xml.suggest_deletion(node)

        # Save changes
        doc.save()

        # Pack back to DOCX
        from ooxml.scripts.pack import pack_document
        pack_document(str(unpack_dir), docx_path)

        return {
            "success": True,
            "message": f"Deletion suggested at location {location}",
            "location": location
        }


def validate_document(docx_path: str):
    """Validate document structure and integrity.

    Args:
        docx_path: Path to the DOCX file
    """
    with tempfile.TemporaryDirectory() as temp_dir:
        from ooxml.scripts.unpack import unpack_document
        from ooxml.scripts.validation.docx import DOCXSchemaValidator

        # Unpack the document
        unpack_dir = Path(temp_dir) / "unpacked"
        unpack_document(docx_path, str(unpack_dir))

        # Run validation
        validator = DOCXSchemaValidator(str(unpack_dir))
        result = validator.validate()

        return {
            "success": result.valid,
            "valid": result.valid,
            "errors": result.errors,
            "warnings": result.warnings if hasattr(result, 'warnings') else []
        }


def main():
    parser = argparse.ArgumentParser(description="Word operations for comments and revisions")
    subparsers = parser.add_subparsers(dest="command", help="Command to execute")

    # Add comment command
    add_comment_parser = subparsers.add_parser("add_comment", help="Add a comment")
    add_comment_parser.add_argument("--docx_path", required=True, help="Path to DOCX file")
    add_comment_parser.add_argument("--location", type=int, required=True, help="Paragraph/line number")
    add_comment_parser.add_argument("--text", required=True, help="Comment text")
    add_comment_parser.add_argument("--author", default="Claude", help="Comment author")

    # Enable tracking command
    enable_tracking_parser = subparsers.add_parser("enable_tracking", help="Enable revision tracking")
    enable_tracking_parser.add_argument("--docx_path", required=True, help="Path to DOCX file")
    enable_tracking_parser.add_argument("--author", default="Claude", help="Author name")
    enable_tracking_parser.add_argument("--initials", default="C", help="Author initials")

    # Suggest insertion command
    suggest_insertion_parser = subparsers.add_parser("suggest_insertion", help="Suggest an insertion")
    suggest_insertion_parser.add_argument("--docx_path", required=True, help="Path to DOCX file")
    suggest_insertion_parser.add_argument("--location", type=int, required=True, help="Paragraph/line number")
    suggest_insertion_parser.add_argument("--text", required=True, help="Text to insert")
    suggest_insertion_parser.add_argument("--author", default="Claude", help="Author name")

    # Suggest deletion command
    suggest_deletion_parser = subparsers.add_parser("suggest_deletion", help="Suggest a deletion")
    suggest_deletion_parser.add_argument("--docx_path", required=True, help="Path to DOCX file")
    suggest_deletion_parser.add_argument("--location", type=int, required=True, help="Paragraph/line number")
    suggest_deletion_parser.add_argument("--author", default="Claude", help="Author name")

    # Validate command
    validate_parser = subparsers.add_parser("validate", help="Validate document structure")
    validate_parser.add_argument("--docx_path", required=True, help="Path to DOCX file")

    args = parser.parse_args()

    if not args.command:
        parser.print_help()
        sys.exit(1)

    # Execute command
    result = None
    if args.command == "add_comment":
        result = add_comment(args.docx_path, args.location, args.text, args.author)
    elif args.command == "enable_tracking":
        result = enable_tracking(args.docx_path, args.author, args.initials)
    elif args.command == "suggest_insertion":
        result = suggest_insertion(args.docx_path, args.location, args.text, args.author)
    elif args.command == "suggest_deletion":
        result = suggest_deletion(args.docx_path, args.location, args.author)
    elif args.command == "validate":
        result = validate_document(args.docx_path)

    # Output result as JSON
    print(json.dumps(result, indent=2))

    # Exit with error code if failed
    if result and not result.get("success", True):
        sys.exit(1)


if __name__ == "__main__":
    main()
