# 第 9 章　向量存储抽象层设计

## 9.1 为什么需要向量存储抽象

mem0 支持 20+ 向量数据库，但用户代码永远只看到这几行：

```python
self.vector_store.insert(vectors, ids, payloads)
self.vector_store.search(query, vectors, limit, filters)
self.vector_store.update(vector_id, vector, payload)
self.vector_store.delete(vector_id)
```

不管底层是 Qdrant、Pinecone 还是 PostgreSQL pgvector，接口完全一致。这是经典的**适配器模式（Adapter Pattern）**。

## 9.2 VectorStoreBase 接口

```python
# mem0/vector_stores/base.py
from abc import ABC, abstractmethod

class VectorStoreBase(ABC):
    @abstractmethod
    def create_col(self, name, vector_size, distance): ...   # 创建集合

    @abstractmethod
    def insert(self, vectors, payloads=None, ids=None): ...  # 插入向量

    @abstractmethod
    def search(self, query, vectors, limit=5, filters=None): # 相似度搜索
        ...

    @abstractmethod
    def delete(self, vector_id): ...                         # 按 ID 删除

    @abstractmethod
    def update(self, vector_id, vector=None, payload=None): # 更新向量/payload

    @abstractmethod
    def get(self, vector_id): ...                           # 按 ID 获取

    @abstractmethod
    def list_cols(self): ...                                # 列出所有集合

    @abstractmethod
    def delete_col(self): ...                               # 删除集合

    @abstractmethod
    def col_info(self): ...                                 # 集合信息

    @abstractmethod
    def list(self, filters=None, limit=None): ...           # 列出记忆

    @abstractmethod
    def reset(self): ...                                    # 清空重建
```

11 个抽象方法，覆盖向量库的完整操作面。

## 9.3 VectorStoreConfig：配置校验与懒加载

```python
# mem0/vector_stores/configs.py
class VectorStoreConfig(BaseModel):
    provider: str = "qdrant"
    config: Optional[Dict] = None

    _provider_configs: Dict[str, str] = {
        "qdrant":    "QdrantConfig",
        "pinecone":  "PineconeConfig",
        "pgvector":  "PGVectorConfig",
        "chroma":    "ChromaDbConfig",
        "faiss":     "FAISSConfig",
        "milvus":    "MilvusDBConfig",
        "redis":     "RedisDBConfig",
        "weaviate":  "WeaviateConfig",
        # ... 20+ 个
    }

    @model_validator(mode="after")
    def validate_and_create_config(self):
        provider = self.provider
        # 动态 import 对应的 Config 类
        module = __import__(
            f"mem0.configs.vector_stores.{provider}",
            fromlist=[self._provider_configs[provider]],
        )
        config_class = getattr(module, self._provider_configs[provider])
        # 如果没传 path，自动设置默认路径
        if "path" not in config and "path" in config_class.__annotations__:
            config["path"] = f"/tmp/{provider}"
        self.config = config_class(**config)
        return self
```

关键设计：**懒加载（Lazy Import）**。只有在使用某个 provider 时，才会 import 对应的模块（如 `qdrant_client`、`pinecone` 等）。这意味着安装 mem0 后，不需要同时安装所有向量库的 SDK，只安装你要用的那个即可。

## 9.4 VectorStoreFactory：工厂创建

```python
# mem0/utils/factory.py
class VectorStoreFactory:
    provider_to_class = {
        "qdrant":    "mem0.vector_stores.qdrant.Qdrant",
        "pinecone":  "mem0.vector_stores.pinecone.PineconeDB",
        "pgvector":  "mem0.vector_stores.pgvector.PGVector",
        "chroma":    "mem0.vector_stores.chroma.ChromaDB",
        "faiss":     "mem0.vector_stores.faiss.FAISS",
        "milvus":    "mem0.vector_stores.milvus.MilvusDB",
        # ...
    }

    @classmethod
    def create(cls, provider_name: str, config):
        if provider_name not in cls.provider_to_class:
            raise ValueError(f"Unsupported vector store provider: {provider_name}")

        class_type = cls.provider_to_class[provider_name]
        vector_store_class = load_class(class_type)  # 动态 import

        # config 是 Pydantic 模型，转成 dict 传给构造函数
        if hasattr(config, "model_dump"):
            return vector_store_class(**config.model_dump())
        return vector_store_class(**config)
```

`load_class()` 通过字符串路径动态加载类：

```python
def load_class(class_type):
    module_path, class_name = class_type.rsplit(".", 1)
    module = importlib.import_module(module_path)
    return getattr(module, class_name)
```

## 9.5 支持的向量库全表

| Provider | 类 | 特点 |
|---------|-----|------|
| `qdrant` | `Qdrant` | 默认，支持内存/本地/远程，Rust 实现 |
| `pinecone` | `PineconeDB` | 全托管，serverless，最流行的云向量库 |
| `pgvector` | `PGVector` | PostgreSQL 扩展，已有 PG 用户首选 |
| `chroma` | `ChromaDB` | 本地友好，开发测试常用 |
| `faiss` | `FAISS` | Facebook，纯本地，高性能 |
| `milvus` | `MilvusDB` | 分布式，大规模场景 |
| `weaviate` | `WeaviateDB` | 内置 GraphQL，schema 丰富 |
| `mongodb` | `MongoDB` | MongoDB Atlas Vector Search |
| `elasticsearch` | `Elasticsearch` | 已有 ES 基础设施的团队 |
| `redis` | `RedisDB` | Redis Vector Similarity Search |
| `supabase` | `Supabase` | pgvector on Supabase |
| `azure_ai_search` | `AzureAISearch` | Azure Cognitive Search |
| `vertex_ai_vector_search` | `GoogleMatchingEngine` | GCP Vertex AI |
| `opensearch` | `OpenSearch` | AWS 管理的 OpenSearch |
| `cassandra` | `Cassandra` | 大规模分布式场景 |
| `databricks` | `Databricks` | Databricks Vector Search |
| `s3_vectors` | `S3Vectors` | AWS S3 原生向量存储（2025 新增）|
| `upstash_vector` | `UpstashVector` | Serverless Redis 系 |
| `baidu` | `BaiduDB` | 百度向量数据库 |
| `valkey` | `Valkey` | Redis fork，开源替代 |

## 9.6 统一数据模型

所有向量库操作共享一个返回数据模型（隐式契约）：

**写入格式**（传入）：

```python
# insert() 的输入
vectors:  List[List[float]]   # 向量列表
payloads: List[Dict]          # 元数据列表（包含 data、hash、user_id 等）
ids:      List[str]           # UUID 列表
```

**搜索结果**（返回）：

```python
# search() 的返回（每个元素需有以下属性）
result.id         # str：记忆 UUID
result.score      # float：相似度分数
result.payload    # dict：存储时的完整元数据
  └── result.payload["data"]       # 记忆文本
  └── result.payload["user_id"]    # 用户 ID
  └── result.payload["created_at"] # 创建时间
  └── ...
```

不同向量库的 SDK 返回格式各异，适配器的职责就是把各家格式统一为这个结构。

## 9.7 Qdrant：默认实现解析

Qdrant 是 mem0 的默认向量库，支持三种运行模式：

```python
# 模式 1：纯内存（开发测试，重启即清空）
config = {"path": ":memory:"}

# 模式 2：本地持久化（单机部署）
config = {"path": "/tmp/qdrant"}

# 模式 3：远程服务器（生产环境）
config = {
    "host": "localhost",
    "port": 6333,
    "api_key": "optional-for-cloud",
}

# 模式 4：Qdrant Cloud（全托管）
config = {
    "url": "https://xxx.qdrant.io",
    "api_key": "qdrant-cloud-api-key",
}
```

Qdrant 的过滤器实现：

```python
def _create_filter(self, filters: dict) -> Filter:
    conditions = []
    for key, value in filters.items():
        if isinstance(value, dict) and "gte" in value and "lte" in value:
            # 范围过滤
            conditions.append(
                FieldCondition(key=key, range=Range(gte=value["gte"], lte=value["lte"]))
            )
        else:
            # 精确匹配
            conditions.append(
                FieldCondition(key=key, match=MatchValue(value=value))
            )
    return Filter(must=conditions) if conditions else None
```

payload 索引：对于远程 Qdrant，自动为 `user_id`、`agent_id`、`run_id`、`actor_id` 创建 keyword 索引，加速过滤查询。本地模式不支持 payload 索引。

## 9.8 切换向量库的代价

从一个向量库切换到另一个，**只需改配置，不需要改业务代码**：

```python
# 从 Qdrant 切换到 Pinecone
config = MemoryConfig(
    vector_store=VectorStoreConfig(
        provider="pinecone",        # ← 只改这里
        config={
            "api_key": "pc-xxx",
            "index_name": "my-memories",
            "embedding_model_dims": 1536,
        }
    )
)
m = Memory(config)
# 其余代码完全不变
```

唯一的代价：**已有数据不会自动迁移**。你需要自行导出旧数据并导入新库。

## 9.9 小结

mem0 向量存储抽象层的设计体现了两个重要原则：

1. **依赖倒置**：Memory 类依赖 VectorStoreBase 抽象，不依赖任何具体实现
2. **开闭原则**：新增一个向量库只需新建一个 Impl 类 + 在 Factory 注册，不需要改核心代码

这个设计让 mem0 能以极低成本扩展到 20+ 向量库，也让用户能灵活迁移而不被技术锁定。

下一章，我们深入解析几个最常用的向量库实现细节。
