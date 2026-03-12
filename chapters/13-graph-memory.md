# 第 13 章　MemoryGraph：知识图谱记忆

## 13.1 为什么需要图记忆

向量记忆擅长存储**孤立的事实**，但很难表达**实体之间的关系**：

```
向量记忆:
  "Alice 喜欢绿茶"
  "Alice 住在上海"
  "Alice 和 Bob 是同事"
  "Bob 也喜欢喝茶"

问：Alice 的同事有什么饮品偏好？
向量搜索难以回答（需要两跳推理：Alice → Bob → 茶）
```

图记忆把这些关系显式建模：

```
[Alice] --LIVES_IN--> [上海]
[Alice] --LIKES--> [绿茶]
[Alice] --COLLEAGUE_OF--> [Bob]
[Bob] --LIKES--> [茶]
```

通过图遍历，两跳推理变得自然。

## 13.2 启用图记忆

```python
from mem0 import Memory
from mem0.configs.base import MemoryConfig

config = MemoryConfig.from_config({
    "graph_store": {
        "provider": "neo4j",
        "config": {
            "url": "bolt://localhost:7687",
            "username": "neo4j",
            "password": "password",
            "database": "neo4j",
        }
    },
    "llm": {"provider": "openai"},
    "embedder": {"provider": "openai"},
})

m = Memory(config)
```

启用后，每次 `add()` 会同时写入向量库和图数据库；每次 `search()` 会同时查询两者，结果合并返回。

## 13.3 MemoryGraph 架构

```python
class MemoryGraph:
    def __init__(self, config):
        # Neo4j 连接（通过 langchain_neo4j）
        self.graph = Neo4jGraph(url, username, password, database)

        # 独立的 Embedder（图节点也需要向量化用于相似度搜索）
        self.embedding_model = EmbedderFactory.create(...)

        # 独立的 LLM（用于实体/关系提取）
        self.llm = LlmFactory.create(...)

        # 相似度阈值（默认 0.7）
        self.threshold = config.graph_store.threshold or 0.7
```

图记忆有自己的 LLM 和 Embedder 实例（可以与主记忆管线使用相同或不同的提供商）。

## 13.4 add() 管线：四个阶段

```python
def add(self, data, filters):
    # 阶段 1：提取实体类型
    entity_type_map = self._retrieve_nodes_from_data(data, filters)
    # {"Alice": "person", "上海": "city", "绿茶": "beverage"}

    # 阶段 2：建立节点和关系
    to_be_added = self._establish_nodes_relations_from_data(data, filters, entity_type_map)
    # [("Alice", "LIVES_IN", "上海"), ("Alice", "LIKES", "绿茶")]

    # 阶段 3：搜索已有图节点（冲突检测）
    search_output = self._search_graph_db(node_list=list(entity_type_map.keys()), filters=filters)

    # 阶段 4：删除过时关系，写入新关系
    to_be_deleted = self._get_delete_entities_from_search_output(search_output, data, filters)
    deleted_entities = self._delete_entities(to_be_deleted, filters)
    added_entities = self._add_entities(to_be_added, filters, entity_type_map)

    return {"deleted_entities": deleted_entities, "added_entities": added_entities}
```

## 13.5 实体提取：`_retrieve_nodes_from_data()`

第一步用 LLM 的 Tool Calling 提取文本中的实体：

```python
def _retrieve_nodes_from_data(self, data, filters):
    _tools = [EXTRACT_ENTITIES_TOOL]
    # 结构化输出模式（OpenAI Structured）
    if self.llm_provider in ["azure_openai_structured", "openai_structured"]:
        _tools = [EXTRACT_ENTITIES_STRUCT_TOOL]

    search_results = self.llm.generate_response(
        messages=[
            {"role": "system", "content": "你是一个实体提取专家，提取文本中的命名实体。"},
            {"role": "user", "content": data},
        ],
        tools=_tools,
    )

    # 解析工具调用结果
    entity_type_map = {}
    for result in search_results:
        entity_type_map[result["entity"]] = result["entity_type"]

    return entity_type_map
```

`EXTRACT_ENTITIES_TOOL` 是一个 LLM Function Calling 定义，要求 LLM 返回：

```json
[
    {"entity": "Alice", "entity_type": "person"},
    {"entity": "上海", "entity_type": "city"},
    {"entity": "绿茶", "entity_type": "beverage"}
]
```

## 13.6 关系建立：`_establish_nodes_relations_from_data()`

第二步用 LLM 提取实体之间的关系（Cypher 三元组格式）：

```python
def _establish_nodes_relations_from_data(self, data, filters, entity_type_map):
    _tools = [RELATIONS_TOOL]
    
    response = self.llm.generate_response(
        messages=[
            {"role": "system", "content": EXTRACT_RELATIONS_PROMPT},
            {"role": "user", "content": data},
        ],
        tools=_tools,
    )

    # 返回三元组列表
    # [("Alice", "LIVES_IN", "上海"), ("Alice", "LIKES", "绿茶")]
    return response
```

`EXTRACT_RELATIONS_PROMPT` 要求 LLM 以 Cypher 关系风格返回关系，大写下划线命名（如 `LIVES_IN`、`WORKS_AT`）。

## 13.7 写入 Neo4j：`_add_entities()`

```python
def _add_entities(self, to_be_added, filters, entity_type_map):
    added_entities = []

    for source, relation, target in to_be_added:
        source_type = entity_type_map.get(source, "entity")
        target_type = entity_type_map.get(target, "entity")

        # 清理关系名（移除特殊字符，Cypher 安全）
        relation = sanitize_relationship_for_cypher(relation)

        # Cypher MERGE：存在则匹配，不存在则创建
        cypher = f"""
        MERGE (n:{source_type} {{name: $source_name, user_id: $user_id}})
        ON CREATE SET n.created_at = $created_at, n.embedding = $source_embedding
        ON MATCH SET n.updated_at = $updated_at

        MERGE (m:{target_type} {{name: $target_name, user_id: $user_id}})
        ON CREATE SET m.created_at = $created_at, m.embedding = $target_embedding
        ON MATCH SET m.updated_at = $updated_at

        MERGE (n)-[r:{relation}]->(m)
        ON CREATE SET r.created_at = $created_at
        ON MATCH SET r.updated_at = $updated_at
        """

        # 节点的向量嵌入（用于相似节点搜索）
        source_embedding = self.embedding_model.embed(source, "add")
        target_embedding = self.embedding_model.embed(target, "add")

        self.graph.query(cypher, params={
            "source_name": source, "target_name": target,
            "user_id": filters["user_id"],
            "source_embedding": source_embedding,
            "target_embedding": target_embedding,
            "created_at": datetime.now().isoformat(),
            "updated_at": datetime.now().isoformat(),
        })
        added_entities.append({"source": source, "relationship": relation, "target": target})

    return added_entities
```

关键：节点存储时同时写入 **embedding 向量**，用于后续的向量相似度搜索（找到语义相近的节点）。

## 13.8 图搜索：向量 + BM25 混合

```python
def search(self, query, filters, limit=100):
    # 1. 提取查询中的实体
    entity_type_map = self._retrieve_nodes_from_data(query, filters)

    # 2. 在图数据库中搜索相关节点的邻居关系
    search_output = self._search_graph_db(
        node_list=list(entity_type_map.keys()),
        filters=filters
    )

    if not search_output:
        return []

    # 3. BM25 重排序（图搜索结果的二次排序）
    search_outputs_sequence = [
        [item["source"], item["relationship"], item["destination"]]
        for item in search_output
    ]
    bm25 = BM25Okapi(search_outputs_sequence)
    tokenized_query = query.split(" ")
    reranked_results = bm25.get_top_n(tokenized_query, search_outputs_sequence, n=5)

    return [
        {"source": r[0], "relationship": r[1], "destination": r[2]}
        for r in reranked_results
    ]
```

图搜索用了两层排序：
1. **向量相似度**（找到语义相近的实体节点）
2. **BM25 关键词匹配**（对搜索结果二次精排）

## 13.9 图搜索的 Cypher 查询

```python
def _search_graph_db(self, node_list, filters):
    result_relations = []

    for node in node_list:
        # 用向量相似度找语义相近的节点
        n_embedding = self.embedding_model.embed(node, "search")

        # Cypher: 找相似节点及其关系
        cypher = f"""
        MATCH (n {self.node_label} {{user_id: $user_id}})
        WHERE n.embedding IS NOT NULL
        WITH n, vector.similarity.cosine(n.embedding, $n_embedding) AS score
        WHERE score >= $threshold
        MATCH (n)-[r]->(m {self.node_label} {{user_id: $user_id}})
        RETURN n.name AS source, type(r) AS relationship, m.name AS destination, score
        ORDER BY score DESC
        LIMIT 10
        """

        result = self.graph.query(cypher, params={
            "user_id": filters["user_id"],
            "n_embedding": n_embedding,
            "threshold": self.threshold,
        })
        result_relations.extend(result)

    return result_relations
```

## 13.10 add() 与图写入的并行关系

回顾第 5 章，add() 内部：

```python
with concurrent.futures.ThreadPoolExecutor() as executor:
    future1 = executor.submit(self._add_to_vector_store, ...)  # 向量写入
    future2 = executor.submit(self._add_to_graph, ...)         # 图写入（并行！）
```

图写入的实际调用：

```python
def _add_to_graph(self, messages, filters):
    if self.enable_graph:
        # 拼接所有非 system 消息
        data = "\n".join([
            msg["content"] for msg in messages
            if "content" in msg and msg["role"] != "system"
        ])
        added_entities = self.graph.add(data, filters)
    return added_entities
```

## 13.11 小结

MemoryGraph 的设计精华：

1. **LLM 驱动提取**：实体和关系都用 LLM 提取，不依赖规则
2. **向量化节点**：每个实体节点存储 embedding，支持语义相近节点搜索
3. **BM25 二次排序**：图搜索结果用 BM25 精排，提升相关性
4. **MERGE 幂等写入**：Cypher MERGE 保证重复运行不产生重复节点
5. **与向量库并行**：不增加总体延迟

图记忆和向量记忆互补：向量记忆适合"关于某人有哪些事实"，图记忆适合"这些实体之间有什么关系"。下一章深入实体提取和关系构建的细节。
