"""Railor ingestion worker.

Extraction proposes, review disposes: nothing in this package writes published
capability data directly.
"""

__all__ = ["config", "db", "fetch", "extract", "normalize", "diff", "pipeline"]
__version__ = "0.1.0"
