# 第 11 章　Embedder：文本向量化层

## 11.1 Embedder 的职责

在 mem0 的管线中，Embedder 负责两类操作：

```python
# 写入时：把记忆文本转换为向量
embeddings = self.embedding_model.embed("喜欢绿茶", memory_action="add")
# → [0.023, -0.145, 0.321, ...]  # 1536 维浮点数

# 搜索时：把查询文本转换为向量
query_vector = self.embedding_model.embed("饮品偏好", memory_action="search")
```

向量化质量直接决定检索精度。相似的语义（"喜欢绿茶" 和 "爱喝茶"）在向量空间中距离近，不相关的内容距离远。

## 11.2 EmbeddingBase 接口

```python
class EmbeddingBase(ABC):
    def __init__(self, config: Optional[BaseEmbedderConfig] = None):
        self.config = config or BaseEmbedderConfig()

    @abstractmethod
    def embed(
        self,
        text: str,
        memory_action: Optional[Literal["add", "search", "update"]] = None
    ) -> List[float]:
        """返回文本的向量表示"""
        pass
```

`memory_action` 参数的设计意图：部分 Embedder（如 Matryoshka embeddings）支持针对不同操作使用不同的向量化策略——写入时用完整维度，查询时可以用更小的维度降低成本。大多数实现忽略此参数。

## 11.3 OpenAI Embedder（默认）

```python
class OpenAIEmbedding(EmbeddingBase):
    def __init__(self, config=None):
        super().__init__(config)
        self.config.model = self.config.model or "text-embedding-3-small"
        self.config.embedding_dims = self.config.embedding_dims or 1536

        self.client = OpenAI(
            api_key=self.config.api_key or os.getenv("OPENAI_API_KEY"),
            base_url=self.config.openai_base_url or os.getenv("OPENAI_BASE_URL"),
        )

    def embed(self, text, memory_action=None):
        text = text.replace("\n", " ")  # 换行符影响 embedding 质量
        return (
            self.client.embeddings.create(
                input=[text],
                model=self.config.model,
                dimensions=self.config.embedding_dims,
            )
            .data[0]
            .embedding
        )
```

**可用模型**：

| 模型 | 维度 | 特点 |
|------|------|------|
| `text-embedding-3-small` | 1536（默认） | 高性价比，绝大多数场景够用 |
| `text-embedding-3-large` | 3072 | 最高精度，成本更高 |
| `text-embedding-ada-002` | 1536 | 旧版，仍可用 |

`text-embedding-3` 系列支持 **Matryoshka 维度缩减**：可以指定更小的 `dimensions`（如 512），在降低成本的同时保持合理精度。

## 11.4 支持的 Embedder 列表

| Provider | 类 | 默认模型 | 特点 |
|---------|-----|---------|------|
| `openai` | `OpenAIEmbedding` | text-embedding-3-small | 默认，云端，高质量 |
| `gemini` | `GeminiEmbedding` | models/embedding-001 | Google，多语言强 |
| `azure_openai` | `AzureOpenAIEmbedding` | 同 OpenAI | Azure 合规场景 |
| `ollama` | `OllamaEmbedding` | nomic-embed-text | 本地运行，零费用 |
| `huggingface` | `HuggingFaceEmbedding` | 自定义 | 开源模型，可微调 |
| `fastembed` | `FastEmbedEmbedding` | BAAI/bge-small-en-v1.5 | 极速本地推理 |
| `lmstudio` | `LMStudioEmbedding` | 自定义 | LM Studio 本地服务 |
| `together` | `TogetherAIEmbedding` | 自定义 | Together.ai 托管 |
| `vertexai` | `VertexAIEmbedding` | text-embedding-004 | GCP |
| `aws_bedrock` | `AWSBedrockEmbedding` | amazon.titan-embed-text | AWS 合规 |

## 11.5 HuggingFace Embedder：本地模型

```python
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

常用的开源 Embedding 模型：

| 模型 | 维度 | 大小 | 特点 |
|------|------|------|------|
| `all-MiniLM-L6-v2` | 384 | 22M | 轻量快速，英文 |
| `all-mpnet-base-v2` | 768 | 110M | 高质量英文 |
| `BAAI/bge-m3` | 1024 | 570M | 多语言，中文强 |
| `BAAI/bge-large-zh-v1.5` | 1024 | 330M | 中文专用，最佳 |
| `intfloat/multilingual-e5-large` | 1024 | 560M | 多语言平衡 |

**中文场景推荐**：`BAAI/bge-large-zh-v1.5` 或 `BAAI/bge-m3`。

## 11.6 FastEmbed：高速本地推理

```python
config = MemoryConfig(
    embedder=EmbedderConfig(
        provider="fastembed",
        config={
            "model": "BAAI/bge-small-en-v1.5",
            "embedding_dims": 384,
        }
    )
)
```

FastEmbed 是 Qdrant 团队开发的高性能推理库，特点：
- 使用 ONNX Runtime，比 PyTorch 快 2-4x
- 首次使用自动下载模型并缓存
- 无需 GPU，CPU 即可高速推理

## 11.7 Ollama Embedder：完全本地化

```python
config = MemoryConfig(
    embedder=EmbedderConfig(
        provider="ollama",
        config={
            "model": "nomic-embed-text",
            "embedding_dims": 768,
            "ollama_base_url": "http://localhost:11434",
        }
    )
)
```

搭配 Ollama 本地 LLM，可以实现**零 API 费用的完全本地化 mem0**：

```python
# 完全本地化配置
config = MemoryConfig(
    llm=LlmConfig(
        provider="ollama",
        config={"model": "llama3.2", "ollama_base_url": "http://localhost:11434"}
    ),
    embedder=EmbedderConfig(
        provider="ollama",
        config={"model": "nomic-embed-text", "ollama_base_url": "http://localhost:11434"}
    ),
    vector_store=VectorStoreConfig(
        provider="qdrant",
        config={"path": "/tmp/mem0_local"}
    )
)
```

## 11.8 维度的重要性

向量维度影响两件事：

1. **精度**：更高维度通常意味着更好的语义表达能力
2. **存储/速度**：维度越高，存储占用越大，相似度计算越慢

**关键约束**：embedding 的维度必须与向量库中的集合维度一致。mem0 在创建集合时会把 `embedding_model_dims` 传入向量库，之后不能修改。换模型时需要重建集合并重新嵌入所有记忆。

```python
# 如果维度不匹配，会报错
config = MemoryConfig(
    embedder=EmbedderConfig(
        provider="openai",
        config={"embedding_dims": 3072}  # large 模型
    ),
    vector_store=VectorStoreConfig(
        provider="qdrant",
        config={"embedding_model_dims": 3072}  # 必须一致
    )
)
```

## 11.9 小结

Embedder 层的设计原则：
- **单一方法**：`embed()` 是唯一公开接口
- **provider 解耦**：支持 10+ 提供商，云端和本地均可
- **维度传递**：embedding 维度通过 config 传递给向量库，保持一致性

选择 Embedder 的核心考量：云端 API（OpenAI/Gemini）精度高但有成本，本地模型（Ollama/HuggingFace）零成本但需要硬件资源。中文场景建议用 BGE 系列。下一章解析 Reranker。
