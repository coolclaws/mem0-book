# 完整目录

## 第一部分：宏观认知

| 章节 | 标题 | 核心内容 |
|------|------|----------|
| 第 1 章 | [项目概览与设计哲学](/chapters/01-overview) | mem0 是什么、解决什么问题、v1.0 架构演进、性能基准 |
| 第 2 章 | [仓库结构与模块依赖](/chapters/02-repo-structure) | Monorepo 布局、Python/TS 双栈、依赖关系图 |
| 第 3 章 | [MemoryConfig：统一配置体系](/chapters/03-config) | Pydantic 配置模型、五大子配置、环境变量与默认值 |

## 第二部分：核心记忆管线

| 章节 | 标题 | 核心内容 |
|------|------|----------|
| 第 4 章 | [MemoryBase：抽象接口设计](/chapters/04-memory-base) | ABC 接口、CRUD 契约、多会话 ID 体系 |
| 第 5 章 | [Memory.add：记忆提取与写入](/chapters/05-memory-add) | 消息解析 → 事实提取 → 向量写入完整管线 |
| 第 6 章 | [Memory.search：语义检索管线](/chapters/06-memory-search) | 向量相似度 + Reranker + 过滤器组合 |
| 第 7 章 | [记忆更新与冲突解消](/chapters/07-memory-update) | LLM 决策 ADD/UPDATE/DELETE/NOOP，去重逻辑 |
| 第 8 章 | [SQLite 历史追踪系统](/chapters/08-history) | history.db 设计、schema 迁移、变更审计 |

## 第三部分：向量存储生态

| 章节 | 标题 | 核心内容 |
|------|------|----------|
| 第 9 章 | [向量存储抽象层设计](/chapters/09-vector-store-base) | VectorStoreBase 接口、VectorStoreFactory、懒加载机制 |
| 第 10 章 | [主流向量数据库实现解析](/chapters/10-vector-store-impl) | Qdrant、Pinecone、PGVector、Chroma、FAISS 实现对比 |
| 第 11 章 | [Embedder：文本向量化层](/chapters/11-embedder) | OpenAI/Gemini/HuggingFace/FastEmbed，维度与批量化 |
| 第 12 章 | [Reranker：重排序优化](/chapters/12-reranker) | Cohere/SentenceTransformer/LLM Reranker，延迟 vs 精度 |

## 第四部分：图记忆系统

| 章节 | 标题 | 核心内容 |
|------|------|----------|
| 第 13 章 | [MemoryGraph：知识图谱记忆](/chapters/13-graph-memory) | Neo4j 集成、图向量混合检索、节点索引设计 |
| 第 14 章 | [实体提取与关系构建](/chapters/14-entity-relation) | Cypher 生成、BM25 混合检索、关系更新策略 |

## 第五部分：LLM 集成层

| 章节 | 标题 | 核心内容 |
|------|------|----------|
| 第 15 章 | [LLM 抽象层与 Factory 模式](/chapters/15-llm-layer) | BaseLLM 接口、15+ 提供商适配、结构化输出 |
| 第 16 章 | [Prompt 工程：事实提取与记忆决策](/chapters/16-prompts) | FACT_RETRIEVAL_PROMPT、UPDATE_MEMORY_PROMPT 设计解析 |

## 第六部分：客户端与平台

| 章节 | 标题 | 核心内容 |
|------|------|----------|
| 第 17 章 | [Python SDK：自托管与托管双模式](/chapters/17-python-sdk) | Memory vs MemoryClient，API Key 托管平台 |
| 第 18 章 | [TypeScript SDK 与跨平台集成](/chapters/18-ts-sdk) | mem0ai npm 包，Node.js/浏览器双端 |
| 第 19 章 | [REST API Server](/chapters/19-api-server) | FastAPI Server，Docker 部署，端点设计 |
| 第 20 章 | [框架集成：LangGraph / CrewAI / AutoGen](/chapters/20-integrations) | 带记忆的 Agent 工程模式，实战代码 |

## 附录

| 附录 | 标题 |
|------|------|
| [附录 A](/chapters/appendix-a-reading-path) | 推荐阅读路径 |
| [附录 B](/chapters/appendix-b-config-reference) | 配置速查表 |
| [附录 C](/chapters/appendix-c-glossary) | 名词解释 |
