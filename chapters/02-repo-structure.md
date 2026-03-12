# 第 2 章　仓库结构与模块依赖

## 2.1 顶层目录一览

```
mem0/                           # 根目录
├── mem0/                       # 核心 Python 包
│   ├── memory/                 # 记忆管线核心
│   ├── vector_stores/          # 向量数据库适配器（20+）
│   ├── llms/                   # LLM 适配器（15+）
│   ├── embeddings/             # Embedder 适配器
│   ├── graphs/                 # 图记忆（Neo4j）
│   ├── configs/                # 配置模型（Pydantic）
│   ├── utils/                  # 工厂类、工具函数
│   ├── client/                 # 托管平台客户端
│   ├── reranker/               # 重排序器
│   └── proxy/                  # 代理模式
│
├── mem0-ts/                    # TypeScript SDK
│   └── src/
│       ├── client/             # 托管平台客户端
│       ├── oss/                # 开源自托管
│       └── community/         # 社区贡献
│
├── server/                     # REST API Server (FastAPI)
│   ├── main.py
│   └── docker-compose.yaml
│
├── openmemory/                 # OpenMemory MCP 集成
├── examples/                   # 示例代码
├── cookbooks/                  # Jupyter Notebook 教程
├── tests/                      # 测试套件
├── evaluation/                 # 性能评估
└── embedchain/                 # 前身项目（legacy）
```

## 2.2 核心包：`mem0/`

### 2.2.1 `memory/` —— 记忆管线核心

```
mem0/memory/
├── base.py          # MemoryBase ABC —— 接口契约
├── main.py          # Memory 类 —— 核心实现（2325 行）
├── graph_memory.py  # MemoryGraph —— 图记忆
├── storage.py       # SQLiteManager —— 历史追踪
├── utils.py         # 工具函数（消息解析、事实提取等）
├── setup.py         # 初始化与配置加载
├── telemetry.py     # 匿名遥测
└── kuzu_memory.py   # KuzuDB 图记忆（实验性）
```

`main.py` 是整个项目最重要的文件。它实现了 `Memory` 类，包含：
- `add()` —— 记忆写入管线（~300 行）
- `search()` —— 语义检索
- `update()` / `delete()` / `get()` / `get_all()` —— CRUD 操作
- `history()` —— 变更历史
- `_add_to_vector_store()` —— 向量写入（含去重）

### 2.2.2 `vector_stores/` —— 向量存储生态

```
mem0/vector_stores/
├── base.py              # VectorStoreBase ABC
├── configs.py           # 各存储的配置模型
├── qdrant.py            # Qdrant（默认）
├── pinecone.py          # Pinecone
├── pgvector.py          # PostgreSQL pgvector
├── chroma.py            # ChromaDB
├── faiss.py             # Facebook FAISS
├── milvus.py            # Milvus
├── weaviate.py          # Weaviate
├── mongodb.py           # MongoDB Atlas
├── elasticsearch.py     # Elasticsearch
├── redis.py             # Redis VSS
├── supabase.py          # Supabase
├── azure_ai_search.py   # Azure AI Search
├── vertex_ai_vector_search.py  # Google Vertex AI
├── opensearch.py        # AWS OpenSearch
├── cassandra.py         # Cassandra
├── databricks.py        # Databricks Vector Search
├── s3_vectors.py        # AWS S3 Vectors
└── ...                  # 更多适配器
```

### 2.2.3 `llms/` —— LLM 适配器

```
mem0/llms/
├── base.py              # BaseLLM ABC
├── configs.py           # LLM 配置模型
├── openai.py            # OpenAI（默认）
├── anthropic.py         # Anthropic Claude
├── gemini.py            # Google Gemini
├── azure_openai.py      # Azure OpenAI
├── ollama.py            # 本地 Ollama
├── groq.py              # Groq
├── deepseek.py          # DeepSeek
├── aws_bedrock.py       # AWS Bedrock
├── litellm.py           # LiteLLM（通用适配器）
├── vllm.py              # vLLM
├── openai_structured.py # 结构化输出版
└── ...
```

### 2.2.4 `configs/` —— Pydantic 配置体系

```
mem0/configs/
├── base.py              # MemoryConfig、MemoryItem
├── enums.py             # MemoryType 枚举
├── prompts.py           # 系统 Prompt 模板
├── embeddings/          # Embedder 配置
├── llms/                # LLM 配置（按提供商）
├── rerankers/           # Reranker 配置
└── vector_stores/       # 向量库配置
```

### 2.2.5 `utils/` —— 工厂模式核心

```
mem0/utils/
└── factory.py           # 五大工厂类
    ├── LlmFactory
    ├── EmbedderFactory
    ├── VectorStoreFactory
    ├── GraphStoreFactory
    └── RerankerFactory
```

工厂类通过字符串 provider 名称动态加载实现类，这是 mem0 可插拔架构的关键：

```python
# 用法
llm = LlmFactory.create("anthropic", config)
embedder = EmbedderFactory.create("openai", config, vs_config)
vector_store = VectorStoreFactory.create("qdrant", config)
```

## 2.3 模块依赖关系

```
Memory (main.py)
  ├── depends on → LlmFactory → [openai/anthropic/gemini/...]
  ├── depends on → EmbedderFactory → [openai/huggingface/...]
  ├── depends on → VectorStoreFactory → [qdrant/pinecone/...]
  ├── depends on → SQLiteManager (storage.py)
  ├── depends on → MemoryConfig (configs/base.py)
  └── optional → GraphStoreFactory → MemoryGraph
                   └── depends on → Neo4jGraph
                   └── depends on → EmbedderFactory
                   └── depends on → LlmFactory

MemoryClient (client/main.py)
  └── depends on → mem0 Platform REST API
```

依赖方向是单向的：Memory → Factory → Impl，没有循环依赖。

## 2.4 TypeScript SDK 结构

```
mem0-ts/src/
├── client/
│   ├── main.ts          # MemoryClient（托管平台）
│   ├── project.ts       # 项目级操作
│   └── utils.ts
├── oss/
│   └── ...              # 自托管实现（实验性）
└── community/
    └── ...              # 社区贡献组件
```

TypeScript SDK 主要面向托管平台，API 设计与 Python SDK 保持一致：

```typescript
import MemoryClient from "mem0ai";

const client = new MemoryClient({ apiKey: "m0-xxx" });
await client.add("我喜欢喝绿茶", { user_id: "alice" });
const results = await client.search("饮品偏好", { user_id: "alice" });
```

## 2.5 REST API Server

`server/main.py` 是一个 FastAPI 应用，将 Memory 类封装为 HTTP 端点：

```
POST /v1/memories/         ← Memory.add()
GET  /v1/memories/         ← Memory.get_all()
GET  /v1/memories/{id}     ← Memory.get()
PUT  /v1/memories/{id}     ← Memory.update()
DELETE /v1/memories/{id}   ← Memory.delete()
POST /v1/memories/search/  ← Memory.search()
GET  /v1/memories/{id}/history/ ← Memory.history()
```

通过 Docker Compose 可以快速启动：

```bash
docker compose up
# API 默认在 http://localhost:8000
```

## 2.6 关键文件速查

| 你想了解什么 | 看哪个文件 |
|-------------|-----------|
| add/search 核心逻辑 | `mem0/memory/main.py` |
| 记忆接口契约 | `mem0/memory/base.py` |
| 配置模型定义 | `mem0/configs/base.py` |
| 所有 Prompt | `mem0/configs/prompts.py` |
| 工厂类注册表 | `mem0/utils/factory.py` |
| 向量存储接口 | `mem0/vector_stores/base.py` |
| 图记忆实现 | `mem0/memory/graph_memory.py` |
| 历史追踪 | `mem0/memory/storage.py` |
| REST 端点 | `server/main.py` |

## 2.7 小结

mem0 的仓库是一个设计清晰的 Python 项目：

- **单一入口**：`Memory` 类是所有操作的门面
- **工厂模式**：所有可插拔组件通过 Factory 注册和创建
- **配置驱动**：Pydantic 模型统一管理所有配置
- **关注分离**：记忆管线、存储、LLM、Embedder 各司其职

下一章，我们深入 `MemoryConfig`，理解 mem0 的配置体系如何把这些组件粘合在一起。
