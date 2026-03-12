# 第 16 章　Prompt 工程：事实提取与记忆决策

## 16.1 两个关键 Prompt

mem0 的智能核心是两个精心设计的 Prompt：

1. **FACT_RETRIEVAL_PROMPT**：从对话中提取有价值的事实
2. **DEFAULT_UPDATE_MEMORY_PROMPT**：对比新旧记忆，决定增删改

这两个 Prompt 的质量直接决定 mem0 的记忆效果。理解它们，才能理解为什么 mem0 能做到"记得准"。

## 16.2 FACT_RETRIEVAL_PROMPT：事实提取的哲学

### 核心任务定义

```
你是一个个人信息整理专家，专门从对话中提取有价值的事实。

需要提取的信息类型：
1. 个人偏好：喜好、厌恶、特定偏好（食物、产品、活动、娱乐）
2. 重要个人信息：姓名、关系、重要日期
3. 计划和意图：未来事件、旅行、目标
4. 活动和服务偏好：餐饮、出行、爱好
5. 健康和wellness偏好：饮食限制、健身习惯
6. 职业信息：职位、工作习惯、职业目标
7. 杂项：喜欢的书、电影、品牌等
```

### Few-Shot 示例的精妙设计

```python
# 示例 1：空闲对话 → 无事实
Input: "Hi."
Output: {"facts": []}

# 示例 2：一般陈述 → 无事实（树上有树枝不是个人信息）
Input: "There are branches in trees."
Output: {"facts": []}

# 示例 3：有价值的偏好 → 提取
Input: "Hi, I am looking for a restaurant in San Francisco."
Output: {"facts": ["Looking for a restaurant in San Francisco"]}

# 示例 4：多个事实 → 分开提取
Input: "Hi, my name is John. I am a software engineer."
Output: {"facts": ["Name is John", "Is a Software engineer"]}
```

关键设计点：**事实粒度**。每条事实尽量是独立的、原子性的。"John 是软件工程师"拆成两条，而不是"John 是叫 John 的软件工程师"。

### USER vs AGENT 记忆提取

mem0 有两个版本的提取 Prompt：

```python
# 用户记忆：只从用户消息提取，忽略 assistant
USER_MEMORY_EXTRACTION_PROMPT:
  # [IMPORTANT]: GENERATE FACTS SOLELY BASED ON THE USER'S MESSAGES.
  # [IMPORTANT]: YOU WILL BE PENALIZED IF YOU INCLUDE INFORMATION FROM ASSISTANT.

# Agent 记忆：只从 assistant 消息提取
AGENT_MEMORY_EXTRACTION_PROMPT:
  # [IMPORTANT]: GENERATE FACTS SOLELY BASED ON THE ASSISTANT'S MESSAGES.
```

触发条件：`agent_id` 存在且消息中有 `assistant` 角色 → 用 Agent 提取模式。这让 mem0 能分别记录"用户说了什么"和"Agent 表现出什么特质/能力"。

### 语言自适应

```
你应该检测用户输入的语言，并用相同语言记录事实。
```

如果用户说中文，提取的事实也是中文；说英文就英文。不做语言归一化，避免信息损失。

## 16.3 DEFAULT_UPDATE_MEMORY_PROMPT：冲突解消的艺术

这是 mem0 最复杂的 Prompt，教 LLM 如何像人类一样管理记忆。

### 四种操作的判断准则

**ADD（新增）**：
```
如果新事实在记忆中不存在 → ADD
生成新 ID（不复用旧 ID）

示例：
旧记忆: [{"id": "0", "text": "User is a software engineer"}]
新事实: ["Name is John"]
→ ADD: {"id": "1", "text": "Name is John"}
```

**UPDATE（更新）**：
```
如果新事实与已有记忆描述同一件事但内容不同 → UPDATE
保留信息量更多的版本
保留原 ID

关键判断：
  "喜欢板球" + "喜欢和朋友打板球" → UPDATE（后者信息更丰富）
  "喜欢芝士披萨" + "爱芝士披萨" → NONE（语义相同，不更新）
```

**DELETE（删除）**：
```
如果新事实与已有记忆矛盾 → DELETE

示例：
旧记忆: "喜欢芝士披萨"
新事实: "不喜欢芝士披萨"
→ DELETE 旧记忆，ADD 新记忆
```

**NONE（不变）**：
```
如果新事实已经在记忆中，内容相同 → NONE
```

### 完整 few-shot 示例

```json
// 场景：同时触发 UPDATE 和 ADD
旧记忆:
  [{"id":"0","text":"I really like cheese pizza"},
   {"id":"1","text":"User is a software engineer"},
   {"id":"2","text":"User likes to play cricket"}]

新事实: ["Loves chicken pizza", "Loves to play cricket with friends"]

输出:
{
  "memory": [
    {"id":"0","text":"Loves cheese and chicken pizza","event":"UPDATE","old_memory":"I really like cheese pizza"},
    {"id":"1","text":"User is a software engineer","event":"NONE"},
    {"id":"2","text":"Loves to play cricket with friends","event":"UPDATE","old_memory":"User likes to play cricket"}
  ]
}
```

注意："芝士披萨"和"鸡肉披萨"被合并为一条记忆而不是两条，体现了"信息压缩"的原则。

## 16.4 PROCEDURAL_MEMORY_SYSTEM_PROMPT

程序性记忆的提取 Prompt 完全不同——它不提取用户偏好，而是记录 Agent 的**执行历史**：

```
你是一个记忆摘要系统，记录人类与 AI Agent 之间完整的交互历史。
你会收到 Agent 过去 N 步的执行历史，需要生成一份全面的摘要。

每个步骤必须包含：
1. Agent 动作（精确描述做了什么）
2. 动作结果（原始输出，不能改写）
3. 嵌入的元数据：
   - Key Findings（发现的重要信息）
   - Navigation History（访问的 URL）
   - Errors & Challenges（遇到的错误）
   - Current Context（当前状态）
```

这个 Prompt 专为 Browser Agent 等工具型 Agent 设计，让 Agent 能在长任务中"记住自己做到哪了"。

## 16.5 自定义 Prompt 的场景

### 领域特化

```python
# 医疗场景：提取医疗相关信息
config = MemoryConfig(
    custom_fact_extraction_prompt="""
你是一个专业的医疗信息整理专家。
只提取医疗相关信息：诊断、用药、过敏、手术史、家族病史、生活方式等。
绝对不提取：政治观点、宗教信仰、职业信息。

返回格式：{"facts": ["事实1", "事实2"]}
"""
)
```

### 严格更新规则

```python
# 金融场景：投资记录不删除，只追加
config = MemoryConfig(
    custom_update_memory_prompt="""
你是金融信息管理员。规则：
1. 投资记录（买入/卖出）永远 ADD，不能 UPDATE 或 DELETE（合规要求）
2. 持仓信息可以 UPDATE（保留最新持仓）
3. 风险偏好可以 UPDATE（用户可以改变）
4. 相同信息 → NONE
"""
)
```

### 多语言场景

```python
# 强制中文记录
config = MemoryConfig(
    custom_fact_extraction_prompt="""
...
[重要]: 无论用户使用什么语言，所有事实必须用中文记录。
"""
)
```

## 16.6 Prompt 工程的关键洞察

分析 mem0 的 Prompt 设计，可以提炼出几个通用原则：

**1. Few-Shot > Zero-Shot**：通过具体例子教 LLM 边界判断，比单纯文字描述更可靠

**2. 惩罚机制**："YOU WILL BE PENALIZED" 是提升 LLM 遵守规则概率的经典技巧

**3. 边界案例明确化**：明确列出"不提取什么"（如 "Hi."），避免 LLM 过度提取

**4. 格式约束 + JSON Schema**：`response_format={"type": "json_object"}` 配合 Prompt 中的格式示例，双重保证格式正确

**5. 信息量优先**：UPDATE 规则的核心是"保留信息量更多的版本"，而不是机械地用新的替换旧的

## 16.7 小结

mem0 的 Prompt 工程体现了深刻的产品思考：

- 事实提取的粒度适中，既不过细（每个词都存），也不过粗（一段话存一条）
- 更新决策的语义感知，能区分"语义相同"和"内容增量"
- 双角色提取（用户/Agent），为不同记忆范围服务
- 完全可定制，满足垂直领域需求

下一章进入客户端层，解析 Python SDK 的自托管与托管双模式实现。
