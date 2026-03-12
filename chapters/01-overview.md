# 第 1 章　项目概览与设计哲学

> "大模型有知识，但没有记忆。" —— mem0 团队

## 1.1 mem0 是什么

mem0（读作 "mem-zero"）是一个为 AI Agent 和 AI 助手设计的**智能记忆层**。它解决的核心问题是：每次对话结束后，AI 忘记了一切。

没有记忆的 AI 助手就像每天早上失忆的服务员——你每次都要重新解释你的饮食偏好、工作习惯、家庭情况。这不仅低效，更让个性化体验成为空谈。

mem0 的方案：在每次对话后，**自动提取有价值的事实**，存入向量数据库（和可选的知识图谱），在下次对话时**语义检索**相关记忆注入上下文。

```
用户: "我不吃辣，给我推荐一家上海本帮菜"
                ↓
mem0.add(messages, user_id="alice")
  → LLM 提取: ["不吃辣", "在上海", "喜欢本帮菜"]
  → 写入向量库
                ↓
下次对话: mem0.search("推荐餐厅", user_id="alice")
  → 返回: ["不吃辣", "在上海", "喜欢本帮菜"]
  → 注入 system prompt
  → AI 知道 Alice 不吃辣
```

## 1.2 核心价值主张

官方基准测试（LOCOMO benchmark）数据：

| 指标 | mem0 vs OpenAI Memory | mem0 vs Full Context |
|------|----------------------|---------------------|
| 准确率 | **+26%** | — |
| 响应速度 | — | **91% 更快** |
| Token 用量 | — | **减少 90%** |

Full Context 方案（把所有历史对话塞进 prompt）有两个致命问题：
1. **延迟**：上下文越长，首 token 时间越长
2. **成本**：百万 token 的历史记录费用惊人

mem0 通过"提炼 → 存储 → 按需检索"把 O(n) 的上下文长度压缩为 O(k)（k 为检索条数）。

## 1.3 架构演进：从 embedchain 到 mem0 v1.0

```
2023 年: embedchain
  ↓ 专注于 RAG 管道
  ↓ 缺乏个性化记忆能力

2024 年: mem0 诞生（原名 EmbedChain Memory）
  ↓ 专注 AI 记忆层
  ↓ 开源 + 托管平台双轨制

2025 年 4 月: mem0 v1.0.0
  ↓ API 现代化重构
  ↓ 增强 Vector Store 支持（20+）
  ↓ GCP 集成增强
  ↓ 引入 actor_id 多角色体系
  ↓ 结构化输出优化
```

**v1.0 的核心破坏性变更：**
- `user_id`/`agent_id`/`run_id` 现在全部为 keyword-only 参数
- 引入 `actor_id` 细粒度角色追踪
- 向量维度自动推断

## 1.4 整体架构图

```
┌─────────────────────────────────────────────────────────┐
│                    用户 / Agent 代码                     │
└────────────────────────┬────────────────────────────────┘
                         │
              ┌──────────▼──────────┐
              │   Memory / Client   │  ← 统一入口
              └──────────┬──────────┘
                         │
         ┌───────────────┼───────────────┐
         ▼               ▼               ▼
   ┌──────────┐   ┌──────────┐   ┌──────────────┐
   │  LLM 层  │   │ Embedder │   │  SQLite 历史  │
   │ 事实提取 │   │  向量化  │   │   审计日志    │
   └────┬─────┘   └────┬─────┘   └──────────────┘
        │              │
        ▼              ▼
   ┌─────────────────────────┐
   │      向量存储层          │
   │  Qdrant / Pinecone /    │
   │  PGVector / Chroma ...  │
   └───────────┬─────────────┘
               │
               ▼  (可选)
   ┌─────────────────────────┐
   │       图存储层           │
   │    Neo4j MemoryGraph    │
   └─────────────────────────┘
```

## 1.5 两种使用模式

### 自托管（Open Source）

```python
from mem0 import Memory

m = Memory()  # 默认: OpenAI LLM + Qdrant 内存模式
m.add("我喜欢喝绿茶", user_id="alice")
results = m.search("饮品偏好", user_id="alice")
```

所有组件在本地运行，数据不离开你的机器。

### 托管平台（Mem0 Platform）

```python
from mem0 import MemoryClient

client = MemoryClient(api_key="m0-xxx")
client.add("我喜欢喝绿茶", user_id="alice")
results = client.search("饮品偏好", user_id="alice")
```

API 接口完全相同，后端由 mem0 团队管理，提供分析看板和企业级安全。

## 1.6 三种记忆范围

mem0 支持三个维度的记忆隔离：

| 维度 | 参数 | 适用场景 |
|------|------|----------|
| **用户记忆** | `user_id` | 跨会话的个人偏好 |
| **Agent 记忆** | `agent_id` | Agent 自身的程序性知识 |
| **会话记忆** | `run_id` | 单次对话的上下文 |

这三个维度可以组合使用：

```python
# 既有用户维度，又有会话维度
m.add(messages, user_id="alice", run_id="session-001")
```

## 1.7 AI 记忆生态：同类项目一览

在 mem0 诞生和流行的过程中，这一赛道也涌现出多个值得关注的项目。理解这些项目的定位差异，有助于在实际工程中做出合适的选型。

### 1.7.1 Zep / Graphiti

- **GitHub**：`getzep/graphiti`（20,000+ stars）
- **核心理念**：**时序知识图谱**（Temporal Knowledge Graph）
- **技术特点**：
  - 以图数据库（Neo4j / FalkorDB）为核心存储，天然擅长实体关系推理
  - 时序感知：每条关系都有时间戳，能追踪"Alice 以前住北京，后来搬到上海"这类变化
  - 检索延迟极低：官方报告 **sub-200ms**，在 LoCoMo benchmark 单次检索准确率 **80.32%**，超过 mem0
  - 支持 MCP Server，可直接与 Claude、Cursor 等工具集成
- **定位**：企业级知识图谱记忆，特别适合需要追踪实体关系变化的客服、CRM 类场景

```python
from graphiti_core import Graphiti

g = Graphiti(neo4j_uri, neo4j_user, neo4j_password)
await g.add_episode(name="chat", episode_body="Alice moved to Shanghai last month")
results = await g.search("Alice's location")
```

### 1.7.2 Letta（前身：MemGPT）

- **GitHub**：`letta-ai/letta`
- **核心理念**：**有状态 Agent**，模拟操作系统的内存分层
- **技术特点**：
  - 受操作系统启发的三层记忆架构：
    - **Core Memory**（核心记忆）：类似 RAM，始终在上下文中，Agent 可直接读写
    - **Archival Memory**（归档记忆）：类似硬盘，无限容量的外部存储，通过函数调用检索
    - **Recall Memory**（召回记忆）：对话历史的语义检索
  - Agent 可以**自主管理自己的记忆**——决定什么时候压缩、转移或检索
  - 支持 Agent 跨会话学习和自我改进
- **定位**：构建真正"有自我意识"的长期 Agent，适合研究场景和需要深度个性化的 Agent

```python
from letta import create_client

client = create_client()
agent = client.create_agent(
    memory=ChatMemory(human="用户是一名工程师", persona="你是一个乐于助人的助手")
)
response = client.send_message(agent_id=agent.id, message="你还记得我做什么的吗？")
```

### 1.7.3 LangChain Memory

- **GitHub**：`langchain-ai/langchain`（内置模块）
- **核心理念**：**可组合的记忆类型菜单**，灵活但需要自行组装
- **技术特点**：
  - 提供多种开箱即用的记忆类型：
    - `ConversationBufferMemory`：保留完整对话历史
    - `ConversationSummaryMemory`：用 LLM 压缩摘要
    - `ConversationEntityMemory`：提取命名实体
    - `VectorStoreRetrieverMemory`：向量检索历史
    - `ConversationKGMemory`：知识图谱记忆
  - 可以自由组合，接入任意向量库或数据库
  - 深度集成 LangChain 生态（Chain、Agent、LCEL）
- **定位**：LangChain 用户的首选，灵活但需要自行管理持久化

### 1.7.4 OpenMemory（mem0 官方）

- **GitHub**：`mem0ai/mem0/openmemory`（mem0 仓库子目录）
- **核心理念**：**本地优先的跨应用记忆层**，通过 MCP 协议打通不同 AI 工具
- **技术特点**：
  - 本地运行，数据完全私有
  - MCP Server 实现：让 Claude Desktop、Cursor、Windsurf 等工具共享同一份记忆
  - 提供 Web UI 管理记忆
- **定位**：个人用户的私有记忆基础设施，把 mem0 的能力带给各类 AI 工具

### 1.7.5 Google Memory Bank（Agent Development Kit）

- **发布时间**：2025 年 7 月
- **核心理念**：**全托管的 Agent 记忆 API**，零配置接入
- **技术特点**：
  - 通过 Google ADK（Agent Development Kit）一行代码接入
  - 自动提取、存储、检索，无需关心底层存储
  - 兼容 LangGraph、LlamaIndex 等主流框架
  - 企业级 SLA，深度集成 GCP 生态
- **定位**：Google Cloud 用户的托管记忆方案，适合已在 GCP 上构建 Agent 的团队

## 1.8 同类项目横向对比

### 8.1 核心维度对比

| 项目 | 记忆提取方式 | 存储后端 | 部署方式 | 开源协议 |
|------|------------|---------|---------|---------|
| **mem0** | LLM 事实提取 | 向量库（20+）+ Neo4j | 自托管 / 云托管 | Apache 2.0 |
| **Zep / Graphiti** | 图结构实体提取 | Neo4j / FalkorDB | 自托管 / 云托管 | Apache 2.0 |
| **Letta (MemGPT)** | Agent 自主管理 | 向量库 + 本地 DB | 自托管 / 云托管 | Apache 2.0 |
| **LangChain Memory** | 多种可选策略 | 任意（可插拔） | 随应用部署 | MIT |
| **OpenMemory** | mem0 内核 | 本地向量库 | 纯本地 | Apache 2.0 |
| **Google Memory Bank** | 全自动（闭源） | GCP 托管 | 纯云 | 闭源 |

### 8.2 性能与精度对比

| 项目 | LoCoMo 基准准确率 | 检索延迟 | Token 效率 |
|------|-----------------|---------|-----------|
| **Zep / Graphiti** | **80.32%**（单次） | sub-200ms | 中等 |
| **mem0** | 74%（vs OpenAI Memory +26%） | 中等 | **减少 90%** |
| **Full Context** | — | 慢（随长度线性增长） | 极差 |
| **LangChain Buffer** | — | 最快 | 最差（全量） |

### 8.3 设计哲学对比

这四个项目代表了 AI 记忆的四种不同思路：

```
Zep / Graphiti    → "记忆是一张图"
                    实体关系是第一等公民，时序变化有明确表达

mem0              → "记忆是精炼的事实"
                    从对话中蒸馏出结构化事实，向量库 + 可选图

Letta / MemGPT    → "记忆是 Agent 的意识"
                    Agent 像操作系统一样自主管理内存分层

LangChain Memory  → "记忆是可组合的管道"
                    把记忆拆解为可插拔组件，由开发者自由组装
```

### 8.4 场景选型建议

| 场景 | 推荐方案 | 理由 |
|------|---------|------|
| 个性化 AI 助手 / 客服机器人 | **mem0** | 用户偏好提取最成熟，向量库生态最广 |
| 需要实体关系推理（CRM、知识库） | **Zep / Graphiti** | 时序图原生支持实体追踪和关系推理 |
| 构建自主学习的长期 Agent | **Letta** | Agent 自主记忆管理，支持跨会话自我改进 |
| 已有 LangChain 应用，需要快速接入 | **LangChain Memory** | 无缝集成，学习成本最低 |
| 全部跑在 GCP 上 | **Google Memory Bank** | 托管零运维，深度集成 ADK |
| 个人使用，需要多工具共享记忆 | **OpenMemory** | 本地私有，MCP 协议打通 Claude/Cursor |

## 1.9 为什么选择 mem0

在同类项目中，mem0 的优势在于：

**对比 Zep / Graphiti：**
- mem0 不依赖图数据库，部署门槛更低
- mem0 向量库生态更广（20+ vs 2），适合已有基础设施的团队
- Zep 精确率更高，但 mem0 的向量方案在大多数场景够用

**对比 Letta：**
- mem0 面向"应用开发者"，Letta 面向"Agent 研究者"
- mem0 的 API 更简单（add/search），Letta 需要定义 Agent 架构

**对比 LangChain Memory：**
- mem0 是独立的基础设施，不绑定框架
- mem0 内置去重和冲突消解，LangChain Memory 需要自己处理

**对比 Google Memory Bank：**
- mem0 开源可控，数据不依赖 GCP
- mem0 支持更多向量库和 LLM 提供商

## 1.10 小结

mem0 的本质是把"记忆"这件事从 AI 应用开发者的负担，变成一个可插拔的基础设施组件。它的设计哲学是：

1. **LLM 驱动的智能提取**：不是简单存储原始对话，而是提炼有价值的事实
2. **向量语义检索**：按需取用，不是全量加载
3. **可插拔架构**：LLM、Embedder、向量库都可以替换
4. **开源 + 托管双轨**：灵活满足不同合规需求
5. **41,000+ GitHub stars**：2025 年增长最快的 AI 基础设施项目之一

在 AI 记忆的四种哲学（图 / 事实 / 意识 / 管道）中，mem0 选择了"精炼事实 + 向量检索"这条最平衡的路——易用、高效、生态广泛。

下一章，我们将深入仓库结构，理解 mem0 的代码组织方式。
