# 第 6 章　Memory.search：语义检索管线

## 6.1 search() 全景

```python
results = m.search(
    query="用户的饮食偏好",
    user_id="alice",
    limit=10,
    threshold=0.7,
)
```

`search()` 的执行路径：

```
query + filters
    │
    ▼
① 构建有效过滤器（会话 ID + 自定义过滤器）
    │
    ├────────────────────┐
    ▼                    ▼
② 向量语义搜索       ③ 图存储搜索（可选）
   （并行）              （并行）
    │                    │
    └────────────────────┘
    │
    ▼
④ Reranker 重排序（可选）
    │
    ▼
⑤ 返回结果
```

与 `add()` 类似，向量搜索和图搜索也是**并行执行**的。

## 6.2 向量搜索：`_search_vector_store()`

```python
def _search_vector_store(self, query, filters, limit, threshold):
    query_vector = self.embedding_model.embed(query, "search")

    memories = self.vector_store.search(
        query=query,
        vectors=query_vector,
        limit=limit,
        filters=filters,
    )

    # 格式化结果
    original_memories = []
    for mem in memories:
        memory_item_dict = MemoryItem(
            id=mem.id,
            memory=mem.payload.get("data", ""),
            hash=mem.payload.get("hash"),
            created_at=mem.payload.get("created_at"),
            updated_at=mem.payload.get("updated_at"),
            score=mem.score,
        ).model_dump()
        # 提升 user_id/agent_id 等字段到顶层
        for key in promoted_payload_keys:
            if key in mem.payload:
                memory_item_dict[key] = mem.payload[key]

        # threshold 过滤
        if threshold is None or mem.score >= threshold:
            original_memories.append(memory_item_dict)

    return original_memories
```

核心是两步：
1. 把查询文本嵌入为向量
2. 在向量库中做近邻搜索（cosine similarity 或 dot product，取决于向量库配置）

## 6.3 过滤器系统

mem0 v1.0 引入了强大的高级过滤器语法：

### 基础过滤（精确匹配）

```python
# 查找特定用户的记忆
m.search("偏好", user_id="alice")

# 添加自定义元数据过滤
m.search("偏好", user_id="alice", filters={"category": "food"})
```

### 高级过滤运算符

```python
# 不等于
m.search("偏好", user_id="alice", filters={"category": {"ne": "work"}})

# 在列表中
m.search("偏好", user_id="alice", filters={"category": {"in": ["food", "hobby"]}})

# 范围
m.search("偏好", user_id="alice", filters={"priority": {"gte": 5, "lte": 10}})

# 包含文本
m.search("偏好", user_id="alice", filters={"tags": {"contains": "health"}})

# 逻辑组合 AND
m.search("偏好", user_id="alice", filters={
    "AND": [
        {"category": {"ne": "work"}},
        {"priority": {"gte": 3}}
    ]
})

# 逻辑组合 OR
m.search("偏好", user_id="alice", filters={
    "OR": [
        {"category": "food"},
        {"category": "hobby"}
    ]
})

# 通配符（匹配任意值，仅检查字段存在）
m.search("偏好", user_id="alice", filters={"category": "*"})
```

### 过滤器处理逻辑

```python
def _process_metadata_filters(self, metadata_filters):
    # 检测是否包含高级运算符
    if self._has_advanced_operators(filters):
        processed_filters = self._process_metadata_filters(filters)
        effective_filters.update(processed_filters)
    else:
        # 简单过滤器，直接合并
        effective_filters.update(filters)
```

`_has_advanced_operators()` 检测 `AND/OR/NOT` 逻辑运算符或 `eq/ne/gt/gte/lt/lte/in/nin/contains/icontains` 比较运算符。

不同向量库对高级过滤器的支持程度不同，`_process_metadata_filters()` 把标准化的运算符转换为各向量库理解的格式。

## 6.4 Reranker：精度优化

```python
if rerank and self.reranker and original_memories:
    try:
        reranked_memories = self.reranker.rerank(query, original_memories, limit)
        original_memories = reranked_memories
    except Exception as e:
        logger.warning(f"Reranking failed, using original results: {e}")
```

向量搜索基于余弦相似度，快速但不够精准。Reranker 使用交叉编码器（Cross-Encoder）对查询和每条记忆做联合建模，精度更高，但更慢。

配置 Reranker：

```python
from mem0.configs.base import MemoryConfig
from mem0.configs.rerankers.config import RerankerConfig

config = MemoryConfig(
    reranker=RerankerConfig(
        provider="cohere",
        config={"model": "rerank-english-v3.0", "top_n": 5}
    )
)
m = Memory(config)
results = m.search("偏好", user_id="alice")  # 自动应用 reranking
```

如果 Reranker 失败，会降级到原始向量搜索结果（不抛出异常），保证可用性。

## 6.5 threshold 参数

```python
# 只返回相似度 >= 0.8 的结果
results = m.search("饮食偏好", user_id="alice", threshold=0.8)
```

threshold 在向量搜索之后、Reranker 之前应用：

```python
if threshold is None or mem.score >= threshold:
    original_memories.append(memory_item_dict)
```

**注意**：threshold 过滤在 Reranker 之前，Reranker 会对通过 threshold 的结果再次排序。

## 6.6 图存储搜索

```python
future_graph_entities = executor.submit(
    self.graph.search, query, effective_filters, limit
)
```

图搜索返回的是**实体关系**，而非事实文本：

```python
{
    "results": [
        {"memory": "喜欢绿茶", "score": 0.92},
        {"memory": "不喝咖啡", "score": 0.87}
    ],
    "relations": [
        {
            "source": "alice",
            "relationship": "likes",
            "target": "green tea",
            "source_type": "person",
            "target_type": "beverage"
        }
    ]
}
```

向量结果和图结果独立返回，由调用者决定如何融合使用。

## 6.7 search vs get_all

两个读取方法的区别：

| 维度 | `search()` | `get_all()` |
|------|-----------|------------|
| 机制 | 向量语义搜索 | 向量库 list（无语义） |
| 需要 query | ✅ | ❌ |
| 结果排序 | 按相似度 | 按存储顺序 |
| 支持 threshold | ✅ | ❌ |
| 支持 Reranker | ✅ | ❌ |
| 适用场景 | 运行时检索 | 管理/导出 |

```python
# 运行时：检索相关记忆注入 prompt
relevant = m.search("今天想吃什么", user_id="alice", limit=5)

# 管理时：查看用户所有记忆
all_memories = m.get_all(user_id="alice")
```

## 6.8 实战：带记忆的 AI 助手

```python
from mem0 import Memory
from openai import OpenAI

memory = Memory()
client = OpenAI()

def chat(message: str, user_id: str) -> str:
    # 1. 检索相关记忆
    relevant_memories = memory.search(
        query=message,
        user_id=user_id,
        limit=5,
        threshold=0.7
    )
    memories_str = "\n".join(
        f"- {m['memory']}"
        for m in relevant_memories["results"]
    )

    # 2. 构建包含记忆的 prompt
    system_prompt = f"""你是一个个性化 AI 助手。
已知用户信息：
{memories_str}

基于以上信息回答用户问题。"""

    # 3. 调用 LLM
    response = client.chat.completions.create(
        model="gpt-4.1-nano-2025-04-14",
        messages=[
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": message},
        ]
    )
    answer = response.choices[0].message.content

    # 4. 把本次对话加入记忆
    memory.add(
        [
            {"role": "user", "content": message},
            {"role": "assistant", "content": answer},
        ],
        user_id=user_id
    )
    return answer
```

## 6.9 小结

`Memory.search()` 的设计要点：

1. **向量语义**：不是关键词匹配，而是语义相似度
2. **并行执行**：向量搜索和图搜索同时进行
3. **可选 Reranker**：在速度和精度之间灵活权衡
4. **丰富过滤器**：从简单精确匹配到复杂逻辑组合
5. **优雅降级**：Reranker 失败时自动使用原始结果

下一章，我们深入记忆更新与冲突解消——mem0 如何保持记忆的准确性和一致性。
