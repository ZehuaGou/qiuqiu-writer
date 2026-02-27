"""
Y.js Document Persistence Model

Stores the binary state of Y.js documents (pycrdt.Doc)
for persistence across server restarts and room lifecycle.
"""

from sqlalchemy import Column, DateTime, LargeBinary, String
from sqlalchemy.sql import func

from memos.api.core.database import Base


class YjsDocument(Base):
    """Persisted Y.js document state."""

    __tablename__ = "yjs_documents"

    # Document identifier, e.g. "work_4_chapter_6"
    document_id = Column(String(255), primary_key=True)

    # Full Y.js document state as binary (encoded via pycrdt)
    yjs_state = Column(LargeBinary, nullable=True)

    # Timestamps
    created_at = Column(DateTime, server_default=func.now())
    updated_at = Column(DateTime, server_default=func.now(), onupdate=func.now())

    def __repr__(self):
        size = len(self.yjs_state) if self.yjs_state else 0
        return f"<YjsDocument(id={self.document_id}, size={size}B)>"
