import copy
import logging
import subprocess
import tempfile

from memos.configs.mem_cube import GeneralMemCubeConfig


logger = logging.getLogger(__name__)


def download_repo(repo: str, base_url: str, dir: str | None = None) -> str:
    """Download a repository from a remote source.

    Args:
        repo (str): The repository name.
        base_url (str): The base URL of the remote repository.
        dir (str, optional): The directory where the repository will be downloaded. If None, a temporary directory will be created.
    If a directory is provided, it will be used instead of creating a temporary one.

    Returns:
        str: The local directory where the repository is downloaded.
    """
    if dir is None:
        dir = tempfile.mkdtemp()
    repo_url = f"{base_url}/{repo}"

    # Clone the repo
    subprocess.run(["git", "clone", repo_url, dir], check=True)

    return dir


def merge_config_with_default(
    existing_config: GeneralMemCubeConfig, default_config: GeneralMemCubeConfig
) -> GeneralMemCubeConfig:
    """
    Merge existing cube config with default config, preserving critical fields.

    This method updates general configuration fields (like API keys, model parameters)
    while preserving critical user-specific fields (like user_id, cube_id, graph_db settings).

    Args:
        existing_config (GeneralMemCubeConfig): The existing cube configuration loaded from file
        default_config (GeneralMemCubeConfig): The default configuration to merge from

    Returns:
        GeneralMemCubeConfig: Merged configuration
    """

    # Convert configs to dictionaries
    existing_dict = existing_config.model_dump(mode="json")
    default_dict = default_config.model_dump(mode="json")

    logger.info(
        f"Starting config merge for user {existing_config.user_id}, cube {existing_config.cube_id}"
    )

    # Define fields that should be preserved from existing config
    preserve_fields = {"user_id", "cube_id", "config_filename", "model_schema"}

    # Preserve graph_db from existing config if it exists, but merge some fields
    preserved_graph_db = None
    if "text_mem" in existing_dict and "text_mem" in default_dict:
        existing_text_config = existing_dict["text_mem"].get("config", {})
        default_text_config = default_dict["text_mem"].get("config", {})

        if "graph_db" in existing_text_config and "graph_db" in default_text_config:
            existing_graph_config = existing_text_config["graph_db"]["config"]
            default_graph_config = default_text_config["graph_db"]["config"]
            existing_backend = existing_text_config["graph_db"]["backend"]
            default_backend = default_text_config["graph_db"]["backend"]

            # Detect backend change
            backend_changed = existing_backend != default_backend

            if backend_changed:
                logger.info(
                    f"Detected graph_db backend change: {existing_backend} -> {default_backend}. "
                    f"Migrating configuration..."
                )
                # Start with default config as base when backend changes
                merged_graph_config = copy.deepcopy(default_graph_config)

                # Preserve user-specific fields if they exist in both configs
                preserve_graph_fields = {
                    "auto_create",
                    "user_name",
                    "use_multi_db",
                }
                for field in preserve_graph_fields:
                    if field in existing_graph_config:
                        merged_graph_config[field] = existing_graph_config[field]
                        logger.debug(
                            f"Preserved graph_db field '{field}': {existing_graph_config[field]}"
                        )

                # Clean up backend-specific fields that don't exist in the new backend
                # This approach is generic: remove any field from merged config that's not in default config
                # and not in the preserve list
                fields_to_remove = []
                for field in list(merged_graph_config.keys()):
                    if field not in default_graph_config and field not in preserve_graph_fields:
                        fields_to_remove.append(field)

                for field in fields_to_remove:
                    removed_value = merged_graph_config.pop(field)
                    logger.info(
                        f"Removed {existing_backend}-specific field '{field}' (value: {removed_value}) "
                        f"during migration to {default_backend}"
                    )
            else:
                # Same backend: merge configs while preserving user-specific fields
                logger.debug(f"Same graph_db backend ({default_backend}), merging configurations")
                preserve_graph_fields = {
                    "auto_create",
                    "user_name",
                    "use_multi_db",
                }

                # Start with existing config as base
                merged_graph_config = copy.deepcopy(existing_graph_config)

                # Update with default config except preserved fields
                for key, value in default_graph_config.items():
                    if key not in preserve_graph_fields:
                        merged_graph_config[key] = value
                        logger.debug(
                            f"Updated graph_db field '{key}': {existing_graph_config.get(key)} -> {value}"
                        )

                # Handle use_multi_db transition
                if not default_graph_config.get("use_multi_db", True) and merged_graph_config.get(
                    "use_multi_db", True
                ):
                    merged_graph_config["use_multi_db"] = False
                    # For Neo4j: db_name becomes user_name in single-db mode
                    if "neo4j" in default_backend and "db_name" in merged_graph_config:
                        merged_graph_config["user_name"] = merged_graph_config.get("db_name")
                        merged_graph_config["db_name"] = default_graph_config.get("db_name")
                    logger.info("Transitioned to single-db mode (use_multi_db=False)")

            preserved_graph_db = {
                "backend": default_backend,
                "config": merged_graph_config,
            }

    # Use default config as base
    merged_dict = copy.deepcopy(default_dict)

    # Restore preserved fields from existing config
    for field in preserve_fields:
        if field in existing_dict:
            merged_dict[field] = existing_dict[field]
            logger.debug(f"Preserved field '{field}': {existing_dict[field]}")

    # Restore graph_db if it was preserved
    if preserved_graph_db and "text_mem" in merged_dict:
        merged_dict["text_mem"]["config"]["graph_db"] = preserved_graph_db
        logger.debug(f"Preserved graph_db with merged config: {preserved_graph_db}")
    
    # Log and ensure embedder configuration is from default (not preserved from existing)
    if "text_mem" in merged_dict and "text_mem" in existing_dict:
        existing_embedder = existing_dict["text_mem"].get("config", {}).get("embedder", {})
        merged_embedder = merged_dict["text_mem"].get("config", {}).get("embedder", {})
        existing_backend = existing_embedder.get("backend", "N/A")
        merged_backend = merged_embedder.get("backend", "N/A")
        if existing_backend != merged_backend:
            logger.info(
                f"🔄 Embedder backend changed during merge: {existing_backend} -> {merged_backend}. "
                f"Using default embedder config."
            )
        else:
            logger.debug(f"Embedder backend unchanged: {merged_backend}")
        
        # Ensure embedder config is from default (not from existing)
        # This is already the case since we use default_dict as base, but log to confirm
        if merged_embedder:
            logger.debug(
                f"✅ Using embedder config from default: backend={merged_backend}, "
                f"model={merged_embedder.get('config', {}).get('model_name_or_path', 'N/A')}"
            )

    # Create new config from merged dictionary
    merged_config = GeneralMemCubeConfig.model_validate(merged_dict)
    
    # 修复 LLM 配置中的 api_base（移除 /v1 后缀）
    if merged_config.text_mem.backend != "uninitialized":
        text_mem_config = merged_dict.get("text_mem", {}).get("config", {})
        for llm_key in ["extractor_llm", "dispatcher_llm"]:
            if llm_key in text_mem_config:
                llm_config = text_mem_config[llm_key].get("config", {})
                if "api_base" in llm_config:
                    api_base = llm_config["api_base"]
                    if api_base and api_base.endswith("/v1"):
                        logger.warning(
                            f"🔧 Fixing {llm_key} api_base in merged config: removing /v1 suffix from {api_base}"
                        )
                        llm_config["api_base"] = api_base[:-3].rstrip("/")
                        # 重新验证配置
                        merged_config = GeneralMemCubeConfig.model_validate(merged_dict)
    
    # 强制使用 default_config 中的 embedder 配置，确保使用最新的配置（包括 DeepSeek 检测和 /v1 修复）
    if merged_config.text_mem.backend != "uninitialized" and default_config.text_mem.backend != "uninitialized":
        merged_embedder = merged_config.text_mem.config.embedder
        default_embedder = default_config.text_mem.config.embedder
        
        # 检查是否需要强制替换 embedder 配置
        need_replace = False
        replace_reason = ""
        
        # 1. 如果 backend 是 ollama，强制替换
        if merged_embedder.backend == "ollama":
            need_replace = True
            replace_reason = "ollama backend detected"
        # 2. 如果是 universal_api，检查 base_url 是否包含 /v1 或 DeepSeek
        elif merged_embedder.backend == "universal_api":
            base_url = getattr(merged_embedder, "base_url", None)
            if base_url:
                # 检查是否包含 /v1（应该被移除）
                if base_url.endswith("/v1"):
                    need_replace = True
                    replace_reason = "base_url contains /v1 suffix"
                # 检查是否是 DeepSeek（应该使用 sentence_transformer）
                elif "deepseek" in base_url.lower():
                    need_replace = True
                    replace_reason = "DeepSeek API detected (should use sentence_transformer)"
        
        if need_replace:
            logger.warning(
                f"⚠️ WARNING: Merged embedder config issue detected: {replace_reason}. "
                f"Force replacing with embedder from default config: {default_embedder.backend}"
            )
            # 直接修改 merged_dict 中的 embedder 配置
            if "text_mem" in merged_dict and "config" in merged_dict["text_mem"]:
                merged_dict["text_mem"]["config"]["embedder"] = default_embedder.model_dump()
                # 重新验证配置
                merged_config = GeneralMemCubeConfig.model_validate(merged_dict)
                logger.info(
                    f"✅ Successfully force-replaced embedder to {merged_config.text_mem.config.embedder.backend}"
                )
                # 清除 embedder 缓存，确保使用新的配置
                try:
                    from memos.embedders.factory import EmbedderFactory
                    from memos.memos_tools.singleton import _factory_singleton
                    _factory_singleton.clear_cache(EmbedderFactory)
                    logger.info("✅ Cleared embedder factory cache after replacing embedder config")
                except Exception as e:
                    logger.warning(f"Failed to clear embedder cache: {e}")
        elif merged_embedder.backend != default_embedder.backend:
            # 即使没有检测到问题，如果 backend 不同，也使用 default 的配置
            logger.info(
                f"🔄 Embedder backend mismatch: merged={merged_embedder.backend}, default={default_embedder.backend}. "
                f"Using default embedder config."
            )
            if "text_mem" in merged_dict and "config" in merged_dict["text_mem"]:
                merged_dict["text_mem"]["config"]["embedder"] = default_embedder.model_dump()
                merged_config = GeneralMemCubeConfig.model_validate(merged_dict)
                logger.info(
                    f"✅ Successfully replaced embedder to {merged_config.text_mem.config.embedder.backend}"
                )

    logger.info(
        f"Successfully merged cube config for user {merged_config.user_id}, cube {merged_config.cube_id}, "
        f"embedder_backend={merged_config.text_mem.config.embedder.backend if merged_config.text_mem.backend != 'uninitialized' else 'N/A'}"
    )

    return merged_config
