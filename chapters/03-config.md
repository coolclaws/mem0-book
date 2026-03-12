# 第 3 章　MemoryConfig：统一配置体系

## 3.1 配置的核心地位

在 mem0 中，`MemoryConfig` 是整个系统的神经中枢。`Memory.__init__()` 接收一个 `MemoryConfig` 实例，从中读取所有子系统的配置，依次初始化 LLM、Embedder、向量库、历史数据库和图存储。

```python
class Memory(MemoryBase):
    def __init__(self, config: MemoryConfig = MemoryConfig()):
        self.config = config
        self.embedding_model = EmbedderFactory.create(
            self.config.embedder.provider,
            self.config.embedder.config,
            self.config.vector_store.config,
        )
        self.vector_store = VectorStoreFactory.create(
            self.config.vector_store.provider, self.config.vector_store.config
        )
        self.llm = LlmFactory.create(self.config.llm.provider, self.config.llm.config)
        self.db = SQLiteManager(self.config.history_db_path)
        # ...
```

## 3.2 MemoryConfig 结构

`MemoryConfig` 定义在 `mem0/configs/base.py`：

```python
class MemoryConfig(BaseModel):
    vector_store: VectorStoreConfig        # 向量存储配置
    llm: LlmConfig                         # LLM 配置
    embedder: EmbedderConfig               # 嵌入模型配置
    history_db_path: str                   # SQLite 路径
    graph_store: GraphStoreConfig          # 图存储配置（可选）
    reranker: Optional[RerankerConfig]     # 重排序器（可选）
    version: str                           # API 版本（"v1.1"）
    custom_fact_extraction_prompt: Optional[str]  # 自定义提取 Prompt
    custom_update_memory_prompt: Optional[str]    # 自定义更新 Prompt
```

七个字段，五个子配置对象，两个自定义 Prompt 字段。

## 3.3 子配置详解

### 3.3.1 LlmConfig

```python
# mem0/llms/configs.py
class LlmConfig(BaseModel):
    provider: str = "openai"
    config: Optional[BaseLlmConfig] = None
```

使用方式：

```python
from mem0 import Memory
from mem0.configs.base import MemoryConfig
from mem0.llms.configs import LlmConfig

config = MemoryConfig(
    llm=LlmConfig(
        provider="anthropic",
        config={
            "model": "claude-opus-4-5",
            "temperature": 0,
            "max_tokens": 2000,
        }
    )
)
m = Memory(config)
```

支持的 provider 列表（来自 `LlmFactory.provider_to_class`）：

| Provider | 类 | 特点 |
|---------|-----|------|
| `openai` | `OpenAILLM` | 默认，gpt-4.1-nano |
| `anthropic` | `AnthropicLLM` | Claude 系列 |
| `gemini` | `GeminiLLM` | Google Gemini |
| `azure_openai` | `AzureOpenAILLM` | Azure 托管 |
| `ollama` | `OllamaLLM` | 本地模型 |
| `groq` | `GroqLLM` | 高速推理 |
| `deepseek` | `DeepSeekLLM` | DeepSeek 系列 |
| `aws_bedrock` | `AWSBedrockLLM` | AWS 托管 |
| `litellm` | `LiteLLM` | 通用适配器 |
| `openai_structured` | `OpenAIStructuredLLM` | 结构化输出专用 |
| `vllm` | `VllmLLM` | vLLM 部署 |

### 3.3.2 EmbedderConfig

```python
class EmbedderConfig(BaseModel):
    provider: str = "openai"
    config: Optional[BaseEmbedderConfig] = None
```

```python
# 使用 HuggingFace 本地 Embedder
config = MemoryConfig(
    embedder=EmbedderConfig(
        provider="huggingface",
        config={
            "model": "sentence-transformers/all-MiniLM-L6-v2",
            "embedding_dims": 384,
        }
    )
)
```

### 3.3.3 VectorStoreConfig

```python
class VectorStoreConfig(BaseModel):
    provider: str = "qdrant"
    config: Optional[BaseVectorStoreConfig] = None
```

```python
# 使用 Pinecone
config = MemoryConfig(
    vector_store=VectorStoreConfig(
        provider="pinecone",
        config={
            "api_key": "pc-xxx",
            "index_name": "my-memories",
            "embedding_model_dims": 1536,
        }
    )
)
```

### 3.3.4 GraphStoreConfig

```python
class GraphStoreConfig(BaseModel):
    provider: str = "neo4j"
    config: Optional[Neo4jConfig] = None
```

图存储是可选的。当 `config.graph_store.config` 不为空时，`Memory.__init__()` 才会初始化图存储：

```python
if self.config.graph_store.config:
    provider = self.config.graph_store.provider
    self.graph = GraphStoreFactory.create(provider, self.config)
    self.enable_graph = True
```

### 3.3.5 RerankerConfig

```python
class RerankerConfig(BaseModel):
    provider: str
    config: Optional[BaseRerankerConfig] = None
```

重排序器也是可选的，用于在向量检索后对结果重排序：

```python
config = MemoryConfig(
    reranker=RerankerConfig(
        provider="cohere",
        config={"model": "rerank-english-v3.0", "top_n": 5}
    )
)
```

## 3.4 两种配置方式

### 方式一：字典 → from_config()

```python
config_dict = {
    "llm": {
        "provider": "anthropic",
        "config": {"model": "claude-haiku-4-5"}
    },
    "vector_store": {
        "provider": "qdrant",
        "config": {"host": "localhost", "port": 6333}
    },
    "embedder": {
        "provider": "openai",
        "config": {"model": "text-embedding-3-small"}
    }
}

m = Memory.from_config(config_dict)
```

`from_config()` 内部调用 `_process_config()` 做预处理（主要处理图存储和嵌入维度的联动），然后构造 `MemoryConfig(**config_dict)`。

### 方式二：Pydantic 对象

```python
from mem0.configs.base import MemoryConfig
from mem0.llms.configs import LlmConfig
from mem0.embeddings.configs import EmbedderConfig

config = MemoryConfig(
    llm=LlmConfig(provider="openai"),
    embedder=EmbedderConfig(provider="openai"),
)
m = Memory(config)
```

## 3.5 默认配置

```python
Memory()  # 等价于 Memory(MemoryConfig())
```

默认配置：
- LLM: `openai/gpt-4.1-nano-2025-04-14`
- Embedder: `openai/text-embedding-3-small`（1536 维）
- 向量库: `qdrant`（内存模式）
- 历史数据库: `~/.mem0/history.db`
- 图存储: 禁用
- Reranker: 禁用

## 3.6 环境变量

mem0 遵循"约定优于配置"原则，大多数配置从环境变量读取：

```bash
# LLM
OPENAI_API_KEY=sk-xxx
ANTHROPIC_API_KEY=sk-ant-xxx
GEMINI_API_KEY=xxx

# 向量库
QDRANT_URL=http://localhost:6333
PINECONE_API_KEY=pc-xxx

# 数据目录
MEM0_DIR=/custom/path/.mem0
```

工厂类创建实例时会自动读取相关环境变量，无需在配置中显式传入。

## 3.7 MemoryItem：记忆的数据结构

存储和返回的记忆条目统一用 `MemoryItem` 表示：

```python
class MemoryItem(BaseModel):
    id: str              # UUID，唯一标识符
    memory: str          # 提炼后的记忆文本
    hash: Optional[str]  # 内容 hash，用于去重
    metadata: Optional[Dict[str, Any]]  # 用户ID等元数据
    score: Optional[float]              # 检索相似度分数
    created_at: Optional[str]           # 创建时间 ISO 格式
    updated_at: Optional[str]           # 最后更新时间
```

一条典型的记忆记录：

```json
{
    "id": "3a1b2c3d-...",
    "memory": "喜欢喝绿茶，不喜欢咖啡",
    "hash": "a1b2c3d4...",
    "metadata": {"user_id": "alice"},
    "score": 0.92,
    "created_at": "2026-03-12T10:00:00Z",
    "updated_at": "2026-03-12T10:00:00Z"
}
```

## 3.8 自定义 Prompt

mem0 的两个最强自定义点：

```python
config = MemoryConfig(
    # 覆盖事实提取 Prompt
    custom_fact_extraction_prompt="""
    你是一个专业的金融信息整理员。
    从对话中提取用户的投资偏好、风险承受能力等金融相关信息。
    返回 JSON 格式: {"facts": ["事实1", "事实2"]}
    """,
    
    # 覆盖记忆更新 Prompt
    custom_update_memory_prompt="""
    对比新旧记忆，决定如何更新：
    - ADD: 新信息
    - UPDATE: 已有信息有变化
    - DELETE: 信息过时
    - NOOP: 重复，无需操作
    """
)
```

这让 mem0 能够适应不同领域（医疗、金融、教育）的特定知识提取需求。

## 3.9 小结

`MemoryConfig` 的设计体现了 mem0 的两个核心理念：

1. **开箱即用**：所有配置都有合理默认值，`Memory()` 一行即可运行
2. **完全可定制**：通过配置可以替换任何组件，甚至 Prompt

下一章，我们进入 `MemoryBase`，理解 mem0 的接口契约设计。
