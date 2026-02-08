from typing import Any

from memos.configs.vec_db import QdrantVecDBConfig
from memos.dependency import require_python_package
from memos.log import get_logger
from memos.vec_dbs.base import BaseVecDB
from memos.vec_dbs.item import VecDBItem


logger = get_logger(__name__)


class QdrantVecDB(BaseVecDB):
    """Qdrant vector database implementation."""

    @require_python_package(
        import_name="qdrant_client",
        install_command="pip install qdrant-client",
        install_link="https://python-client.qdrant.tech/",
    )
    def __init__(self, config: QdrantVecDBConfig):
        """Initialize the Qdrant vector database and the collection."""
        from qdrant_client import QdrantClient

        self.config = config

        # If both host and port are None, we are running in local mode
        if self.config.host is None and self.config.port is None:
            logger.warning(
                "Qdrant is running in local mode (host and port are both None). "
                "In local mode, there may be race conditions during concurrent reads/writes. "
                "It is strongly recommended to deploy a standalone Qdrant server "
                "(e.g., via Docker: https://qdrant.tech/documentation/quickstart/)."
            )

        # Log configuration for debugging
        logger.info(
            f"Initializing Qdrant client: host={self.config.host}, "
            f"port={self.config.port}, path={self.config.path}"
        )
        
        # Initialize Qdrant client with timeout settings
        # Note: If both host/port and path are provided, path takes precedence (local mode)
        # We want to use remote mode, so only pass host/port if both are set
        if self.config.host and self.config.port:
            # Remote mode: use host and port
            # Ensure port is an integer
            port = int(self.config.port) if isinstance(self.config.port, str) else self.config.port
            # Use 127.0.0.1 instead of localhost to avoid IPv6 issues
            host = "127.0.0.1" if self.config.host.lower() in ("localhost", "127.0.0.1") else self.config.host
            try:
                self.client = QdrantClient(
                    host=host,
                    port=port,
                    timeout=60.0,  # Increased timeout to 60 seconds
                    prefer_grpc=False,  # Use HTTP instead of gRPC for better compatibility
                    check_compatibility=False,  # Skip version check to avoid 502 errors
                )
                logger.info(f"Qdrant client initialized in remote mode: http://{host}:{port}")
            except Exception as e:
                logger.warning(f"Failed to initialize QdrantClient with check_compatibility=False: {e}, trying without it")
                # Fallback: try without check_compatibility parameter (for older qdrant-client versions)
                self.client = QdrantClient(
                    host=host,
                    port=port,
                    timeout=60.0,
                    prefer_grpc=False,
                )
                logger.info(f"Qdrant client initialized (fallback mode): http://{host}:{port}")
        elif self.config.path:
            # Local mode: use path
            self.client = QdrantClient(
                path=self.config.path,
                timeout=30.0,
            )
            logger.info(f"Qdrant client initialized in local mode: {self.config.path}")
        else:
            raise ValueError("Qdrant configuration error: must provide either (host and port) or path")
        
        # Skip connection check during initialization to avoid blocking startup
        # Connection will be verified lazily when actually needed (first operation)
        logger.info("Qdrant client created. Connection will be verified on first use.")
        
        # Don't create collection during initialization - do it lazily
        self._collection_created = False
    
    def _ensure_connection(self, max_retries: int = 5, retry_delay: float = 2.0):
        """Ensure Qdrant connection is available with retry logic.
        连接被拒绝（服务未启动）时立即失败，避免长时间重试阻塞聊天并拖慢其他接口。
        """
        import time

        connection_info = f"host={self.config.host}, port={self.config.port}" if self.config.host else f"path={self.config.path}"

        for attempt in range(max_retries):
            try:
                collections = self.client.get_collections()
                logger.info(
                    f"✅ Qdrant connection verified (attempt {attempt + 1}/{max_retries}) "
                    f"at {connection_info}. Found {len(collections.collections)} collections."
                )
                return
            except Exception as e:
                error_str = str(e)
                error_type = type(e).__name__
                # 连接被拒绝（服务未启动）：不重试，立即失败，避免阻塞 10+ 秒
                is_refused = (
                    "Connection refused" in error_str
                    or "Errno 61" in error_str
                    or (getattr(e, "errno", None) == 61)
                )
                if is_refused:
                    logger.error(
                        f"❌ Qdrant connection refused at {connection_info}: {error_type}: {error_str}. "
                        "Service likely not running. Failing fast (no retry)."
                    )
                    raise
                if attempt < max_retries - 1:
                    current_delay = retry_delay * (2 ** attempt) if "502" in error_str or "Bad Gateway" in error_str else retry_delay * (1.5 ** attempt)
                    logger.warning(
                        f"⚠️ Qdrant connection check failed (attempt {attempt + 1}/{max_retries}) "
                        f"at {connection_info}: {error_type}: {error_str[:200]}. "
                        f"Retrying in {current_delay:.1f}s..."
                    )
                    time.sleep(current_delay)
                else:
                    logger.error(
                        f"❌ Failed to connect to Qdrant after {max_retries} attempts "
                        f"at {connection_info}: {error_type}: {error_str}"
                    )
                    if "502" in error_str or "Bad Gateway" in error_str:
                        raise ConnectionError(
                            f"Qdrant service returned 502 Bad Gateway after {max_retries} retries. "
                            f"Connection info: {connection_info}. "
                            f"Please check: docker ps | grep qdrant && curl http://{self.config.host or 'localhost'}:{self.config.port or 6333}/collections"
                        ) from e
                    raise

    def _lazy_ensure_connection(self):
        """Lazily ensure connection and collection exist when first needed."""
        if not hasattr(self, '_connection_verified') or not self._connection_verified:
            try:
                self._ensure_connection()
                self._connection_verified = True
            except Exception as e:
                logger.warning(f"Lazy connection check failed: {e}. Will retry on next operation.")
                self._connection_verified = False
                raise
    
    def create_collection(self) -> None:
        """Create a new collection with specified parameters."""
        from qdrant_client.http import models
        import time

        # Lazy connection check
        self._lazy_ensure_connection()

        if self.collection_exists(self.config.collection_name):
            collection_info = self.client.get_collection(self.config.collection_name)
            existing_dimension = collection_info.config.params.vectors.size
            expected_dimension = self.config.vector_dimension
            
            # Check if dimension matches
            if existing_dimension != expected_dimension:
                logger.warning(
                    f"Collection '{self.config.collection_name}' exists with dimension {existing_dimension}, "
                    f"but expected {expected_dimension}. Deleting and recreating..."
                )
                self.delete_collection(self.config.collection_name)
            else:
                logger.info(
                    f"Collection '{self.config.collection_name}' (vector dimension: {existing_dimension}) already exists. Skipping creation."
                )
                return

        # Map string distance metric to Qdrant Distance enum
        distance_map = {
            "cosine": models.Distance.COSINE,
            "euclidean": models.Distance.EUCLID,
            "dot": models.Distance.DOT,
        }

        # Retry logic for collection creation
        max_retries = 3
        retry_delay = 1.0
        
        for attempt in range(max_retries):
            try:
                self.client.create_collection(
                    collection_name=self.config.collection_name,
                    vectors_config=models.VectorParams(
                        size=self.config.vector_dimension,
                        distance=distance_map[self.config.distance_metric],
                    ),
                )

                logger.info(
                    f"Collection '{self.config.collection_name}' created with {self.config.vector_dimension} dimensions."
                )
                return
            except Exception as e:
                error_str = str(e)
                if attempt < max_retries - 1:
                    # Check if it's a transient error (502, 503, connection issues)
                    if "502" in error_str or "503" in error_str or "Bad Gateway" in error_str or "connection" in error_str.lower():
                        logger.warning(
                            f"Failed to create collection '{self.config.collection_name}' (attempt {attempt + 1}/{max_retries}): {e}. "
                            f"Retrying in {retry_delay}s..."
                        )
                        time.sleep(retry_delay)
                        retry_delay *= 2  # Exponential backoff
                        continue
                    else:
                        # Non-transient error, re-raise immediately
                        raise
                else:
                    # Last attempt failed
                    logger.error(
                        f"Failed to create collection '{self.config.collection_name}' after {max_retries} attempts: {e}"
                    )
                    raise

    def list_collections(self) -> list[str]:
        """List all collections."""
        collections = self.client.get_collections()
        return [collection.name for collection in collections.collections]

    def delete_collection(self, name: str) -> None:
        """Delete a collection."""
        self.client.delete_collection(collection_name=name)

    def collection_exists(self, name: str) -> bool:
        """Check if a collection exists."""
        try:
            self._lazy_ensure_connection()
            self.client.get_collection(collection_name=name)
            return True
        except Exception:
            return False

    def search(
        self, query_vector: list[float], top_k: int, filter: dict[str, Any] | None = None
    ) -> list[VecDBItem]:
        """
        Search for similar items in the database.

        Args:
            query_vector: Single vector to search
            top_k: Number of results to return
            filter: Payload filters

        Returns:
            List of search results with distance scores and payloads.
        """
        self._lazy_ensure_connection()
        # Ensure collection exists and has correct dimension before searching
        if not self.collection_exists(self.config.collection_name):
            logger.warning(
                f"Collection '{self.config.collection_name}' does not exist. Creating it now..."
            )
            self.create_collection()
        else:
            # Check if dimension matches
            try:
                collection_info = self.client.get_collection(self.config.collection_name)
                existing_dimension = collection_info.config.params.vectors.size
                expected_dimension = self.config.vector_dimension
                if existing_dimension != expected_dimension:
                    logger.warning(
                        f"Collection '{self.config.collection_name}' has dimension {existing_dimension}, "
                        f"but expected {expected_dimension}. Recreating collection..."
                    )
                    self.delete_collection(self.config.collection_name)
                    self.create_collection()
            except Exception as e:
                # 如果获取集合信息失败，先再次确认集合是否存在
                # 如果集合确实存在，说明只是获取信息时出现了临时错误，应该跳过创建
                if self.collection_exists(self.config.collection_name):
                    logger.warning(
                        f"Failed to check collection dimension for '{self.config.collection_name}': {e}. "
                        f"Collection exists, skipping creation. Will continue with search."
                    )
                    # 集合存在但无法获取信息，可能是临时网络问题，继续执行搜索
                else:
                    # 集合不存在，尝试创建
                    logger.warning(
                        f"Failed to check collection dimension: {e}. Collection may not exist. Attempting to create collection..."
                    )
                    self.create_collection()
        qdrant_filter = self._dict_to_filter(filter) if filter else None
        response = self.client.search(
            collection_name=self.config.collection_name,
            query_vector=query_vector,
            limit=top_k,
            query_filter=qdrant_filter,
            with_vectors=True,
            with_payload=True,
        )
        logger.info(f"Qdrant search completed with {len(response)} results.")
        return [
            VecDBItem(
                id=point.id,
                vector=point.vector,
                payload=point.payload,
                score=point.score,
            )
            for point in response
        ]

    def _dict_to_filter(self, filter_dict: dict[str, Any]) -> Any:
        from qdrant_client.http import models

        """Convert a dictionary filter to a Qdrant Filter object."""
        conditions = []

        for field, value in filter_dict.items():
            # Simple exact match for now
            # TODO: Extend this to support more complex conditions
            conditions.append(
                models.FieldCondition(key=field, match=models.MatchValue(value=value))
            )

        return models.Filter(must=conditions)

    def get_by_id(self, id: str) -> VecDBItem | None:
        """Get a single item by ID."""
        self._lazy_ensure_connection()
        response = self.client.retrieve(
            collection_name=self.config.collection_name,
            ids=[id],
            with_payload=True,
            with_vectors=True,
        )

        if not response:
            return None

        point = response[0]
        return VecDBItem(
            id=point.id,
            vector=point.vector,
            payload=point.payload,
        )

    def get_by_ids(self, ids: list[str]) -> list[VecDBItem]:
        """Get multiple items by their IDs."""
        self._lazy_ensure_connection()
        response = self.client.retrieve(
            collection_name=self.config.collection_name,
            ids=ids,
            with_payload=True,
            with_vectors=True,
        )

        if not response:
            return []

        return [
            VecDBItem(
                id=point.id,
                vector=point.vector,
                payload=point.payload,
            )
            for point in response
        ]

    def get_by_filter(self, filter: dict[str, Any], scroll_limit: int = 100) -> list[VecDBItem]:
        """
        Retrieve all items that match the given filter criteria.

        Args:
            filter: Payload filters to match against stored items
            scroll_limit: Maximum number of items to retrieve per scroll request

        Returns:
            List of items including vectors and payload that match the filter
        """
        self._lazy_ensure_connection()
        qdrant_filter = self._dict_to_filter(filter) if filter else None
        all_points = []
        offset = None

        # Use scroll to paginate through all matching points
        while True:
            points, offset = self.client.scroll(
                collection_name=self.config.collection_name,
                limit=scroll_limit,
                scroll_filter=qdrant_filter,
                offset=offset,
                with_vectors=True,
                with_payload=True,
            )

            if not points:
                break

            all_points.extend(points)

            # Update offset for next iteration
            if offset is None:
                break

        logger.info(f"Qdrant retrieve by filter completed with {len(all_points)} results.")
        return [
            VecDBItem(
                id=point.id,
                vector=point.vector,
                payload=point.payload,
            )
            for point in all_points
        ]

    def get_all(self, scroll_limit=100) -> list[VecDBItem]:
        """Retrieve all items in the vector database."""
        return self.get_by_filter({}, scroll_limit=scroll_limit)

    def count(self, filter: dict[str, Any] | None = None) -> int:
        """Count items in the database, optionally with filter."""
        self._lazy_ensure_connection()
        qdrant_filter = None
        if filter:
            qdrant_filter = self._dict_to_filter(filter)

        response = self.client.count(
            collection_name=self.config.collection_name, count_filter=qdrant_filter
        )

        return response.count

    def add(self, data: list[VecDBItem | dict[str, Any]]) -> None:
        from qdrant_client.http import models

        """
        Add data to the vector database.

        Args:
            data: List of VecDBItem objects or dictionaries containing:
                - 'id': unique identifier
                - 'vector': embedding vector
                - 'payload': additional fields for filtering/retrieval
        """
        self._lazy_ensure_connection()
        # Ensure collection exists before adding
        if not self.collection_exists(self.config.collection_name):
            logger.warning(
                f"Collection '{self.config.collection_name}' does not exist. Creating it now..."
            )
            self.create_collection()
        points = []
        for item in data:
            if isinstance(item, dict):
                item = item.copy()
                item = VecDBItem.from_dict(item)
            point = models.PointStruct(id=item.id, vector=item.vector, payload=item.payload)
            points.append(point)

        self.client.upsert(collection_name=self.config.collection_name, points=points)

    def update(self, id: str, data: VecDBItem | dict[str, Any]) -> None:
        """Update an item in the vector database."""
        from qdrant_client.http import models

        if isinstance(data, dict):
            data = data.copy()
            data = VecDBItem.from_dict(data)

        if data.vector:
            # For vector updates (with or without payload), use upsert with the same ID
            self.client.upsert(
                collection_name=self.config.collection_name,
                points=[models.PointStruct(id=id, vector=data.vector, payload=data.payload)],
            )
        else:
            # For payload-only updates
            self.client.set_payload(
                collection_name=self.config.collection_name, payload=data.payload, points=[id]
            )

    def ensure_payload_indexes(self, fields: list[str]) -> None:
        """
        Create payload indexes for specified fields in the collection.
        This is idempotent: it will skip if index already exists.

        Args:
            fields (list[str]): List of field names to index (as keyword).
        """
        self._lazy_ensure_connection()
        # Ensure collection exists before creating indexes
        if not self.collection_exists(self.config.collection_name):
            logger.warning(
                f"Collection '{self.config.collection_name}' does not exist. Creating it now..."
            )
            self.create_collection()
        for field in fields:
            try:
                self.client.create_payload_index(
                    collection_name=self.config.collection_name,
                    field_name=field,
                    field_schema="keyword",  # Could be extended in future
                )
                logger.debug(f"Qdrant payload index on '{field}' ensured.")
            except Exception as e:
                logger.warning(f"Failed to create payload index on '{field}': {e}")

    def upsert(self, data: list[VecDBItem | dict[str, Any]]) -> None:
        """
        Add or update data in the vector database.

        If an item with the same ID exists, it will be updated.
        Otherwise, it will be added as a new item.
        """
        # Qdrant's upsert operation already handles this logic
        self.add(data)

    def delete(self, ids: list[str]) -> None:
        from qdrant_client.http import models

        """Delete items from the vector database."""
        self._lazy_ensure_connection()
        point_ids: list[str | int] = ids
        self.client.delete(
            collection_name=self.config.collection_name,
            points_selector=models.PointIdsList(points=point_ids),
        )
