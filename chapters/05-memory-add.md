# 第 5 章　Memory.add：记忆提取与写入管线

## 5.1 全局视角：add() 做了什么

`Memory.add()` 是 mem0 最核心的方法。一次 `add()` 调用涉及：

```
输入消息
    │
    ▼
① 参数校验 + 元数据构建
    │
    ▼
② 视觉消息预处理（可选）
    │
    ├──────────────────────┐
    ▼                      ▼
③ 向量存储写入管线      ④ 图存储写入管线
   （并行执行）             （并行执行）
    │                      │
    └──────────────────────┘
    │
    ▼
⑤ 返回结果
```

向量写入和图写入**并行执行**（`ThreadPoolExecutor`），这是 mem0 降低延迟的重要手段。

## 5.2 并行执行架构

```python
with concurrent.futures.ThreadPoolExecutor() as executor:
    future1 = executor.submit(
        self._add_to_vector_store, messages, processed_metadata, effective_filters, infer
    )
    future2 = executor.submit(
        self._add_to_graph, messages, effective_filters
    )

    concurrent.futures.wait([future1, future2])

    vector_store_result = future1.result()
    graph_result = future2.result()
```

两个子管线独立运行，互不等待，总耗时取决于较慢的那个。

## 5.3 向量存储写入管线：`_add_to_vector_store()`

这是 mem0 的核心逻辑，分为两条路径：

### 路径 A：`infer=False`（原始存储）

```python
if not infer:
    for message_dict in messages:
        if message_dict["role"] == "system":
            continue  # 跳过 system 消息

        per_msg_meta = deepcopy(metadata)
        per_msg_meta["role"] = message_dict["role"]

        # 处理 actor_id（多参与方场景）
        actor_name = message_dict.get("name")
        if actor_name:
            per_msg_meta["actor_id"] = actor_name

        # 直接嵌入并存储原始文本
        msg_embeddings = self.embedding_model.embed(msg_content, "add")
        mem_id = self._create_memory(msg_content, msg_embeddings, per_msg_meta)
```

原始模式：跳过 LLM，直接把每条消息向量化并存储。

### 路径 B：`infer=True`（智能提取，默认）

这条路径有五个关键步骤：

#### 步骤 1：解析消息格式

```python
parsed_messages = parse_messages(messages)
# [{"role": "user", "content": "..."}, ...] → 格式化字符串
```

`parse_messages()` 把消息列表转换为适合 LLM 处理的对话文本格式。

#### 步骤 2：LLM 事实提取（第一次 LLM 调用）

```python
system_prompt, user_prompt = get_fact_retrieval_messages(parsed_messages, is_agent_memory)

response = self.llm.generate_response(
    messages=[
        {"role": "system", "content": system_prompt},
        {"role": "user", "content": user_prompt},
    ],
    response_format={"type": "json_object"},
)

new_retrieved_facts = json.loads(response)["facts"]
# 例如: ["在上海工作", "是软件工程师", "喜欢爬山"]
```

这里有一个重要的分支：如果 `agent_id` 存在且消息中有 assistant 角色，使用 Agent 记忆提取模式（`AGENT_MEMORY_EXTRACTION_PROMPT`），否则使用用户记忆提取模式（`USER_MEMORY_EXTRACTION_PROMPT`）。

#### 步骤 3：检索相关旧记忆

```python
retrieved_old_memory = []
new_message_embeddings = {}

for new_mem in new_retrieved_facts:
    # 为每条新事实生成向量
    messages_embeddings = self.embedding_model.embed(new_mem, "add")
    new_message_embeddings[new_mem] = messages_embeddings

    # 搜索语义相关的旧记忆（Top 5）
    existing_memories = self.vector_store.search(
        query=new_mem,
        vectors=messages_embeddings,
        limit=5,
        filters=search_filters,
    )
    for mem in existing_memories:
        retrieved_old_memory.append({"id": mem.id, "text": mem.payload.get("data", "")})
```

这一步的目的：找出与新事实语义相似的已有记忆，用于后续的冲突解消。

#### 步骤 4：UUID 映射（防止 LLM 幻觉）

```python
temp_uuid_mapping = {}
for idx, item in enumerate(retrieved_old_memory):
    temp_uuid_mapping[str(idx)] = item["id"]
    retrieved_old_memory[idx]["id"] = str(idx)  # UUID → 整数
```

这是一个精妙的工程细节：LLM 在处理 UUID 时容易产生幻觉（捏造 UUID）。把 UUID 替换成简单整数（"0", "1", "2"...），让 LLM 只需处理整数 ID，再用 mapping 表还原。

#### 步骤 5：LLM 决策（第二次 LLM 调用）

```python
function_calling_prompt = get_update_memory_messages(
    retrieved_old_memory,     # 已有相关记忆
    new_retrieved_facts,      # 新提取的事实
    self.config.custom_update_memory_prompt
)

response = self.llm.generate_response(
    messages=[{"role": "user", "content": function_calling_prompt}],
    response_format={"type": "json_object"},
)

new_memories_with_actions = json.loads(response)
```

LLM 返回的格式：

```json
{
    "memory": [
        {"id": "0", "text": "在上海工作", "event": "NONE"},
        {"id": null, "text": "是软件工程师", "event": "ADD"},
        {"id": "1", "text": "以前喜欢跑步，现在喜欢爬山", "event": "UPDATE", "old_memory": "喜欢跑步"}
    ]
}
```

## 5.4 四种记忆操作

```python
for resp in new_memories_with_actions.get("memory", []):
    event_type = resp.get("event")

    if event_type == "ADD":
        # 直接写入向量库
        memory_id = self._create_memory(
            data=action_text,
            existing_embeddings=new_message_embeddings,
            metadata=deepcopy(metadata),
        )

    elif event_type == "UPDATE":
        # 更新已有记忆的文本和向量
        self._update_memory(
            memory_id=temp_uuid_mapping[resp.get("id")],
            data=action_text,
            existing_embeddings=new_message_embeddings,
            metadata=deepcopy(metadata),
        )

    elif event_type == "DELETE":
        # 软删除（历史记录中标记为 is_deleted=1）
        self._delete_memory(memory_id=temp_uuid_mapping[resp.get("id")])

    elif event_type == "NONE":
        # 内容相同，但可能需要更新 session IDs
        if metadata.get("agent_id") or metadata.get("run_id"):
            # 更新 agent_id/run_id，保留内容
            self.vector_store.update(vector_id=memory_id, vector=None, payload=updated_metadata)
```

`NONE` 操作（v1.0 新增）的精妙之处：即使记忆内容没变，也会更新 session 上下文，确保 `run_id` 等会话信息正确关联。

## 5.5 `_create_memory()`：底层写入

```python
def _create_memory(self, data, existing_embeddings=None, metadata=None):
    if existing_embeddings and data in existing_embeddings:
        embeddings = existing_embeddings[data]
    else:
        embeddings = self.embedding_model.embed(data, "add")

    memory_id = str(uuid.uuid4())
    metadata["data"] = data
    metadata["hash"] = hashlib.md5(data.encode()).hexdigest()

    now = datetime.now(pytz.timezone("US/Pacific")).isoformat()
    metadata["created_at"] = now
    metadata["updated_at"] = now

    self.vector_store.insert(
        vectors=[embeddings],
        ids=[memory_id],
        payloads=[metadata],
    )

    # 写入历史记录
    self.db.add_history(
        memory_id=memory_id,
        old_memory=None,
        new_memory=data,
        event="ADD",
        actor_id=metadata.get("actor_id"),
        role=metadata.get("role"),
    )
    return memory_id
```

关键细节：
- **向量复用**：如果之前已经计算过该文本的向量（步骤 3 中计算的），直接复用，避免重复 API 调用
- **hash 字段**：MD5 hash 用于快速去重检查
- **历史记录**：每次写入都同步写入 SQLite 审计日志

## 5.6 程序性记忆（Procedural Memory）

当 `memory_type="procedural_memory"` 且有 `agent_id` 时，走特殊路径：

```python
if agent_id is not None and memory_type == MemoryType.PROCEDURAL.value:
    results = self._create_procedural_memory(messages, metadata=processed_metadata, prompt=prompt)
    return results
```

程序性记忆（Procedural Memory）是 Agent 自身的"操作记忆"——不是关于用户的事实，而是 Agent 积累的工作方法、解题套路：

```python
# Agent 记录自己学到的处理策略
agent_memory.add(
    "当用户询问退款时，先确认订单号，再查询7天内的记录",
    agent_id="support-bot",
    memory_type="procedural_memory"
)
```

## 5.7 视觉消息处理

```python
if self.config.llm.config.get("enable_vision"):
    messages = parse_vision_messages(
        messages, self.llm, self.config.llm.config.get("vision_details")
    )
```

当启用视觉功能时，`parse_vision_messages()` 会处理包含图片 URL 的消息，调用 LLM 的视觉能力生成图片描述，然后将描述文本加入记忆管线。

## 5.8 图存储写入：`_add_to_graph()`

```python
def _add_to_graph(self, messages, filters):
    added_entities = []
    if self.enable_graph:
        if filters.get("filters"):
            filters = filters.get("filters")
        added_entities = self.graph.add(messages, filters)
    return added_entities
```

图存储写入委托给 `MemoryGraph.add()`，它会：
1. 用 LLM 提取消息中的实体和关系
2. 将实体写入 Neo4j 节点
3. 将关系写入 Neo4j 边

第 13、14 章会详细解析图存储管线。

## 5.9 完整时序图

```
add(messages, user_id="alice")
    │
    ├─ _build_filters_and_metadata()
    │
    ├─ ThreadPoolExecutor
    │   ├─ _add_to_vector_store() ─────────────────────┐
    │   │   ├─ parse_messages()                        │
    │   │   ├─ LLM.generate() [事实提取]               │
    │   │   │   → new_facts = ["事实1", "事实2", ...]  │
    │   │   ├─ embedder.embed(new_facts)               │
    │   │   ├─ vector_store.search(new_facts)          │
    │   │   │   → old_memories                        │
    │   │   ├─ LLM.generate() [冲突决策]               │
    │   │   │   → {ADD/UPDATE/DELETE/NONE}            │
    │   │   └─ _create/update/delete_memory()         │
    │   │                                             │
    │   └─ _add_to_graph() ───────────────────────────┘
    │       └─ MemoryGraph.add()
    │
    └─ return {"results": [...], "relations": [...]}
```

## 5.10 小结

`Memory.add()` 的两次 LLM 调用是 mem0 的灵魂：

1. **第一次 LLM**：把"原始对话"变成"结构化事实"
2. **第二次 LLM**：把"新旧事实对比"变成"精确的增删改决策"

这种设计让 mem0 的记忆保持**精简、不重复、始终最新**。而并行执行向量和图存储、向量复用、UUID 防幻觉等工程细节，则体现了作者对性能和健壮性的追求。

下一章，我们解析 `Memory.search()` 的检索管线。
