# 第 17 章　Python SDK：自托管与托管双模式

## 17.1 两个入口，一个接口

mem0 的 Python SDK 提供两个客户端类：

```python
from mem0 import Memory        # 自托管：本地运行所有组件
from mem0 import MemoryClient  # 托管平台：调用 mem0.ai 云 API
```

两者继承同一个 `MemoryBase` 接口，API 完全一致。

## 17.2 Memory：自托管实现

```python
from mem0 import Memory

# 最简单：默认配置
m = Memory()

# 完整配置
from mem0.configs.base import MemoryConfig
m = Memory(config=MemoryConfig(...))

# 字典配置
m = Memory.from_config({
    "llm": {"provider": "openai"},
    "vector_store": {"provider": "qdrant"},
})
```

### 初始化流程

```
Memory.__init__(config)
    │
    ├── EmbedderFactory.create() → self.embedding_model
    ├── VectorStoreFactory.create() → self.vector_store
    ├── LlmFactory.create() → self.llm
    ├── SQLiteManager() → self.db
    ├── RerankerFactory.create() → self.reranker（可选）
    └── GraphStoreFactory.create() → self.graph（可选）
```

所有组件在 `__init__` 时同步初始化，之后的操作都是同步的。

### 同步 API

```python
# 添加记忆
result = m.add("我喜欢喝绿茶", user_id="alice")
print(result)
# {"results": [{"id": "uuid1", "memory": "喜欢绿茶", "event": "ADD"}]}

# 搜索记忆
results = m.search("饮品偏好", user_id="alice", limit=5)
print(results["results"])
# [{"id": "uuid1", "memory": "喜欢绿茶", "score": 0.92, ...}]

# 获取所有记忆
all_mem = m.get_all(user_id="alice")

# 按 ID 获取
single = m.get(memory_id="uuid1")

# 手动更新
m.update("uuid1", "喜欢绿茶，尤其是龙井")

# 删除
m.delete("uuid1")

# 删除全部
m.delete_all(user_id="alice")

# 查看历史
history = m.history("uuid1")
```

### 异步 API（AsyncMemory）

```python
from mem0 import AsyncMemory

m = AsyncMemory()

async def main():
    result = await m.add("我喜欢喝绿茶", user_id="alice")
    results = await m.search("饮品偏好", user_id="alice")
    await m.delete_all(user_id="alice")

import asyncio
asyncio.run(main())
```

`AsyncMemory` 是 `Memory` 的异步版本，内部用 `asyncio` 重写所有 IO 操作，适合 FastAPI、asyncio 框架。

## 17.3 MemoryClient：托管平台实现

```python
from mem0 import MemoryClient

client = MemoryClient(
    api_key="m0-xxx",              # 或设置 MEM0_API_KEY 环境变量
    host="https://api.mem0.ai",    # 默认
    org_id="my-org",               # 可选：企业版多组织
    project_id="my-project",       # 可选：项目隔离
)
```

### 初始化细节

```python
def __init__(self, api_key=None, host=None, org_id=None, project_id=None, client=None):
    self.api_key = api_key or os.getenv("MEM0_API_KEY")
    if not self.api_key:
        raise ValueError("Mem0 API Key not provided.")

    # API Key MD5 hash 作为匿名用户 ID（遥测用）
    self.user_id = hashlib.md5(self.api_key.encode()).hexdigest()

    # httpx 客户端（支持自定义注入）
    self.client = httpx.Client(
        base_url=self.host,
        headers={
            "Authorization": f"Token {self.api_key}",
            "Mem0-User-ID": self.user_id,
        },
        timeout=300,  # 5 分钟超时
    )

    # 启动时验证 API Key + 获取 org/project 信息
    self.user_email = self._validate_api_key()
```

初始化时立即调用 `/v1/ping/` 验证 API Key，并自动填充 `org_id` 和 `project_id`（如果在平台上已有默认组织和项目）。

### API 调用模式

```python
# MemoryClient.add() 实现（对比 Memory.add()）
def add(self, messages, *, user_id=None, agent_id=None, run_id=None, ...):
    params = self._prepare_params(user_id=user_id, agent_id=agent_id, run_id=run_id)
    payload = {
        "messages": messages if isinstance(messages, list) else [{"role": "user", "content": messages}],
        "metadata": metadata or {},
        "infer": infer,
    }
    response = self.client.post("/v1/memories/", params=params, json=payload)
    response.raise_for_status()
    return response.json()
```

MemoryClient 的每个方法都是一次 HTTP 请求，所有业务逻辑在 mem0 服务器端执行。

### 异步客户端

```python
from mem0 import AsyncMemoryClient

client = AsyncMemoryClient(api_key="m0-xxx")

async def main():
    result = await client.add("I like green tea", user_id="alice")
    results = await client.search("beverage preference", user_id="alice")
```

`AsyncMemoryClient` 使用 `httpx.AsyncClient`，完全非阻塞。

## 17.4 Memory vs MemoryClient 详细对比

| 维度 | Memory（自托管） | MemoryClient（托管） |
|------|----------------|---------------------|
| 数据存储 | 本地向量库 | mem0 云端 |
| LLM 调用 | 用户自己的 API key | mem0 平台调用 |
| 计费 | 只有 LLM/Embedder 费用 | mem0 平台订阅费 |
| 数据隐私 | 数据不离开本地 | 数据在 mem0 服务器 |
| 运维负担 | 需要维护向量库等 | 零运维 |
| 延迟 | 本地（通常更快） | 网络延迟 |
| 可用性 | 自己保障 | mem0 SLA |
| 分析看板 | ❌ | ✅（mem0 平台） |
| 企业功能 | ❌ | ✅（SSO、审计等） |
| 开发调试 | 直接查向量库 | 通过平台 UI |

## 17.5 切换成本

从自托管切换到托管平台，代码改动只有一行：

```python
# 自托管
from mem0 import Memory
m = Memory(config)

# ↓ 改这一行
from mem0 import MemoryClient
m = MemoryClient(api_key="m0-xxx")

# 其余代码完全不变
m.add("我喜欢喝绿茶", user_id="alice")
m.search("饮品偏好", user_id="alice")
```

**注意**：已有数据不会自动迁移，需要手动导出并通过 MemoryClient 重新写入。

## 17.6 Project：多项目管理

`MemoryClient` 提供了 `project` 子命令用于企业级多项目管理：

```python
# 列出所有项目
projects = client.project.list()

# 创建项目
project = client.project.create(name="customer-service-bot")

# 在特定项目下操作
client_with_project = MemoryClient(
    api_key="m0-xxx",
    project_id="proj-xxx"
)
```

## 17.7 错误处理

```python
from mem0 import Memory
from mem0.exceptions import (
    ValidationError,
    VectorStoreError,
    LLMError,
    EmbeddingError,
    DatabaseError,
)

m = Memory()

try:
    result = m.add("some text", user_id="alice")
except ValidationError as e:
    print(f"输入验证失败: {e.message}")
    print(f"错误码: {e.error_code}")
    print(f"建议: {e.suggestion}")
except LLMError as e:
    print(f"LLM 调用失败: {e}")
except VectorStoreError as e:
    print(f"向量库错误: {e}")
```

## 17.8 自定义 httpx 客户端

`MemoryClient` 支持注入自定义 httpx 客户端，适合需要代理、自定义 SSL 等场景：

```python
import httpx

# 带代理的自定义客户端
custom_client = httpx.Client(
    proxies={"http://": "http://proxy.example.com:8080"},
    verify=False,  # 跳过 SSL 验证
)

client = MemoryClient(api_key="m0-xxx", client=custom_client)
```

## 17.9 小结

Python SDK 的双模式设计是 mem0 最重要的产品决策之一：

- **开发阶段**：`Memory()` 本地运行，调试方便，无额外成本
- **生产阶段**：`MemoryClient()` 零运维，专注业务逻辑
- **企业阶段**：`MemoryClient(org_id, project_id)` 多组织多项目隔离

无论哪种模式，对上层代码的接口完全透明。下一章解析 TypeScript SDK。
