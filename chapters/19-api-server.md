# 第 19 章　REST API Server

## 19.1 为什么需要 REST API Server

mem0 的 Python SDK 是直接库调用。但在很多场景下，你需要的是一个独立运行的服务：

- **多语言接入**：Go、Java、Ruby 应用需要调用 mem0
- **微服务架构**：记忆服务独立部署，与其他服务解耦
- **团队协作**：多个应用共享同一个记忆服务实例
- **资源隔离**：把向量库和 LLM 的连接集中在一个进程里

`server/main.py` 是一个 FastAPI 应用，把 `Memory` 类的所有方法包装为 HTTP 端点。

## 19.2 端点全览

| 方法 | 路径 | 对应操作 | 说明 |
|------|------|----------|------|
| `POST` | `/memories` | `Memory.add()` | 添加记忆 |
| `GET` | `/memories` | `Memory.get_all()` | 获取全部记忆 |
| `GET` | `/memories/{id}` | `Memory.get()` | 按 ID 获取 |
| `PUT` | `/memories/{id}` | `Memory.update()` | 更新记忆 |
| `DELETE` | `/memories/{id}` | `Memory.delete()` | 删除记忆 |
| `DELETE` | `/memories` | `Memory.delete_all()` | 删除全部 |
| `POST` | `/search` | `Memory.search()` | 语义搜索 |
| `GET` | `/memories/{id}/history` | `Memory.history()` | 变更历史 |
| `POST` | `/configure` | `Memory.from_config()` | 热更新配置 |

## 19.3 默认配置

Server 启动时从环境变量读取配置，默认使用 **PostgreSQL + Neo4j + OpenAI** 的生产级组合：

```python
DEFAULT_CONFIG = {
    "version": "v1.1",
    "vector_store": {
        "provider": "pgvector",
        "config": {
            "host": POSTGRES_HOST,    # 环境变量
            "port": int(POSTGRES_PORT),
            "dbname": POSTGRES_DB,
            "user": POSTGRES_USER,
            "password": POSTGRES_PASSWORD,
            "collection_name": POSTGRES_COLLECTION_NAME,
        },
    },
    "graph_store": {
        "provider": "neo4j",
        "config": {
            "url": NEO4J_URI,
            "username": NEO4J_USERNAME,
            "password": NEO4J_PASSWORD,
        },
    },
    "llm": {
        "provider": "openai",
        "config": {
            "api_key": OPENAI_API_KEY,
            "model": "gpt-4.1-nano-2025-04-14",
        }
    },
    "embedder": {
        "provider": "openai",
        "config": {"model": "text-embedding-3-small"}
    },
    "history_db_path": HISTORY_DB_PATH,
}

MEMORY_INSTANCE = Memory.from_config(DEFAULT_CONFIG)
```

## 19.4 核心端点实现

### POST /memories（添加记忆）

```python
class MemoryCreate(BaseModel):
    messages: List[Message]
    user_id: Optional[str] = None
    agent_id: Optional[str] = None
    run_id: Optional[str] = None
    metadata: Optional[Dict[str, Any]] = None

@app.post("/memories")
def add_memory(memory_create: MemoryCreate):
    if not any([memory_create.user_id, memory_create.agent_id, memory_create.run_id]):
        raise HTTPException(status_code=400, detail="At least one identifier required.")

    params = {k: v for k, v in memory_create.model_dump().items()
              if v is not None and k != "messages"}
    try:
        response = MEMORY_INSTANCE.add(
            messages=[m.model_dump() for m in memory_create.messages],
            **params
        )
        return JSONResponse(content=response)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
```

调用示例：

```bash
curl -X POST http://localhost:8000/memories \
  -H "Content-Type: application/json" \
  -d '{
    "messages": [
      {"role": "user", "content": "I love green tea"}
    ],
    "user_id": "alice"
  }'
```

### POST /search（语义搜索）

```python
class SearchRequest(BaseModel):
    query: str
    user_id: Optional[str] = None
    agent_id: Optional[str] = None
    run_id: Optional[str] = None
    filters: Optional[Dict[str, Any]] = None

@app.post("/search")
def search_memories(search_req: SearchRequest):
    params = {k: v for k, v in search_req.model_dump().items()
              if v is not None and k != "query"}
    return MEMORY_INSTANCE.search(query=search_req.query, **params)
```

```bash
curl -X POST http://localhost:8000/search \
  -H "Content-Type: application/json" \
  -d '{"query": "beverage preferences", "user_id": "alice"}'
```

### POST /configure（热更新配置）

```python
@app.post("/configure")
def set_config(config: Dict[str, Any]):
    global MEMORY_INSTANCE
    MEMORY_INSTANCE = Memory.from_config(config)
    return {"message": "Configuration set successfully"}
```

这个端点允许运行时切换向量库、LLM 等配置，无需重启服务。

## 19.5 Docker Compose 部署

`server/docker-compose.yaml` 提供了开箱即用的生产配置：

```yaml
version: '3.8'

services:
  mem0-server:
    build: .
    ports:
      - "8000:8000"
    environment:
      - OPENAI_API_KEY=${OPENAI_API_KEY}
      - POSTGRES_HOST=postgres
      - POSTGRES_PORT=5432
      - POSTGRES_DB=postgres
      - POSTGRES_USER=postgres
      - POSTGRES_PASSWORD=postgres
      - NEO4J_URI=bolt://neo4j:7687
      - NEO4J_USERNAME=neo4j
      - NEO4J_PASSWORD=mem0graph
      - HISTORY_DB_PATH=/app/history/history.db
    depends_on:
      - postgres
      - neo4j
    volumes:
      - history_data:/app/history

  postgres:
    image: pgvector/pgvector:pg16
    environment:
      POSTGRES_PASSWORD: postgres
      POSTGRES_DB: postgres
    volumes:
      - postgres_data:/var/lib/postgresql/data
    ports:
      - "5432:5432"

  neo4j:
    image: neo4j:5
    environment:
      - NEO4J_AUTH=neo4j/mem0graph
    volumes:
      - neo4j_data:/data
    ports:
      - "7474:7474"  # Neo4j Browser
      - "7687:7687"  # Bolt

volumes:
  postgres_data:
  neo4j_data:
  history_data:
```

启动：

```bash
cd server
OPENAI_API_KEY=sk-xxx docker compose up -d
```

服务启动后：
- REST API：`http://localhost:8000`
- API 文档（Swagger）：`http://localhost:8000/docs`
- Neo4j Browser：`http://localhost:7474`

## 19.6 轻量级部署（无图存储）

如果不需要图记忆，可以用更轻量的配置：

```bash
# .env
OPENAI_API_KEY=sk-xxx
```

```python
# 修改 server/main.py 的 DEFAULT_CONFIG
DEFAULT_CONFIG = {
    "vector_store": {
        "provider": "qdrant",
        "config": {"path": "/app/data/qdrant"}
    },
    "llm": {"provider": "openai"},
    "embedder": {"provider": "openai"},
}
```

```dockerfile
# 简化版 Dockerfile
FROM python:3.11-slim
WORKDIR /app
COPY requirements.txt .
RUN pip install mem0ai fastapi uvicorn python-dotenv
COPY main.py .
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000"]
```

## 19.7 从其他语言调用

### Go

```go
package main

import (
    "bytes"
    "encoding/json"
    "net/http"
)

type AddRequest struct {
    Messages []Message `json:"messages"`
    UserID   string    `json:"user_id"`
}

type Message struct {
    Role    string `json:"role"`
    Content string `json:"content"`
}

func addMemory(content, userID string) error {
    payload := AddRequest{
        Messages: []Message{{Role: "user", Content: content}},
        UserID:   userID,
    }
    body, _ := json.Marshal(payload)
    resp, err := http.Post(
        "http://localhost:8000/memories",
        "application/json",
        bytes.NewBuffer(body),
    )
    defer resp.Body.Close()
    return err
}
```

### Java（使用 OkHttp）

```java
OkHttpClient client = new OkHttpClient();
String json = "{\"messages\":[{\"role\":\"user\",\"content\":\"I love tea\"}],\"user_id\":\"alice\"}";
RequestBody body = RequestBody.create(json, MediaType.get("application/json"));
Request request = new Request.Builder()
    .url("http://localhost:8000/memories")
    .post(body)
    .build();
try (Response response = client.newCall(request).execute()) {
    System.out.println(response.body().string());
}
```

## 19.8 自动文档（OpenAPI）

FastAPI 自动生成两套 API 文档：
- **Swagger UI**：`http://localhost:8000/docs`（交互式测试）
- **ReDoc**：`http://localhost:8000/redoc`（阅读友好）

所有请求/响应的 Schema 都由 Pydantic 模型自动推导，字段说明来自 `Field(description="...")`。

## 19.9 小结

REST API Server 是 mem0 的"语言无关入口"，让任何技术栈都能接入记忆能力：

- **FastAPI**：高性能、自动文档、Pydantic 类型校验
- **全局单例**：`MEMORY_INSTANCE` 在进程内复用，避免重复初始化
- **热配置**：`/configure` 端点支持运行时切换组件
- **Docker Compose**：一条命令启动完整的生产级栈

下一章解析 mem0 与 LangGraph、CrewAI 等主流框架的集成模式。
