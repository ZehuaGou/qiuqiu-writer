"""No-op vector DB implementation. Used when Qdrant is disabled via DISABLE_QDRANT."""

from typing import Any

from memos.configs.vec_db import BaseVecDBConfig
from memos.vec_dbs.base import BaseVecDB
from memos.vec_dbs.item import VecDBItem


class NoOpVecDB(BaseVecDB):
    """
    No-op vector database: does not connect to any service, all operations are no-op or return empty.
    Use when DISABLE_QDRANT=true to avoid Qdrant connection attempts.
    """

    def __init__(self, config: BaseVecDBConfig):
        self.config = config

    def create_collection(self) -> None:
        pass

    def list_collections(self) -> list[str]:
        return []

    def delete_collection(self, name: str) -> None:
        pass

    def collection_exists(self, name: str) -> bool:
        return False

    def search(
        self,
        query_vector: list[float],
        top_k: int,
        filter: dict[str, Any] | None = None,
    ) -> list[VecDBItem]:
        return []

    def get_by_id(self, id: str) -> VecDBItem | None:
        return None

    def get_by_ids(self, ids: list[str]) -> list[VecDBItem]:
        return []

    def get_by_filter(self, filter: dict[str, Any]) -> list[VecDBItem]:
        return []

    def get_all(self) -> list[VecDBItem]:
        return []

    def count(self, filter: dict[str, Any] | None = None) -> int:
        return 0

    def add(self, data: list[VecDBItem | dict[str, Any]]) -> None:
        pass

    def update(self, id: str, data: VecDBItem | dict[str, Any]) -> None:
        pass

    def upsert(self, data: list[VecDBItem | dict[str, Any]]) -> None:
        pass

    def delete(self, ids: list[str]) -> None:
        pass

    def ensure_payload_indexes(self, fields: list[str]) -> None:
        pass
