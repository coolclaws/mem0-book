# 附录 B　配置速查表

## MemoryConfig 完整字段

```python
from mem0.configs.base import MemoryConfig

config = MemoryConfig(
    llm=...,                          # LlmConfig
    embedder=...,                     # EmbedderConfig
    vector_store=...,                 # VectorStoreConfig
    graph_store=...,                  # GraphStoreConfig（可选）
    reranker=...,                     # RerankerConfig（可选）
    history_db_path="~/.mem0/history.db",
    version="v1.1",
    custom_fact_extraction_prompt=None,
    custom_update_memory_prompt=None,
)
```

## LLM 配置速查

```python
from mem0.llms.configs import LlmConfig

# OpenAI（默认）
LlmConfig(provider="openai", config={
    "model": "gpt-4.1-nano-2025-04-14",  # 默认
    "temperature": 0,
    "max_tokens": 2000,
    "api_key": "sk-xxx",               # 或 OPENAI_API_KEY
    "openai_base_url": "...",          # 自定义 base URL
})

# Anthropic
LlmConfig(provider="anthropic", config={
    "model": "claude-opus-4-5",
    "temperature": 0,
    "max_tokens": 2000,
    "api_key": "sk-ant-xxx",           # 或 ANTHROPIC_API_KEY
})

# Google Gemini
LlmConfig(provider="gemini", config={
    "model": "gemini-2.0-flash",
    "temperature": 0,
    "api_key": "xxx",                  # 或 GEMINI_API_KEY
})

# Ollama（本地）
LlmConfig(provider="ollama", config={
    "model": "llama3.2",
    "ollama_base_url": "http://localhost:11434",
    "temperature": 0,
})

# Azure OpenAI
LlmConfig(provider="azure_openai", config={
    "model": "gpt-4",
    "azure_deployment": "my-deployment",
    "azure_endpoint": "https://xxx.openai.azure.com/",
    "api_version": "2024-02-01",
    "api_key": "xxx",
})

# DeepSeek
LlmConfig(provider="deepseek", config={
    "model": "deepseek-chat",
    "api_key": "xxx",                  # 或 DEEPSEEK_API_KEY
})

# LiteLLM（通用）
LlmConfig(provider="litellm", config={
    "model": "together_ai/mistralai/Mixtral-8x7B-Instruct-v0.1",
})
```

## Embedder 配置速查

```python
from mem0.embeddings.configs import EmbedderConfig

# OpenAI（默认）
EmbedderConfig(provider="openai", config={
    "model": "text-embedding-3-small",  # 默认，1536 维
    "embedding_dims": 1536,
    "api_key": "sk-xxx",
})

# Gemini
EmbedderConfig(provider="gemini", config={
    "model": "models/embedding-001",
    "embedding_dims": 768,
    "api_key": "xxx",
})

# HuggingFace（本地）
EmbedderConfig(provider="huggingface", config={
    "model": "BAAI/bge-large-zh-v1.5",  # 中文推荐
    "embedding_dims": 1024,
})

# FastEmbed（高速本地）
EmbedderConfig(provider="fastembed", config={
    "model": "BAAI/bge-small-en-v1.5",
    "embedding_dims": 384,
})

# Ollama（本地）
EmbedderConfig(provider="ollama", config={
    "model": "nomic-embed-text",
    "embedding_dims": 768,
    "ollama_base_url": "http://localhost:11434",
})
```

## 向量库配置速查

```python
from mem0.vector_stores.configs import VectorStoreConfig

# Qdrant（默认，内存模式）
VectorStoreConfig(provider="qdrant", config={
    "collection_name": "mem0",
    "embedding_model_dims": 1536,
    "path": "/tmp/qdrant",  # 本地持久化
    # "host": "localhost", "port": 6333,  # 远程
    # "url": "https://xxx.qdrant.io", "api_key": "xxx",  # 云端
})

# PGVector
VectorStoreConfig(provider="pgvector", config={
    "collection_name": "memories",
    "embedding_model_dims": 1536,
    "dbname": "myapp",
    "user": "postgres",
    "password": "xxx",
    "host": "localhost",
    "port": 5432,
    "hnsw": True,
})

# Pinecone
VectorStoreConfig(provider="pinecone", config={
    "index_name": "my-memories",
    "embedding_model_dims": 1536,
    "api_key": "pc-xxx",               # 或 PINECONE_API_KEY
    "serverless": True,
    "cloud": "aws",
    "region": "us-east-1",
})

# ChromaDB（开发）
VectorStoreConfig(provider="chroma", config={
    "collection_name": "memories",
    "path": "/tmp/chroma",
})

# FAISS（本地大规模）
VectorStoreConfig(provider="faiss", config={
    "collection_name": "memories",
    "embedding_model_dims": 1536,
    "path": "/app/data/faiss",
})

# Redis
VectorStoreConfig(provider="redis", config={
    "collection_name": "memories",
    "embedding_model_dims": 1536,
    "url": "redis://localhost:6379",
})

# Supabase
VectorStoreConfig(provider="supabase", config={
    "collection_name": "memories",
    "embedding_model_dims": 1536,
    "url": "https://xxx.supabase.co",
    "key": "xxx",
})
```

## 图存储配置速查

```python
from mem0.graphs.configs import GraphStoreConfig

# Neo4j
GraphStoreConfig(provider="neo4j", config={
    "url": "bolt://localhost:7687",
    "username": "neo4j",
    "password": "password",
    "database": "neo4j",       # 可选，默认 "neo4j"
    "base_label": False,       # True: 所有节点加 __Entity__ 标签
    "threshold": 0.7,          # 向量相似度阈值
})
```

## Reranker 配置速查

```python
from mem0.configs.rerankers.config import RerankerConfig

# Cohere（推荐）
RerankerConfig(provider="cohere", config={
    "model": "rerank-multilingual-v3.0",  # 或 rerank-english-v3.0
    "top_n": 5,
    "api_key": "xxx",          # 或 COHERE_API_KEY
})

# SentenceTransformer（本地）
RerankerConfig(provider="sentence_transformer", config={
    "model": "cross-encoder/ms-marco-MiniLM-L-6-v2",
    "top_n": 5,
})

# LLM Reranker（最灵活）
RerankerConfig(provider="llm", config={
    "provider": "openai",
    "model": "gpt-4o-mini",
    "top_k": 5,
    "temperature": 0.0,
})

# HuggingFace（中文推荐）
RerankerConfig(provider="huggingface", config={
    "model": "BAAI/bge-reranker-large",
    "top_n": 5,
})
```

## 常用完整配置示例

### 最简单（本地开发）

```python
from mem0 import Memory
m = Memory()  # 全部默认，只需 OPENAI_API_KEY
```

### 完全本地化（零成本）

```python
config = {
    "llm": {"provider": "ollama", "config": {"model": "llama3.2"}},
    "embedder": {"provider": "ollama", "config": {"model": "nomic-embed-text", "embedding_dims": 768}},
    "vector_store": {"provider": "qdrant", "config": {"path": "/tmp/mem0_local", "embedding_model_dims": 768}},
}
m = Memory.from_config(config)
```

### 生产级（PGVector + 中文 BGE）

```python
config = {
    "llm": {"provider": "openai", "config": {"model": "gpt-4.1-nano-2025-04-14"}},
    "embedder": {"provider": "huggingface", "config": {"model": "BAAI/bge-large-zh-v1.5", "embedding_dims": 1024}},
    "vector_store": {"provider": "pgvector", "config": {
        "dbname": "prod_db", "user": "pg", "password": "xxx",
        "host": "db.example.com", "embedding_model_dims": 1024, "hnsw": True,
    }},
    "reranker": {"provider": "huggingface", "config": {"model": "BAAI/bge-reranker-large", "top_n": 5}},
}
m = Memory.from_config(config)
```

### 图记忆（向量 + Neo4j）

```python
config = {
    "llm": {"provider": "openai"},
    "embedder": {"provider": "openai"},
    "vector_store": {"provider": "qdrant", "config": {"path": "/tmp/qdrant"}},
    "graph_store": {"provider": "neo4j", "config": {
        "url": "bolt://localhost:7687", "username": "neo4j", "password": "password"
    }},
}
m = Memory.from_config(config)
```

## 环境变量速查

```bash
# LLM
OPENAI_API_KEY=sk-xxx
ANTHROPIC_API_KEY=sk-ant-xxx
GEMINI_API_KEY=xxx
DEEPSEEK_API_KEY=xxx
GROQ_API_KEY=xxx
OPENROUTER_API_KEY=xxx      # 自动切换到 OpenRouter

# 向量库
PINECONE_API_KEY=pc-xxx

# Reranker
COHERE_API_KEY=xxx

# mem0 托管平台
MEM0_API_KEY=m0-xxx

# 数据目录
MEM0_DIR=/custom/path/.mem0  # 默认 ~/.mem0
```
