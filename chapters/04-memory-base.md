# 第 4 章　MemoryBase：抽象接口设计

## 4.1 为什么需要抽象基类

mem0 有两种运行模式：
- **自托管**：`Memory` 类，本地运行所有组件
- **托管平台**：`MemoryClient` 类，调用 mem0 云 API

这两种实现的**用户接口应该完全相同**。无论你是自托管还是使用托管平台，调用方式都是：

```python
m.add(messages, user_id="alice")
m.search("偏好", user_id="alice")
m.get(memory_id)
```

`MemoryBase` 就是实现这种统一性的接口契约。

## 4.2 MemoryBase 接口

```python
# mem0/memory/base.py
from abc import ABC, abstractmethod

class MemoryBase(ABC):
    @abstractmethod
    def get(self, memory_id): ...

    @abstractmethod
    def get_all(self): ...

    @abstractmethod
    def update(self, memory_id, data): ...

    @abstractmethod
    def delete(self, memory_id): ...

    @abstractmethod
    def history(self, memory_id): ...

    @abstractmethod
    def add(self, messages, **kwargs): ...

    @abstractmethod
    def search(self, query, **kwargs): ...
```

七个抽象方法，覆盖了记忆的完整生命周期：

| 方法 | 说明 | 对应 CRUD |
|------|------|-----------|
| `add()` | 新增记忆 | Create |
| `get()` | 按 ID 取单条 | Read |
| `get_all()` | 取全部 | Read |
| `search()` | 语义检索 | Read |
| `update()` | 更新内容 | Update |
| `delete()` | 删除记忆 | Delete |
| `history()` | 变更历史 | Read（审计） |

## 4.3 继承关系

```
MemoryBase (ABC)
  ├── Memory          ← 自托管实现（mem0/memory/main.py）
  └── MemoryClient    ← 托管平台实现（mem0/client/main.py）
```

这种设计让用户可以无缝切换：

```python
from mem0 import Memory, MemoryClient

# 开发/测试阶段
m = Memory()

# 生产阶段（改一行）
m = MemoryClient(api_key="m0-xxx")

# 其余代码完全不变
m.add("我喜欢喝绿茶", user_id="alice")
```

## 4.4 多会话 ID 体系

mem0 v1.0 引入了灵活的会话 ID 体系，这是设计上的重大亮点。

### 三个维度

```python
# 用户维度：跨会话的个人记忆
m.add(messages, user_id="alice")

# Agent 维度：Agent 自身的程序性知识
m.add(messages, agent_id="support-bot-v2")

# 会话维度：单次对话的临时记忆
m.add(messages, run_id="session-2026-03-12-001")
```

### 组合使用

三个维度可以叠加，实现精细的记忆隔离：

```python
# Alice 与 support-bot 在某次会话中的记忆
m.add(
    messages,
    user_id="alice",
    agent_id="support-bot-v2",
    run_id="session-001"
)

# 检索时可以按任意维度过滤
m.search("问题", user_id="alice")                    # Alice 的所有记忆
m.search("问题", agent_id="support-bot-v2")          # 该 bot 的所有记忆
m.search("问题", user_id="alice", run_id="session-001")  # 精确到某次会话
```

### actor_id：细粒度角色追踪

v1.0 新增的 `actor_id` 用于多参与方场景：

```python
# 在群聊或多 agent 场景中区分说话者
messages = [
    {"role": "user", "content": "Alice 说她喜欢咖啡", "name": "Alice"},
    {"role": "user", "content": "Bob 说他不喝咖啡因", "name": "Bob"},
]
m.add(messages, run_id="group-chat-001")

# 只检索 Alice 的记忆
m.search("饮品", run_id="group-chat-001", actor_id="Alice")
```

### 内部实现：`_build_filters_and_metadata`

```python
def _build_filters_and_metadata(
    *,
    user_id=None, agent_id=None, run_id=None,
    actor_id=None,
    input_metadata=None, input_filters=None,
):
    base_metadata_template = deepcopy(input_metadata) or {}
    effective_query_filters = deepcopy(input_filters) or {}

    session_ids_provided = []
    for key, val in [("user_id", user_id), ("agent_id", agent_id), ("run_id", run_id)]:
        if val:
            base_metadata_template[key] = val
            effective_query_filters[key] = val
            session_ids_provided.append(key)

    if not session_ids_provided:
        raise Mem0ValidationError("至少提供一个 ID")  # user_id / agent_id / run_id 三选一

    resolved_actor_id = actor_id or effective_query_filters.get("actor_id")
    if resolved_actor_id:
        effective_query_filters["actor_id"] = resolved_actor_id

    return base_metadata_template, effective_query_filters
```

返回两个字典：
- `base_metadata_template`：写入时的元数据（不包含 actor_id，因为由消息内容决定）
- `effective_query_filters`：查询时的过滤条件（包含 actor_id）

## 4.5 完整方法签名

`Memory` 类的公开方法签名（keyword-only 参数是 v1.0 的重要变更）：

```python
class Memory(MemoryBase):
    def add(
        self,
        messages,
        *,                                    # 以下全部 keyword-only
        user_id: Optional[str] = None,
        agent_id: Optional[str] = None,
        run_id: Optional[str] = None,
        metadata: Optional[Dict] = None,
        infer: bool = True,
        memory_type: Optional[str] = None,   # 仅支持 "procedural_memory"
        prompt: Optional[str] = None,
    ): ...

    def search(
        self,
        query: str,
        *,
        user_id: Optional[str] = None,
        agent_id: Optional[str] = None,
        run_id: Optional[str] = None,
        actor_id: Optional[str] = None,
        limit: int = 100,
        filters: Optional[Dict] = None,
        threshold: Optional[float] = None,
    ): ...

    def get_all(
        self,
        *,
        user_id: Optional[str] = None,
        agent_id: Optional[str] = None,
        run_id: Optional[str] = None,
        filters: Optional[Dict] = None,
        limit: int = 100,
    ): ...
```

**Breaking Change 提示**：v1.0 之前 `user_id` 是位置参数，v1.0 改为 keyword-only，升级时需要检查所有调用点。

## 4.6 返回值格式

### add() 返回

```python
{
    "results": [
        {"id": "uuid1", "memory": "喜欢绿茶", "event": "ADD"},
        {"id": "uuid2", "memory": "不喜欢咖啡", "event": "UPDATE", "previous_memory": "喜欢咖啡"},
    ],
    # 仅当启用图存储时：
    "relations": [
        {"source": "Alice", "relationship": "likes", "target": "green tea"}
    ]
}
```

四种 event 类型：
- `ADD`：新增记忆
- `UPDATE`：更新已有记忆
- `DELETE`：删除旧记忆
- `NONE`：重复，无需操作

### search() 返回

```python
{
    "results": [
        {
            "id": "uuid1",
            "memory": "喜欢绿茶",
            "metadata": {"user_id": "alice"},
            "score": 0.92,
            "created_at": "2026-03-12T10:00:00Z",
            "updated_at": "2026-03-12T10:00:00Z",
        }
    ]
}
```

## 4.7 infer 参数：智能提取 vs 原始存储

```python
# 默认：LLM 提取事实后存储
m.add("我在上海工作，是一名软件工程师，喜欢爬山", user_id="alice", infer=True)
# 存储: ["在上海工作", "软件工程师", "喜欢爬山"]  ← 3 条独立事实

# infer=False：原始存储，不经过 LLM
m.add([{"role": "user", "content": "我在上海工作，是软件工程师"}], user_id="alice", infer=False)
# 存储: "我在上海工作，是软件工程师"  ← 原始文本
```

`infer=True` 时，add 管线会调用两次 LLM：
1. 第一次：提取事实列表（FACT_RETRIEVAL_PROMPT）
2. 第二次：与已有记忆对比，决定 ADD/UPDATE/DELETE/NOOP（UPDATE_MEMORY_PROMPT）

## 4.8 小结

`MemoryBase` 的设计简洁有力：

- **七个方法**覆盖记忆完整生命周期
- **两个实现类**对应不同部署模式，接口完全相同
- **三维 ID 体系**提供精细的记忆隔离
- **keyword-only 参数**（v1.0）避免位置参数混淆

下一章，我们深入 `Memory.add()` 的完整执行管线——这是 mem0 最复杂也最有趣的部分。
