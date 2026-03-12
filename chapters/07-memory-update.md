# 第 7 章　记忆更新与冲突解消

## 7.1 记忆的时效性问题

用户的信息会随时间变化：

```
第一天: "我住在北京"
第三个月: "我搬到上海了"
```

如果 mem0 只是简单追加，会同时保存两条矛盾的记忆，检索时造成混乱。mem0 的解决方案是**用 LLM 做智能冲突解消**。

## 7.2 UPDATE_MEMORY_PROMPT 的设计

这是 mem0 中最重要的 Prompt，控制记忆的"增删改判断"：

```
你是一个智能记忆管理器，负责控制系统的记忆。
你可以执行四种操作：
(1) ADD：添加新记忆
(2) UPDATE：更新已有记忆
(3) DELETE：删除旧记忆
(4) NONE：无需操作

比较新提取的事实与已有记忆，对每条新事实决定操作类型。

操作选择准则：
1. ADD: 新信息，内存中不存在 → 生成新 ID
2. UPDATE: 信息已存在但有变化，保留信息量更多的版本
   - "User likes to play cricket" + "Loves to play cricket with friends" → UPDATE
   - "Likes cheese pizza" + "Loves cheese pizza" → NONE（语义相同）
3. DELETE: 旧信息与新事实冲突
4. NONE: 重复或无关
```

Prompt 的精妙之处在于例子驱动：通过 few-shot 例子教 LLM 理解"语义相同不更新"vs"信息增量要更新"的区别。

## 7.3 UPDATE 决策流程

以一次真实的 add() 为例：

**输入消息**：
```
用户: "以前我喜欢跑步，但最近改练瑜伽了，因为膝盖受伤了"
```

**第一次 LLM（事实提取）**：
```json
{"facts": ["以前喜欢跑步", "最近改练瑜伽", "膝盖受伤"]}
```

**向量库检索已有记忆**（假设已存在）：
```json
[
    {"id": "0", "text": "喜欢跑步"},
    {"id": "1", "text": "每天晨跑5公里"}
]
```

**第二次 LLM（更新决策）**：

输入：
```
已有记忆:
[{"id": "0", "text": "喜欢跑步"}, {"id": "1", "text": "每天晨跑5公里"}]

新事实:
["以前喜欢跑步，最近改练瑜伽", "膝盖受伤"]
```

输出：
```json
{
    "memory": [
        {
            "id": "0",
            "text": "以前喜欢跑步，现在练瑜伽",
            "event": "UPDATE",
            "old_memory": "喜欢跑步"
        },
        {
            "id": "1",
            "text": "每天晨跑5公里",
            "event": "DELETE"
        },
        {
            "id": null,
            "text": "膝盖受伤",
            "event": "ADD"
        }
    ]
}
```

## 7.4 `_update_memory()`：更新实现

```python
def _update_memory(self, memory_id, data, existing_embeddings=None, metadata=None):
    existing_memory = self.vector_store.get(vector_id=memory_id)
    prev_value = existing_memory.payload.get("data", "")

    new_metadata = deepcopy(existing_memory.payload)
    new_metadata["data"] = data
    new_metadata["hash"] = hashlib.md5(data.encode()).hexdigest()
    new_metadata["updated_at"] = datetime.now(pytz.timezone("US/Pacific")).isoformat()

    # 合并新的 session IDs（不覆盖已有的）
    if metadata:
        for key in ["user_id", "agent_id", "run_id"]:
            if key in metadata:
                new_metadata[key] = metadata[key]

    # 计算新向量（优先复用已计算的向量）
    if existing_embeddings and data in existing_embeddings:
        embeddings = existing_embeddings[data]
    else:
        embeddings = self.embedding_model.embed(data, "update")

    self.vector_store.update(
        vector_id=memory_id,
        vector=embeddings,
        payload=new_metadata,
    )

    # 写入历史记录（old_memory + new_memory 都保存）
    self.db.add_history(
        memory_id=memory_id,
        old_memory=prev_value,
        new_memory=data,
        event="UPDATE",
        actor_id=metadata.get("actor_id") if metadata else None,
        role=metadata.get("role") if metadata else None,
    )
    return memory_id
```

关键设计：
- **就地更新**：保留原 UUID，只更新文本、向量和元数据
- **历史保留**：`old_memory` 写入 SQLite，可追溯
- **Session ID 合并**：新的 agent_id/run_id 会追加到记忆，不覆盖 user_id

## 7.5 `_delete_memory()`：软删除

```python
def _delete_memory(self, memory_id):
    existing_memory = self.vector_store.get(vector_id=memory_id)
    prev_value = existing_memory.payload.get("data", "")

    self.vector_store.delete(vector_id=memory_id)

    self.db.add_history(
        memory_id=memory_id,
        old_memory=prev_value,
        new_memory=None,
        event="DELETE",
    )
```

向量库中**物理删除**记录，但历史审计表中保留一条 `event=DELETE` 的记录。这意味着：
- `search()` 再也找不到这条记忆
- `history(memory_id)` 还能看到它曾经存在

## 7.6 手动 update() 和 delete()

除了 add() 内部自动触发的更新，用户也可以手动操作：

```python
# 查找记忆
memories = m.get_all(user_id="alice")
memory_id = memories["results"][0]["id"]

# 手动更新
m.update(memory_id, "在上海工作，担任产品经理")

# 手动删除
m.delete(memory_id)

# 删除某用户所有记忆
m.delete_all(user_id="alice")
```

### delete_all() 实现

```python
def delete_all(self, user_id=None, agent_id=None, run_id=None):
    _, filters = _build_filters_and_metadata(
        user_id=user_id, agent_id=agent_id, run_id=run_id
    )

    memories = self.vector_store.list(filters=filters, limit=100)

    for memory in memories:
        self.vector_store.delete(vector_id=memory.id)
        self.db.add_history(
            memory_id=memory.id,
            old_memory=memory.payload.get("data", ""),
            new_memory=None,
            event="DELETE",
        )
```

## 7.7 NONE 操作的特殊处理

v1.0 对 NONE 操作做了一个有趣的增强：

```python
elif event_type == "NONE":
    # 即使内容没变，也要更新 session IDs
    memory_id = temp_uuid_mapping.get(resp.get("id"))
    if memory_id and (metadata.get("agent_id") or metadata.get("run_id")):
        existing_memory = self.vector_store.get(vector_id=memory_id)
        updated_metadata = deepcopy(existing_memory.payload)
        if metadata.get("agent_id"):
            updated_metadata["agent_id"] = metadata["agent_id"]
        if metadata.get("run_id"):
            updated_metadata["run_id"] = metadata["run_id"]
        updated_metadata["updated_at"] = datetime.now(...).isoformat()

        self.vector_store.update(
            vector_id=memory_id,
            vector=None,  # 保持原向量不变
            payload=updated_metadata,
        )
```

场景：用户的偏好没变（NONE），但现在是通过新的 Agent 或新的会话访问，需要把这次访问的 `agent_id` 或 `run_id` 关联到该记忆。

这让 mem0 能够追踪"哪个 Agent 知道这条记忆"，支持更精细的权限控制。

## 7.8 自定义更新 Prompt

对于特定领域，可以自定义冲突解消规则：

```python
config = MemoryConfig(
    custom_update_memory_prompt="""
    你是一个医疗信息管理员。
    
    规则：
    1. 诊断信息不可删除，只能追加（医疗记录的完整性原则）
    2. 过敏信息永远 ADD，不做 DELETE
    3. 药物信息如果有变化，旧记录标记 UPDATE，保留 old_memory
    4. 体重/血压等测量值可以 UPDATE（只保留最新值）
    
    返回格式同标准格式。
    """
)
```

## 7.9 记忆版本控制思维

从架构角度看，mem0 的记忆更新机制类似一个**简化的事件溯源（Event Sourcing）系统**：

```
ADD(t=1)    → "喜欢跑步"           [v1]
UPDATE(t=2) → "喜欢跑步+瑜伽"     [v2] (old: "喜欢跑步")
UPDATE(t=3) → "只练瑜伽"          [v3] (old: "喜欢跑步+瑜伽")
DELETE(t=4) → null                [v4] (old: "只练瑜伽")
```

当前状态是向量库中的"最新快照"，历史是 SQLite 中的"事件日志"。

## 7.10 小结

mem0 的记忆更新机制的核心是：

1. **LLM 作为裁判**：由 LLM 判断 ADD/UPDATE/DELETE/NONE，而不是规则
2. **语义感知**：能理解"喜欢跑步"和"喜欢晨跑"是同一件事
3. **保留历史**：向量库保存当前状态，SQLite 保存变更历史
4. **UUID 防幻觉**：用整数 ID 与 LLM 交互，避免 UUID 幻觉

下一章，我们解析 SQLite 历史追踪系统的设计细节。
