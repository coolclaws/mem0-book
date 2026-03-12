# 第 14 章　实体提取与关系构建

## 14.1 图记忆的核心问题

把非结构化文本变成知识图谱，需要回答三个问题：
1. **有哪些实体？**（Alice、上海、绿茶）
2. **它们之间是什么关系？**（Alice LIVES_IN 上海）
3. **新信息和旧信息有冲突吗？**（Alice 从上海搬到北京）

mem0 用 LLM 的 Tool Calling / Function Calling 能力来回答这三个问题。

## 14.2 Tool 定义：LLM 的指令集

`mem0/graphs/tools.py` 定义了图操作的工具集合：

### EXTRACT_ENTITIES_TOOL

```python
EXTRACT_ENTITIES_TOOL = {
    "type": "function",
    "function": {
        "name": "establish_nodes",
        "description": "从对话文本中提取实体及其类型",
        "parameters": {
            "type": "object",
            "properties": {
                "entities": {
                    "type": "array",
                    "items": {
                        "type": "object",
                        "properties": {
                            "entity": {"type": "string"},
                            "entity_type": {"type": "string"}
                        }
                    }
                }
            }
        }
    }
}
```

### ADD_MEMORY_TOOL_GRAPH

```python
ADD_MEMORY_TOOL_GRAPH = {
    "function": {
        "name": "add_graph_memory",
        "description": "在知识图谱中新增两个节点之间的关系",
        "parameters": {
            "properties": {
                "source": {"type": "string"},
                "destination": {"type": "string"},
                "relationship": {"type": "string"},
                "source_type": {"type": "string"},
                "destination_type": {"type": "string"},
            }
        }
    }
}
```

### UPDATE_MEMORY_TOOL_GRAPH

```python
UPDATE_MEMORY_TOOL_GRAPH = {
    "function": {
        "name": "update_graph_memory",
        "description": "更新已有关系（只能改关系类型，不能改节点）",
        "parameters": {
            "properties": {
                "source": {"type": "string"},
                "destination": {"type": "string"},
                "relationship": {"type": "string"},  # 新的关系类型
            }
        }
    }
}
```

### DELETE_MEMORY_TOOL_GRAPH

```python
DELETE_MEMORY_TOOL_GRAPH = {
    "function": {
        "name": "delete_graph_memory",
        "description": "删除已有关系（当新信息使旧关系失效时）",
        "parameters": {
            "properties": {
                "source": {"type": "string"},
                "destination": {"type": "string"},
                "relationship": {"type": "string"},
            }
        }
    }
}
```

## 14.3 EXTRACT_RELATIONS_PROMPT：关系提取原则

```
你是一个高级算法，从文本中提取结构化信息以构建知识图谱。

核心原则：
1. 只提取文本中明确陈述的信息
2. 建立实体间的关系
3. 用 "USER_ID" 代替自我指代（"我"、"我的"）

关系类型规范：
- 使用一致、通用、无时态的关系类型
- 推荐: "professor" 而非 "became_professor"
- 关系只能建立在用户消息中明确提到的实体之间

实体一致性：
- 确保关系在上下文中合理
- 跨提取保持实体名称一致
```

这个 Prompt 有一个关键设计：用 `USER_ID` 替代"我"。因为图节点需要稳定的标识符，而"我"在不同对话中都指同一个用户。

## 14.4 关系冲突解消：UPDATE_GRAPH_PROMPT

当新信息与已有图记忆冲突时：

```
你是一个图记忆管理专家。分析已有图记忆和新信息，更新关系以确保最准确的知识表示。

Guidelines：
1. 用 source + target 作为主键匹配
2. 冲突处理：
   - 相同 source/target 但关系不同 → UPDATE 关系
   - 新信息更新或更准确 → UPDATE
3. 时效性：有时间戳时，优先采信更新的信息
4. 去重：合并高度相似的关系

Memory 格式：source -- RELATIONSHIP -- destination

示例：
已有: Alice -- LIVES_IN -- 北京
新增: Alice 搬到上海了
结果: UPDATE Alice -- LIVES_IN -- 上海
```

## 14.5 Cypher 安全：`sanitize_relationship_for_cypher()`

LLM 提取的关系名可能包含不合法的 Cypher 字符：

```python
def sanitize_relationship_for_cypher(relationship):
    """
    把 LLM 生成的关系名转为合法的 Cypher 关系类型
    规则：只保留字母数字下划线，转大写，空格→下划线
    """
    # 移除非字母数字字符（保留下划线）
    sanitized = re.sub(r'[^a-zA-Z0-9_]', '_', relationship)
    # 转大写（Cypher 关系类型惯例）
    sanitized = sanitized.upper()
    # 数字开头加前缀（Cypher 不允许数字开头）
    if sanitized and sanitized[0].isdigit():
        sanitized = f"REL_{sanitized}"
    return sanitized

# 示例
sanitize_relationship_for_cypher("lives in")       → "LIVES_IN"
sanitize_relationship_for_cypher("works-at (2024)") → "WORKS_AT__2024_"
sanitize_relationship_for_cypher("123abc")          → "REL_123ABC"
```

## 14.6 BM25 混合检索

图搜索结果的二次排序用 BM25（Best Match 25），这是一种经典的词频-逆文档频率算法：

```python
from rank_bm25 import BM25Okapi

# 搜索输出转为 token 序列
search_outputs_sequence = [
    ["Alice", "LIVES_IN", "上海"],
    ["Alice", "LIKES", "绿茶"],
    ["Bob", "COLLEAGUE_OF", "Alice"],
]

bm25 = BM25Okapi(search_outputs_sequence)
tokenized_query = "Alice 住在哪里".split(" ")
top_5 = bm25.get_top_n(tokenized_query, search_outputs_sequence, n=5)
```

**为什么用 BM25 而不是向量相似度？**

向量相似度已经在 `_search_graph_db()` 阶段用于找到语义相近的节点。BM25 作为二次排序，基于关键词精确匹配对结果再次排序——两者互补，提升整体召回和排序质量。

## 14.7 实体节点的向量化

每个写入图数据库的节点同时存储其 embedding：

```python
source_embedding = self.embedding_model.embed(source, "add")
target_embedding = self.embedding_model.embed(target, "add")

# Cypher MERGE，ON CREATE 时存储 embedding
cypher = f"""
MERGE (n {{name: $source_name, user_id: $user_id}})
ON CREATE SET n.embedding = $source_embedding
...
"""
```

这使得图搜索可以用向量相似度找到语义相近的节点，而不只是精确匹配。

例如：搜索 "Alice 的居住地"，可以找到名为 "Alice" 节点（即使查询里写的是 "爱丽丝"），因为向量空间中两者相近。

## 14.8 Neo4j 索引策略

```python
# 创建用于过滤的索引
self.graph.query(
    f"CREATE INDEX entity_single IF NOT EXISTS FOR (n {self.node_label}) ON (n.user_id)"
)
# 复合索引（Neo4j Enterprise）
self.graph.query(
    f"CREATE INDEX entity_composite IF NOT EXISTS FOR (n {self.node_label}) ON (n.name, n.user_id)"
)
```

`__Entity__` 标签（当 `base_label=True`）：所有节点统一打上 `__Entity__` 标签，方便批量操作和索引管理。

## 14.9 `delete_all()` 的 Cypher

```python
def delete_all(self, filters):
    cypher = f"""
    MATCH (n {self.node_label} {{user_id: $user_id}})
    DETACH DELETE n
    """
    self.graph.query(cypher, params={"user_id": filters["user_id"]})
```

`DETACH DELETE` 会同时删除节点及其所有关联的关系，确保图的完整性。

## 14.10 图记忆 vs 向量记忆的互补关系

| 维度 | 向量记忆 | 图记忆 |
|------|---------|-------|
| 存储内容 | 提炼后的事实文本 | 实体关系三元组 |
| 检索方式 | 语义相似度 | 图遍历 + 向量 + BM25 |
| 擅长 | "Alice 有哪些特征" | "Alice 和 Bob 的关系" |
| 推理能力 | 单跳（直接相关） | 多跳（关系链推理） |
| 存储后端 | 向量库 | Neo4j |
| 必须性 | 必须 | 可选 |

## 14.11 小结

图记忆系统的关键技术点：

1. **Tool Calling 驱动**：实体提取、关系建立、冲突解消都用 LLM 工具调用
2. **三步写入**：提取实体 → 提取关系 → 检测冲突并更新
3. **向量化节点**：图节点存储 embedding，支持语义节点搜索
4. **BM25 精排**：图搜索结果的二次排序
5. **Cypher 安全**：对 LLM 输出做关系名清理，防止注入

下一章进入 LLM 集成层，解析 mem0 如何支持 15+ LLM 提供商的可插拔架构。
