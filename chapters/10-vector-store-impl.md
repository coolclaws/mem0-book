# 第 10 章　主流向量数据库实现解析

## 10.1 实现模式：共同的骨架

所有向量库适配器都遵循相同的骨架：

```python
class SomeVectorDB(VectorStoreBase):
    def __init__(self, collection_name, embedding_model_dims, **conn_params):
        # 1. 建立连接
        self.client = SomeSDK(**conn_params)
        self.collection_name = collection_name
        self.embedding_model_dims = embedding_model_dims
        # 2. 初始化集合（幂等）
        self.create_col(embedding_model_dims, ...)

    def create_col(self, ...):
        # 集合已存在则跳过
        if self._collection_exists():
            return
        self.client.create_collection(...)

    def insert(self, vectors, payloads, ids):
        # 转换成各家 SDK 的格式后插入
        ...

    def search(self, query, vectors, limit, filters):
        # 把 mem0 的 filters 字典转换成各家 SDK 的过滤格式
        sdk_filter = self._build_filter(filters)
        results = self.client.query(...)
        # 统一包装成 OutputData 格式返回
        return [OutputData(id=r.id, score=r.score, payload=r.metadata) for r in results]
```

核心差异在于：**过滤器的转换逻辑**，每家 SDK 的过滤 API 都不一样。

## 10.2 Qdrant：默认实现

**适用场景**：默认选项，开发到生产全覆盖

Qdrant 用 `Filter + FieldCondition` 构建过滤器：

```python
def _create_filter(self, filters: dict) -> Filter:
    conditions = []
    for key, value in filters.items():
        if isinstance(value, dict) and "gte" in value and "lte" in value:
            conditions.append(FieldCondition(key=key, range=Range(gte=value["gte"], lte=value["lte"])))
        else:
            conditions.append(FieldCondition(key=key, match=MatchValue(value=value)))
    return Filter(must=conditions) if conditions else None
```

三种客户端模式（自动检测）：
```python
if client:               → 直接使用传入的 QdrantClient
elif url or (host+port): → 远程模式（Qdrant 服务器 / Cloud）
else:                    → 本地模式（path，默认 /tmp/qdrant）
```

**内存 vs 磁盘**：默认 `on_disk=False`（内存模式，重启清空）；传入 `on_disk=True` 持久化到 `path`。

**性能特点**：
- Rust 实现，内存效率高
- 支持 HNSW 索引，百万级向量检索毫秒级
- payload 索引加速过滤（仅远程模式）

## 10.3 PGVector：PostgreSQL 扩展

**适用场景**：已有 PostgreSQL 基础设施，不想引入新中间件

```python
# 配置示例
config = MemoryConfig(
    vector_store=VectorStoreConfig(
        provider="pgvector",
        config={
            "dbname": "myapp",
            "user": "postgres",
            "password": "xxx",
            "host": "localhost",
            "port": 5432,
            "hnsw": True,                    # 开启 HNSW 索引
            "collection_name": "memories",
            "embedding_model_dims": 1536,
        }
    )
)
```

底层 SQL 设计：

```sql
-- 建表
CREATE TABLE IF NOT EXISTS {collection_name} (
    id          UUID PRIMARY KEY,
    vector      VECTOR({dims}),    -- pgvector 扩展类型
    payload     JSONB,
    created_at  TIMESTAMP DEFAULT NOW()
);

-- HNSW 索引（加速 ANN 搜索）
CREATE INDEX IF NOT EXISTS {collection_name}_hnsw_idx
ON {collection_name} USING hnsw (vector vector_cosine_ops);

-- 过滤查询
SELECT id, payload, 1 - (vector <=> $1) AS score
FROM {collection_name}
WHERE payload->>'user_id' = $2
ORDER BY vector <=> $1
LIMIT $3;
```

**psycopg 兼容**：自动检测 psycopg3 或 psycopg2，向下兼容。

**连接池**：内置 `ConnectionPool`（最小 1 连接，最大 5 连接），适合高并发场景。

**索引选项**：
- `hnsw=True`：HNSW 索引，平衡速度和精度
- `diskann=True`：DiskANN 索引，超大规模场景（pgvectorscale 扩展）

## 10.4 ChromaDB：开发友好

**适用场景**：本地开发、原型验证、轻量部署

```python
# 内存模式（默认，最简单）
config = {"collection_name": "memories"}

# 本地持久化
config = {"path": "/tmp/chroma", "collection_name": "memories"}

# 远程服务器
config = {"host": "localhost", "port": 8000, "collection_name": "memories"}

# ChromaDB Cloud
config = {"api_key": "xxx", "tenant": "my-tenant", "collection_name": "memories"}
```

ChromaDB 的距离度量默认是 **cosine**（余弦相似度），而 ChromaDB 返回的是距离（越小越好），需要转换：

```python
# mem0 内部转换：distance → similarity score
score = 1 - distance  # 距离 0.1 → 相似度 0.9
```

**特点**：无 Docker 要求，纯 Python 可运行，适合 Jupyter Notebook 原型开发。

## 10.5 FAISS：高性能本地搜索

**适用场景**：大规模本地向量搜索，无网络依赖

Facebook AI Similarity Search，是业界最成熟的向量搜索库。

```python
config = MemoryConfig(
    vector_store=VectorStoreConfig(
        provider="faiss",
        config={
            "path": "/app/data/faiss_index",
            "collection_name": "memories",
            "embedding_model_dims": 1536,
        }
    )
)
```

FAISS 的特殊性：它是一个**索引库**而非数据库，没有内置的元数据存储。mem0 的 FAISS 实现会同时维护一个 SQLite 文件存储 payload：

```
/app/data/faiss_index/
├── index.faiss    # FAISS 向量索引
└── payload.db     # SQLite 存储 id + payload
```

**适合场景**：数百万条记忆的离线批处理，或对延迟极度敏感的本地推理服务。

## 10.6 Pinecone：云端标配

**适用场景**：生产环境，不想运维向量库

```python
config = {
    "api_key": "pc-xxx",
    "index_name": "my-memories",
    "embedding_model_dims": 1536,
    "serverless": True,            # Serverless 模式（按需付费）
    "cloud": "aws",
    "region": "us-east-1",
}
```

Pinecone 的过滤器语法（MongoDB 风格）：

```python
# mem0 的 filters 字典
{"user_id": "alice", "category": "food"}

# 转换为 Pinecone filter
{"user_id": {"$eq": "alice"}, "category": {"$eq": "food"}}
```

**注意**：Pinecone Serverless 的过滤需要 metadata 字段预先声明（部分版本）。

## 10.7 五大主流向量库对比

| 维度 | Qdrant | PGVector | ChromaDB | FAISS | Pinecone |
|------|--------|---------|---------|-------|---------|
| **部署** | 本地/云 | 本地/云 | 本地/云 | 纯本地 | 纯云 |
| **依赖** | 独立服务 | PostgreSQL | 无/独立 | 无 | 无 |
| **过滤性能** | ⭐⭐⭐⭐⭐ | ⭐⭐⭐⭐ | ⭐⭐⭐ | ⭐⭐ | ⭐⭐⭐⭐ |
| **扩展性** | ⭐⭐⭐⭐⭐ | ⭐⭐⭐ | ⭐⭐⭐ | ⭐⭐ | ⭐⭐⭐⭐⭐ |
| **运维复杂度** | 低 | 中（需 PG） | 极低 | 极低 | 无 |
| **成本** | 开源免费 | 开源免费 | 开源免费 | 开源免费 | 按量付费 |
| **最适合** | 通用首选 | 已有 PG | 原型开发 | 大规模本地 | 生产托管 |

## 10.8 如何选择向量库

```
是否已有 PostgreSQL？
  → 是：pgvector（零额外中间件）
  → 否：继续

是否需要本地/私有化部署？
  → 是：Qdrant（推荐）或 FAISS（超大规模）
  → 否：继续

是否在 GCP？
  → 是：Vertex AI Vector Search
  → 否：继续

是否在 AWS？
  → 是：OpenSearch 或 S3 Vectors
  → 否：继续

通用生产环境：
  → Pinecone（全托管，最省心）
  → Qdrant Cloud（开源同款，数据自控）
```

## 10.9 小结

20+ 向量库适配器背后有两个统一的接口契约：
- **输入**：`vectors + payloads + ids`
- **输出**：带有 `id + score + payload` 的结果对象

各实现的差异只在连接管理和过滤器转换，核心逻辑完全一致。下一章，我们解析记忆向量化的另一半：Embedder 层。
