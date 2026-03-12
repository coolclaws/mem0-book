# 附录 C　名词解释（Glossary）

## A

**actor_id**
在多参与方场景（如群聊、多 Agent）中，标识具体发言者的 ID。与 `user_id` 的区别：`user_id` 标识记忆所属的用户，`actor_id` 标识某条消息的说话人。

**add()**
mem0 的核心写入方法。内部触发两次 LLM 调用（事实提取 + 更新决策），再并行写入向量库和图数据库。

**agent_id**
标识 AI Agent 的 ID，用于存储 Agent 自身的程序性知识（工作方法、操作策略等）。与 `user_id` 正交，可组合使用。

**AsyncMemory / AsyncMemoryClient**
`Memory` 和 `MemoryClient` 的异步版本，内部使用 `asyncio`，适合 FastAPI 等异步框架。

## B

**BM25（Best Match 25）**
一种基于词频-逆文档频率的文本检索算法。在 mem0 的图记忆搜索中，用于对向量搜索的结果做二次重排序。

**base_label**
图存储配置项。当为 `True` 时，所有节点统一打上 `__Entity__` 标签，方便批量操作和索引管理。

## C

**collection_name**
向量库中集合（相当于表）的名称，默认为 `"mem0"`。同一个向量库实例可以有多个集合，用于隔离不同应用的记忆。

**Cross-Encoder**
Reranker 使用的模型架构，对查询和文档做联合建模，精度高于 Bi-Encoder（向量搜索），但速度慢。

**custom_fact_extraction_prompt**
覆盖默认 `FACT_RETRIEVAL_PROMPT` 的自定义 Prompt，用于领域特化的事实提取逻辑。

**custom_update_memory_prompt**
覆盖默认 `DEFAULT_UPDATE_MEMORY_PROMPT` 的自定义 Prompt，用于自定义记忆更新/冲突解消规则。

**Cypher**
Neo4j 图数据库的查询语言，类似 SQL。mem0 用 Cypher 进行图节点的 MERGE、MATCH、DELETE 操作。

## D

**DEFAULT_UPDATE_MEMORY_PROMPT**
控制记忆更新决策的核心 Prompt，指导 LLM 在 ADD/UPDATE/DELETE/NONE 四种操作中做出选择。

## E

**EmbeddingBase**
所有 Embedder 适配器的抽象基类，只有一个方法：`embed(text, memory_action)`。

**EmbedderFactory**
动态创建 Embedder 实例的工厂类，通过 provider 字符串（如 `"openai"`）懒加载对应的实现类。

**embedding_model_dims**
向量的维度数，必须与向量库中集合的配置一致。常见值：384（轻量模型）、768、1024、1536（OpenAI 小模型）、3072（OpenAI 大模型）。

**event**
`add()` 返回结果中每条记忆操作的类型，有四种：`ADD`（新增）、`UPDATE`（更新）、`DELETE`（删除）、`NONE`（无变化）。

## F

**FACT_RETRIEVAL_PROMPT**
mem0 的事实提取 Prompt，指导 LLM 从对话中提取有价值的个人信息事实，并以 JSON 格式返回。

**FastEmbed**
Qdrant 团队开发的高性能本地 Embedding 推理库，使用 ONNX Runtime，比 PyTorch 快 2-4x。

**filters**
`search()` 和 `get_all()` 中的过滤参数，支持简单精确匹配和高级运算符（`eq/ne/gt/gte/lt/lte/in/nin/contains/AND/OR/NOT`）。

## G

**GraphStoreFactory**
创建图存储实例的工厂类，当前主要支持 Neo4j。

**graph_memory**
向量记忆的补充，以实体关系三元组（source-relationship-target）的形式存储知识，支持多跳推理。

## H

**hash**
记忆文本的 MD5 hash，存储在向量库的 payload 中，用于快速去重检测。

**history.db**
SQLite 数据库文件（默认路径 `~/.mem0/history.db`），存储每条记忆的完整变更历史（ADD/UPDATE/DELETE 事件）。

**HNSW（Hierarchical Navigable Small World）**
向量近似最近邻（ANN）搜索的索引算法，在 pgvector 和 Qdrant 中可选启用，平衡检索速度和精度。

## I

**infer**
`add()` 的参数，默认 `True`（LLM 智能提取事实）。设为 `False` 时跳过 LLM，直接原始存储消息文本。

## L

**LangGraph**
基于 Pregel 计算模型的 AI Agent 状态机框架，可与 mem0 集成实现带记忆的状态图。

**LLMBase**
所有 LLM 适配器的抽象基类，核心方法：`generate_response(messages, tools, tool_choice)`。

**LlmFactory**
动态创建 LLM 实例的工厂类，支持 15+ 提供商。

## M

**Matryoshka embeddings**
OpenAI text-embedding-3 系列支持的维度缩减技术，可以用更小的维度（如 512）获得合理精度，降低存储和计算成本。

**MemoryBase**
`Memory` 和 `MemoryClient` 共同继承的抽象基类，定义了 7 个接口方法（add/search/get/get_all/update/delete/history）。

**MemoryClient**
连接 mem0 托管平台的客户端，通过 HTTP API 调用云端记忆服务，无需本地组件。

**MemoryConfig**
mem0 的根配置模型（Pydantic BaseModel），包含 LLM、Embedder、向量库、图存储等所有子配置。

**MemoryGraph**
mem0 的图记忆实现类，基于 Neo4j，负责实体提取、关系构建和图搜索。

**MemoryItem**
单条记忆的数据结构（Pydantic 模型），包含 id/memory/hash/metadata/score/created_at/updated_at。

**memory_type**
`add()` 的可选参数，当前仅支持 `"procedural_memory"`（程序性记忆），用于 Agent 存储工作方法。

## N

**NONE event**
在 `add()` 的更新决策中，当新事实与已有记忆语义相同时，LLM 返回 NONE 操作。v1.0 新增：即使内容不变，也会更新 session ID。

## O

**on_disk**
Qdrant 配置项，`True` 时开启磁盘持久化，`False`（默认）时纯内存模式（重启后数据丢失）。

**OpenMemory**
mem0 官方出品的本地 MCP Server，把 mem0 的记忆能力通过 MCP 协议分享给 Claude Desktop、Cursor 等工具。

## P

**payload**
向量库中与向量一起存储的元数据字典，包含记忆文本（`data`）、hash、user_id、created_at 等字段。

**procedural_memory**
程序性记忆，记录 Agent 的工作方法和操作策略，而非用户偏好。通过 `memory_type="procedural_memory"` 触发专用提取 Prompt。

## R

**Reranker**
在向量搜索之后、结果返回之前，用交叉编码器对候选记忆重新排序，提升检索精度。可选组件。

**run_id**
标识单次对话会话的 ID，存储单次对话中的临时记忆，与 `user_id`、`agent_id` 正交，可组合。

## S

**sanitize_relationship_for_cypher()**
对 LLM 生成的关系名做清理，移除非法字符，转为大写下划线格式（如 `"lives in"` → `"LIVES_IN"`），确保 Cypher 安全。

**score**
`search()` 返回的相似度分数（0-1），越高表示与查询越相关。

**SQLiteManager**
管理 `history.db` 的类，提供 `add_history()` 和 `get_history()` 方法，支持线程安全和 Schema 迁移。

## T

**temp_uuid_mapping**
`add()` 内部用于 LLM 交互的整数 ID 映射表。把 UUID 替换为简单整数传给 LLM，避免 UUID 幻觉，用完再还原。

**threshold**
`search()` 的相似度过滤阈值，只返回分数 ≥ threshold 的结果。未设置时返回全部。

**Tool Calling / Function Calling**
LLM 的工具调用能力，在 mem0 的图记忆中用于实体提取、关系建立和冲突解消。

## U

**UPDATE_GRAPH_PROMPT**
图记忆中用于冲突解消的 Prompt，指导 LLM 对比新旧图记忆，决定哪些关系需要更新。

**user_id**
标识记忆所属用户的 ID，是最常用的记忆范围参数。必须与 `agent_id`/`run_id` 三者至少提供一个。

## V

**VectorStoreBase**
所有向量库适配器的抽象基类，定义 11 个方法（insert/search/delete/update/get/list/reset 等）。

**VectorStoreFactory**
动态创建向量库实例的工厂类，支持 20+ 提供商，通过懒加载避免未安装的 SDK 导致 import 错误。

## W

**WAL（Write-Ahead Logging）**
SQLite 的高性能写入模式，mem0 默认未启用，因为历史记录的写入频率通常不高。
