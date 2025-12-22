import os
import time

from typing import Literal

from memos.configs.mem_cube import GeneralMemCubeConfig
from memos.configs.utils import get_json_file_model_schema
from memos.exceptions import ConfigurationError, MemCubeError
from memos.log import get_logger
from memos.mem_cube.base import BaseMemCube
from memos.mem_cube.utils import download_repo, merge_config_with_default
from memos.memories.activation.base import BaseActMemory
from memos.memories.factory import MemoryFactory
from memos.memories.parametric.base import BaseParaMemory
from memos.memories.textual.base import BaseTextMemory
from memos.embedders.factory import EmbedderFactory
from memos.memos_tools.singleton import _factory_singleton


logger = get_logger(__name__)


class GeneralMemCube(BaseMemCube):
    """MemCube is a box for loading and dumping three types of memories."""

    def __init__(self, config: GeneralMemCubeConfig):
        """Initialize the MemCube with a configuration."""
        self.config = config
        
        # Log embedder configuration for debugging and clear cache if needed
        if config.text_mem.backend != "uninitialized":
            text_mem_config = config.text_mem.config
            if hasattr(text_mem_config, 'embedder') and hasattr(text_mem_config.embedder, 'backend'):
                embedder_backend = text_mem_config.embedder.backend
                logger.info(
                    f"🔧 GeneralMemCube.__init__: Creating text_mem with embedder backend: {embedder_backend}"
                )
                # Clear embedder factory cache to ensure new config is used
                # This is important when config changes (e.g., from ollama to universal_api)
                try:
                    _factory_singleton.clear_cache(EmbedderFactory)
                    logger.debug("✅ Cleared embedder factory cache to ensure fresh instance")
                except Exception as e:
                    logger.warning(f"Failed to clear embedder cache: {e}")
        
        time_start = time.time()
        self._text_mem: BaseTextMemory | None = (
            MemoryFactory.from_config(config.text_mem)
            if config.text_mem.backend != "uninitialized"
            else None
        )
        logger.info(f"init_text_mem in {time.time() - time_start} seconds")
        self._act_mem: BaseActMemory | None = (
            MemoryFactory.from_config(config.act_mem)
            if config.act_mem.backend != "uninitialized"
            else None
        )
        self._para_mem: BaseParaMemory | None = (
            MemoryFactory.from_config(config.para_mem)
            if config.para_mem.backend != "uninitialized"
            else None
        )
        self._pref_mem: BaseTextMemory | None = (
            MemoryFactory.from_config(config.pref_mem)
            if config.pref_mem.backend != "uninitialized"
            else None
        )

    def load(
        self,
        dir: str,
        memory_types: list[Literal["text_mem", "act_mem", "para_mem", "pref_mem"]] | None = None,
    ) -> None:
        """Load memories.
        Args:
            dir (str): The directory containing the memory files.
            memory_types (list[str], optional): List of memory types to load.
                If None, loads all available memory types.
                Options: ["text_mem", "act_mem", "para_mem", "pref_mem"]
        """
        loaded_schema = get_json_file_model_schema(os.path.join(dir, self.config.config_filename))
        if loaded_schema != self.config.model_schema:
            raise ConfigurationError(
                f"Configuration schema mismatch. Expected {self.config.model_schema}, "
                f"but found {loaded_schema}."
            )

        # If no specific memory types specified, load all
        if memory_types is None:
            memory_types = ["text_mem", "act_mem", "para_mem", "pref_mem"]

        # Load specified memory types
        if "text_mem" in memory_types and self.text_mem:
            self.text_mem.load(dir)
            logger.debug(f"Loaded text_mem from {dir}")

        if "act_mem" in memory_types and self.act_mem:
            self.act_mem.load(dir)
            logger.info(f"Loaded act_mem from {dir}")

        if "para_mem" in memory_types and self.para_mem:
            self.para_mem.load(dir)
            logger.info(f"Loaded para_mem from {dir}")

        if "pref_mem" in memory_types and self.pref_mem:
            self.pref_mem.load(dir)
            logger.info(f"Loaded pref_mem from {dir}")

        logger.info(f"MemCube loaded successfully from {dir} (types: {memory_types})")

    def dump(
        self,
        dir: str,
        memory_types: list[Literal["text_mem", "act_mem", "para_mem", "pref_mem"]] | None = None,
    ) -> None:
        """Dump memories.
        Args:
            dir (str): The directory where the memory files will be saved.
            memory_types (list[str], optional): List of memory types to dump.
                If None, dumps all available memory types.
                Options: ["text_mem", "act_mem", "para_mem", "pref_mem"]
        """
        if os.path.exists(dir) and os.listdir(dir):
            raise MemCubeError(
                f"Directory {dir} is not empty. Please provide an empty directory for dumping."
            )

        # Always dump config
        self.config.to_json_file(os.path.join(dir, self.config.config_filename))

        # If no specific memory types specified, dump all
        if memory_types is None:
            memory_types = ["text_mem", "act_mem", "para_mem", "pref_mem"]

        # Dump specified memory types
        if "text_mem" in memory_types and self.text_mem:
            self.text_mem.dump(dir)
            logger.info(f"Dumped text_mem to {dir}")

        if "act_mem" in memory_types and self.act_mem:
            self.act_mem.dump(dir)
            logger.info(f"Dumped act_mem to {dir}")

        if "para_mem" in memory_types and self.para_mem:
            self.para_mem.dump(dir)
            logger.info(f"Dumped para_mem to {dir}")

        if "pref_mem" in memory_types and self.pref_mem:
            self.pref_mem.dump(dir)
            logger.info(f"Dumped pref_mem to {dir}")

        logger.info(f"MemCube dumped successfully to {dir} (types: {memory_types})")

    @staticmethod
    def init_from_dir(
        dir: str,
        memory_types: list[Literal["text_mem", "act_mem", "para_mem", "pref_mem"]] | None = None,
        default_config: GeneralMemCubeConfig | None = None,
    ) -> "GeneralMemCube":
        """Create a MemCube instance from a MemCube directory.

        Args:
            dir (str): The directory containing the memory files.
            memory_types (list[str], optional): List of memory types to load.
                If None, loads all available memory types.
            default_config (GeneralMemCubeConfig, optional): Default configuration to merge with existing config.
                If provided, will merge general settings while preserving critical user-specific fields.

        Returns:
            MemCube: An instance of MemCube loaded with memories from the specified directory.
        """
        config_path = os.path.join(dir, "config.json")
        existing_config = GeneralMemCubeConfig.from_json_file(config_path)
        
        # Log existing embedder config
        if existing_config.text_mem.backend != "uninitialized":
            existing_embedder = existing_config.text_mem.config.embedder
            logger.info(
                f"🔧 init_from_dir: Existing embedder config: backend={existing_embedder.backend}"
            )

        # Merge with default config if provided
        if default_config is not None:
            # Log default embedder config
            if default_config.text_mem.backend != "uninitialized":
                default_embedder = default_config.text_mem.config.embedder
                logger.info(
                    f"🔧 init_from_dir: Default embedder config: backend={default_embedder.backend}"
                )
            
            config = merge_config_with_default(existing_config, default_config)
            
            # Log merged embedder config
            if config.text_mem.backend != "uninitialized":
                merged_embedder = config.text_mem.config.embedder
                logger.info(
                    f"✅ init_from_dir: Merged embedder config: backend={merged_embedder.backend}, "
                    f"cube_id={config.cube_id}"
                )
        else:
            config = existing_config
            logger.warning(
                f"⚠️ init_from_dir: No default_config provided, using existing config for cube {config.cube_id}"
            )
            
            # 即使没有 default_config，也尝试修复配置中的问题
            config_dict = config.model_dump()
            config_modified = False
            
            if config.text_mem.backend != "uninitialized":
                text_mem_config = config_dict.get("text_mem", {}).get("config", {})
                
                # 修复 LLM 配置中的 api_base
                for llm_key in ["extractor_llm", "dispatcher_llm"]:
                    if llm_key in text_mem_config:
                        llm_config = text_mem_config[llm_key].get("config", {})
                        if "api_base" in llm_config:
                            api_base = llm_config["api_base"]
                            if api_base and api_base.endswith("/v1"):
                                logger.warning(
                                    f"🔧 Fixing {llm_key} api_base: removing /v1 suffix from {api_base}"
                                )
                                llm_config["api_base"] = api_base[:-3].rstrip("/")
                                config_modified = True
                
                # 修复 embedder 配置
                embedder_backend = None
                embedder_model = None
                if "embedder" in text_mem_config:
                    embedder_dict = text_mem_config["embedder"]
                    embedder_backend = embedder_dict.get("backend")
                    if "config" in embedder_dict:
                        embedder_config = embedder_dict["config"]
                        embedder_model = embedder_config.get("model_name_or_path", "")
                        # 检查并修复 embedder 配置
                        if "base_url" in embedder_config:
                            base_url = embedder_config["base_url"]
                            # 先检查是否是 DeepSeek（应该使用 sentence_transformer）
                            # 需要检查原始 base_url（可能包含 /v1）和修复后的 base_url
                            base_url_to_check = base_url
                            if base_url and base_url.endswith("/v1"):
                                base_url_to_check = base_url[:-3].rstrip("/")
                            
                            if base_url_to_check and "deepseek" in base_url_to_check.lower() and embedder_dict.get("backend") == "universal_api":
                                logger.warning(
                                    f"🔧 Detected DeepSeek API in embedder config ({base_url}), but DeepSeek doesn't support embeddings. "
                                    f"Force replacing with sentence_transformer."
                                )
                                # 强制替换为 sentence_transformer
                                embedder_dict["backend"] = "sentence_transformer"
                                embedder_dict["config"] = {
                                    "model_name_or_path": os.getenv(
                                        "MOS_EMBEDDER_MODEL", "nomic-ai/nomic-embed-text-v1.5"
                                    ),
                                }
                                embedder_backend = "sentence_transformer"
                                embedder_model = embedder_dict["config"]["model_name_or_path"]
                                config_modified = True
                            # 如果不是 DeepSeek，修复 base_url 中的 /v1 后缀
                            elif base_url and base_url.endswith("/v1"):
                                logger.warning(
                                    f"🔧 Fixing embedder base_url: removing /v1 suffix from {base_url}"
                                )
                                embedder_config["base_url"] = base_url[:-3].rstrip("/")
                                config_modified = True
                
                # 修复向量维度配置（根据 embedder 模型）
                if embedder_backend == "sentence_transformer" and embedder_model and "nomic-embed-text-v1.5" in embedder_model:
                    # 检查 text_mem.config.graph_db 配置中的 vec_config
                    if "graph_db" in text_mem_config:
                        graph_db_config = text_mem_config["graph_db"].get("config", {})
                        if "vec_config" in graph_db_config:
                            vec_config = graph_db_config["vec_config"].get("config", {})
                            if "vector_dimension" in vec_config and vec_config["vector_dimension"] != 768:
                                logger.warning(
                                    f"🔧 Fixing vector_dimension: changing from {vec_config['vector_dimension']} to 768 for nomic-embed-text-v1.5"
                                )
                                vec_config["vector_dimension"] = 768
                                graph_db_config["embedding_dimension"] = 768
                                config_modified = True
                        # 也修复 embedding_dimension（如果没有 vec_config）
                        elif "embedding_dimension" in graph_db_config and graph_db_config["embedding_dimension"] != 768:
                            logger.warning(
                                f"🔧 Fixing embedding_dimension: changing from {graph_db_config['embedding_dimension']} to 768 for nomic-embed-text-v1.5"
                            )
                            graph_db_config["embedding_dimension"] = 768
                            # 如果有 vec_config，也修复它
                            if "vec_config" in graph_db_config:
                                vec_config = graph_db_config["vec_config"].get("config", {})
                                if "vector_dimension" in vec_config:
                                    vec_config["vector_dimension"] = 768
                            config_modified = True
            
            # 如果配置被修改，重新验证并保存
            if config_modified:
                config = GeneralMemCubeConfig.model_validate(config_dict)
                logger.info(f"✅ Fixed configuration issues in cube {config.cube_id}")
                # 保存修复后的配置回文件，避免下次加载时再次修复
                try:
                    config.to_json_file(config_path)
                    logger.info(f"✅ Saved fixed configuration to {config_path}")
                except Exception as e:
                    logger.warning(f"Failed to save fixed configuration: {e}")
                # 清除 embedder 和 LLM 缓存，确保使用新的配置
                try:
                    from memos.embedders.factory import EmbedderFactory
                    from memos.llms.factory import LLMFactory
                    from memos.llms.openai import OpenAILLM, AzureLLM
                    _factory_singleton.clear_cache(EmbedderFactory)
                    _factory_singleton.clear_cache(LLMFactory)
                    OpenAILLM.clear_cache()
                    AzureLLM.clear_cache()
                    logger.info("✅ Cleared embedder and LLM factory cache after fixing config")
                except Exception as e:
                    logger.warning(f"Failed to clear cache: {e}")
        
        mem_cube = GeneralMemCube(config)
        mem_cube.load(dir, memory_types)
        return mem_cube

    @staticmethod
    def init_from_remote_repo(
        cube_id: str,
        base_url: str = "https://huggingface.co/datasets",
        memory_types: list[Literal["text_mem", "act_mem", "para_mem", "pref_mem"]] | None = None,
        default_config: GeneralMemCubeConfig | None = None,
    ) -> "GeneralMemCube":
        """Create a MemCube instance from a remote repository.

        Args:
            cube_id (str): The repository name.
            base_url (str): The base URL of the remote repository.
            memory_types (list[str], optional): List of memory types to load.
                If None, loads all available memory types.
            default_config (GeneralMemCubeConfig, optional): Default configuration to merge with existing config.

        Returns:
            MemCube: An instance of MemCube loaded with memories from the specified remote repository.
        """
        dir = download_repo(cube_id, base_url)
        return GeneralMemCube.init_from_dir(dir, memory_types, default_config)

    @property
    def text_mem(self) -> "BaseTextMemory | None":
        """Get the textual memory."""
        if self._text_mem is None:
            logger.warning("Textual memory is not initialized. Returning None.")
        return self._text_mem

    @text_mem.setter
    def text_mem(self, value: BaseTextMemory) -> None:
        """Set the textual memory."""
        if not isinstance(value, BaseTextMemory):
            raise TypeError(f"Expected BaseTextMemory, got {type(value).__name__}")
        self._text_mem = value

    @property
    def act_mem(self) -> "BaseActMemory | None":
        """Get the activation memory."""
        if self._act_mem is None:
            logger.warning("Activation memory is not initialized. Returning None.")
        return self._act_mem

    @act_mem.setter
    def act_mem(self, value: BaseActMemory) -> None:
        """Set the activation memory."""
        if not isinstance(value, BaseActMemory):
            raise TypeError(f"Expected BaseActMemory, got {type(value).__name__}")
        self._act_mem = value

    @property
    def para_mem(self) -> "BaseParaMemory | None":
        """Get the parametric memory."""
        if self._para_mem is None:
            logger.warning("Parametric memory is not initialized. Returning None.")
        return self._para_mem

    @para_mem.setter
    def para_mem(self, value: BaseParaMemory) -> None:
        """Set the parametric memory."""
        if not isinstance(value, BaseParaMemory):
            raise TypeError(f"Expected BaseParaMemory, got {type(value).__name__}")
        self._para_mem = value

    @property
    def pref_mem(self) -> "BaseTextMemory | None":
        """Get the preference memory."""
        if self._pref_mem is None:
            logger.warning("Preference memory is not initialized. Returning None.")
        return self._pref_mem

    @pref_mem.setter
    def pref_mem(self, value: BaseTextMemory) -> None:
        """Set the preference memory."""
        if not isinstance(value, BaseTextMemory):
            raise TypeError(f"Expected BaseTextMemory, got {type(value).__name__}")
        self._pref_mem = value
