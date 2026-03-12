# 第 12 章　Reranker：重排序优化

## 12.1 为什么需要 Reranker

向量搜索基于**双编码器（Bi-Encoder）**：查询和文档分别独立编码，通过向量距离衡量相关性。这种方式快（O(1) 查找），但精度有限——因为查询和文档的语义在编码时没有交互。

Reranker 基于**交叉编码器（Cross-Encoder）**：把查询和每条候选记忆一起输入模型，做联合推理。精度更高，但每次检索都需要 N 次推理（N = 候选数量）。

典型工作流：

```
向量搜索（快，top-100）
    ↓
Reranker 精排（慢但准，top-5）
    ↓
注入上下文
```

## 12.2 BaseReranker 接口

```python
class BaseReranker(ABC):
    @abstractmethod
    def rerank(
        self,
        query: str,
        documents: List[Dict[str, Any]],
        top_k: int = None,
    ) -> List[Dict[str, Any]]:
        """
        对候选记忆重新排序。
        
        Args:
            query: 搜索查询
            documents: 候选记忆列表（每条有 'memory' 字段）
            top_k: 返回 top-k 条，None 返回全部（按新顺序）
        
        Returns:
            重排后的记忆列表（每条新增 'rerank_score' 字段）
        """
        pass
```

输入文档格式（与 `search()` 返回格式一致）：

```python
[
    {"id": "uuid1", "memory": "喜欢绿茶", "score": 0.85, ...},
    {"id": "uuid2", "memory": "不喝咖啡因", "score": 0.82, ...},
    ...
]
```

输出新增 `rerank_score` 字段，并按分数降序排列。

## 12.3 Cohere Reranker（推荐）

```python
config = MemoryConfig(
    reranker=RerankerConfig(
        provider="cohere",
        config={
            "model": "rerank-english-v3.0",
            "top_n": 5,
            "api_key": "xxx",  # 或设置 COHERE_API_KEY
        }
    )
)
```

```python
class CohereReranker(BaseReranker):
    def rerank(self, query, documents, top_k=None):
        doc_texts = [doc.get("memory") or doc.get("text", str(doc)) for doc in documents]

        response = self.client.rerank(
            model=self.model,
            query=query,
            documents=doc_texts,
            top_n=top_k or self.config.top_n,
        )

        reranked = []
        for result in response.results:
            doc = documents[result.index].copy()
            doc["rerank_score"] = result.relevance_score
            reranked.append(doc)

        return sorted(reranked, key=lambda x: x["rerank_score"], reverse=True)
```

**Cohere Rerank 模型**：

| 模型 | 语言 | 特点 |
|------|------|------|
| `rerank-english-v3.0` | 英文 | 英文最佳精度 |
| `rerank-multilingual-v3.0` | 多语言 | 支持 100+ 语言，含中文 |
| `rerank-english-v2.0` | 英文 | 旧版，仍可用 |

## 12.4 SentenceTransformer Reranker（本地）

```python
config = MemoryConfig(
    reranker=RerankerConfig(
        provider="sentence_transformer",
        config={
            "model": "cross-encoder/ms-marco-MiniLM-L-6-v2",
            "top_n": 5,
        }
    )
)
```

本地运行，无需 API Key，适合私有化部署。常用的交叉编码器模型：

| 模型 | 大小 | 语言 |
|------|------|------|
| `cross-encoder/ms-marco-MiniLM-L-6-v2` | 22M | 英文，最快 |
| `cross-encoder/ms-marco-MiniLM-L-12-v2` | 33M | 英文，更准 |
| `BAAI/bge-reranker-base` | 278M | 中英双语 |
| `BAAI/bge-reranker-large` | 560M | 中英双语，更准 |

## 12.5 LLM Reranker（最灵活）

```python
config = MemoryConfig(
    reranker=RerankerConfig(
        provider="llm",
        config={
            "provider": "openai",
            "model": "gpt-4o-mini",
            "top_k": 5,
            "temperature": 0.0,
            "max_tokens": 100,
        }
    )
)
```

LLM Reranker 用 LLM 为每个（查询, 文档）对打相关性分数：

```
Prompt:
  Query: "Alice 的饮食偏好"
  Document: "喜欢绿茶"
  
  请给出 0.0-1.0 的相关性分数，只输出数字。

LLM 回复: "0.85"
```

优点：支持任意 LLM，可自定义打分 Prompt
缺点：延迟高（每条候选独立调用一次 LLM）

自定义打分 Prompt：

```python
config = {
    "provider": "anthropic",
    "model": "claude-haiku-4-5",
    "scoring_prompt": """你是一个医疗信息相关性评估专家。
Query: "{query}"
Document: "{document}"

请评估该文档对 query 的医疗相关性（0.0-1.0），只输出数字。""",
}
```

## 12.6 HuggingFace Reranker

```python
config = MemoryConfig(
    reranker=RerankerConfig(
        provider="huggingface",
        config={
            "model": "BAAI/bge-reranker-large",
            "top_n": 5,
        }
    )
)
```

直接调用 HuggingFace Transformers 的推理 API，支持任意交叉编码器模型。

## 12.7 Zero Entropy Reranker

```python
config = MemoryConfig(
    reranker=RerankerConfig(
        provider="zero_entropy",
        config={"top_n": 5}
    )
)
```

Zero Entropy 是一种无需外部 API 的统计重排序方法，基于信息熵计算相关性。精度不如神经网络模型，但完全本地、零依赖。

## 12.8 Reranker 调用时机

在 `Memory.search()` 中：

```python
# 1. 向量搜索（快）
original_memories = self._search_vector_store(query, filters, limit, threshold)

# 2. Reranker 精排（可选）
if rerank and self.reranker and original_memories:
    try:
        reranked_memories = self.reranker.rerank(query, original_memories, limit)
        original_memories = reranked_memories
    except Exception as e:
        logger.warning(f"Reranking failed, using original results: {e}")
        # 降级：使用原始向量搜索结果
```

`rerank=True`（默认）且配置了 Reranker 时才触发。失败时自动降级，不影响正常检索。

## 12.9 四种 Reranker 对比

| 维度 | Cohere | SentenceTransformer | LLM | HuggingFace |
|------|--------|---------------------|-----|-------------|
| 部署 | 云 API | 本地 | 云/本地 | 本地 |
| 精度 | ⭐⭐⭐⭐⭐ | ⭐⭐⭐⭐ | ⭐⭐⭐⭐ | ⭐⭐⭐⭐ |
| 延迟 | 中 | 低（CPU） | 高 | 低-中 |
| 成本 | 按量 | 免费 | 按量 | 免费 |
| 多语言 | ✅（v3.0） | ✅（部分模型） | ✅ | ✅（BGE） |
| 可定制性 | 低 | 低 | 高 | 低 |

## 12.10 延迟 vs 精度的权衡

实际工程中 Reranker 的启用原则：

```
需要极低延迟（<100ms）：
  → 不用 Reranker，向量搜索结果足够好

对精度要求高（医疗、法律）：
  → Cohere multilingual-v3.0（最准）
  → 或 BAAI/bge-reranker-large（本地，中英双语）

完全本地化：
  → SentenceTransformer 或 HuggingFace BGE

需要自定义评分逻辑：
  → LLM Reranker + 自定义 scoring_prompt
```

## 12.11 小结

Reranker 是 mem0 检索管线的"精度加速器"：用更多计算换取更准确的结果。它是可选的，默认不开启，配置后自动生效且有故障降级保护。下一章进入图记忆系统——mem0 的另一种完全不同的记忆维度。
