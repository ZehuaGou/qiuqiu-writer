import os
import time

from memos.configs.embedder import SenTranEmbedderConfig
from memos.dependency import require_python_package
from memos.embedders.base import BaseEmbedder
from memos.log import get_logger


logger = get_logger(__name__)


class SenTranEmbedder(BaseEmbedder):
    """Sentence Transformer Embedder class."""

    @require_python_package(
        import_name="sentence_transformers",
        install_command="pip install sentence-transformers",
        install_link="https://www.sbert.net/docs/installation.html",
    )
    def __init__(self, config: SenTranEmbedderConfig):
        from sentence_transformers import SentenceTransformer

        self.config = config
        
        # 尝试加载模型，带重试逻辑
        max_retries = 3
        retry_delay = 2  # 秒
        
        for attempt in range(max_retries):
            try:
                logger.info(
                    f"Loading SentenceTransformer model: {self.config.model_name_or_path} "
                    f"(attempt {attempt + 1}/{max_retries})"
                )
                
                # 检查是否使用本地文件（通过环境变量 HF_LOCAL_FILES_ONLY=true）
                local_files_only = os.getenv("HF_LOCAL_FILES_ONLY", "false").lower() == "true"
                if local_files_only:
                    logger.info("HF_LOCAL_FILES_ONLY=true, attempting to use cached model files only")
                
                self.model = SentenceTransformer(
                    self.config.model_name_or_path,
                    trust_remote_code=self.config.trust_remote_code,
                )
                
                logger.info(f"✅ Successfully loaded SentenceTransformer model: {self.config.model_name_or_path}")
                break
                
            except Exception as e:
                error_msg = str(e)
                is_ssl_error = "SSL" in error_msg or "SSLError" in error_msg or "SSL: UNEXPECTED_EOF" in error_msg
                is_network_error = "Connection" in error_msg or "timeout" in error_msg.lower()
                
                if attempt < max_retries - 1:
                    if is_ssl_error or is_network_error:
                        logger.warning(
                            f"⚠️ Network/SSL error loading model (attempt {attempt + 1}/{max_retries}): {error_msg}. "
                            f"Retrying in {retry_delay} seconds..."
                        )
                        time.sleep(retry_delay)
                        retry_delay *= 2  # 指数退避
                    else:
                        # 非网络错误，不重试
                        logger.error(f"❌ Failed to load model: {error_msg}")
                        raise
                else:
                    # 最后一次尝试失败
                    if is_ssl_error or is_network_error:
                        logger.error(
                            f"❌ Failed to load model after {max_retries} attempts due to network/SSL error: {error_msg}\n"
                            f"💡 Suggestions:\n"
                            f"   1. Check your internet connection\n"
                            f"   2. Try setting HF_LOCAL_FILES_ONLY=true if model is already cached\n"
                            f"   3. Manually download the model: huggingface-cli download {self.config.model_name_or_path}\n"
                            f"   4. Use a different embedding model or API"
                        )
                    raise

        if self.config.embedding_dims is not None:
            logger.warning(
                "SentenceTransformer does not support specifying embedding dimensions directly. "
                "The embedding dimension is determined by the model."
                "`embedding_dims` will be ignored."
            )
            # Get embedding dimensions from the model
            self.config.embedding_dims = self.model.get_sentence_embedding_dimension()

    def embed(self, texts: list[str]) -> list[list[float]]:
        """
        Generate embeddings for the given texts.

        Args:
            texts: List of texts to embed.

        Returns:
            List of embeddings, each represented as a list of floats.
        """
        embeddings = self.model.encode(texts, convert_to_numpy=True)
        return embeddings.tolist()
