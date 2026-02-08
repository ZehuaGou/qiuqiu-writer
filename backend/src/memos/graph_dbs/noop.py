"""No-op graph DB implementation. Used when Neo4j is disabled via DISABLE_NEO4J."""

from typing import Any, Literal

from memos.graph_dbs.base import BaseGraphDB


class NoOpGraphDB(BaseGraphDB):
    """
    No-op graph database: does not connect to any service, all operations are no-op or return empty.
    Use when DISABLE_NEO4J=true to avoid Neo4j/Qdrant connection attempts.
    """

    def __init__(self, config: Any):
        self.config = config

    def add_node(self, id: str, memory: str, metadata: dict[str, Any], user_name: str | None = None) -> None:
        pass

    def update_node(self, id: str, fields: dict[str, Any]) -> None:
        pass

    def delete_node(self, id: str) -> None:
        pass

    def add_edge(self, source_id: str, target_id: str, type: str) -> None:
        pass

    def delete_edge(self, source_id: str, target_id: str, type: str) -> None:
        pass

    def edge_exists(self, source_id: str, target_id: str, type: str) -> bool:
        return False

    def get_node(self, id: str, include_embedding: bool = False) -> dict[str, Any] | None:
        return None

    def get_nodes(
        self, ids: str | list[str], include_embedding: bool = False, **kwargs
    ) -> list[dict[str, Any]]:
        return []

    def get_neighbors(
        self, id: str, type: str, direction: Literal["in", "out", "both"] = "out"
    ) -> list[str]:
        return []

    def get_path(self, source_id: str, target_id: str, max_depth: int = 3) -> list[str]:
        return []

    def get_subgraph(
        self,
        center_id: str,
        depth: int = 2,
        center_status: str = "activated",
        user_name: str | None = None,
    ) -> dict[str, Any]:
        return {"core_node": None, "neighbors": [], "edges": []}

    def get_context_chain(self, id: str, type: str = "FOLLOWS") -> list[str]:
        return []

    def search_by_embedding(
        self,
        vector: list[float],
        top_k: int = 5,
        scope: str | None = None,
        status: str | None = None,
        threshold: float | None = None,
        search_filter: dict | None = None,
        user_name: str | None = None,
        **kwargs,
    ) -> list[dict]:
        return []

    def get_by_metadata(self, filters: list[dict[str, Any]]) -> list[str]:
        return []

    def get_structure_optimization_candidates(
        self, scope: str, include_embedding: bool = False
    ) -> list[dict]:
        return []

    def deduplicate_nodes(self) -> None:
        pass

    def detect_conflicts(self) -> list[tuple[str, str]]:
        return []

    def merge_nodes(self, id1: str, id2: str) -> str:
        return id1

    def clear(self) -> None:
        pass

    def export_graph(self, include_embedding: bool = False) -> dict[str, Any]:
        return {"nodes": [], "edges": []}

    def import_graph(self, data: dict[str, Any]) -> None:
        pass

    def get_all_memory_items(
        self, scope: str, include_embedding: bool = False, user_name: str | None = None, **kwargs
    ) -> list[dict]:
        return []
