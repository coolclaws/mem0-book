# 第 20 章　框架集成：LangGraph / CrewAI / AutoGen

## 20.1 集成的通用模式

无论哪个框架，mem0 的集成都遵循同一个模式：

```
1. 对话前：mem0.search(query, user_id) → 注入上下文
2. 对话中：框架处理对话逻辑
3. 对话后：mem0.add(messages, user_id) → 存储记忆
```

这三步像三明治一样夹住框架的执行，让任何 Agent 框架都能"有记忆"。

## 20.2 LangGraph + mem0

LangGraph 的状态机架构与 mem0 的集成非常自然——把记忆检索和存储封装为图节点。

### 安装

```bash
pip install langgraph langchain-openai mem0ai
```

### 客服 Agent 示例

```python
from typing import Annotated, TypedDict, List
from langgraph.graph import StateGraph, START
from langgraph.graph.message import add_messages
from langchain_openai import ChatOpenAI
from langchain_core.messages import SystemMessage, HumanMessage, AIMessage
from mem0 import MemoryClient

llm = ChatOpenAI(model="gpt-4.1-nano-2025-04-14")
mem0 = MemoryClient()

# 定义图状态
class State(TypedDict):
    messages: Annotated[List[HumanMessage | AIMessage], add_messages]
    mem0_user_id: str

graph = StateGraph(State)

def chatbot(state: State):
    messages = state["messages"]
    user_id = state["mem0_user_id"]

    # 1. 检索相关记忆
    memories = mem0.search(messages[-1].content, user_id=user_id)
    context = "\n".join(
        f"- {m['memory']}" for m in memories.get("results", [])
    )

    system_message = SystemMessage(content=f"""你是一个贴心的客服助手。
根据以下用户历史记录提供个性化服务：
{context}""")

    # 2. LLM 生成回复
    full_messages = [system_message] + messages
    response = llm.invoke(full_messages)

    # 3. 存储本次对话记忆
    mem0.add(
        [
            {"role": "user", "content": messages[-1].content},
            {"role": "assistant", "content": response.content},
        ],
        user_id=user_id,
    )

    return {"messages": [response]}

graph.add_node("chatbot", chatbot)
graph.add_edge(START, "chatbot")
compiled_graph = graph.compile()

# 使用
result = compiled_graph.invoke({
    "messages": [HumanMessage(content="我上次买的耳机有问题")],
    "mem0_user_id": "alice",
})
```

### 多节点流程

对于更复杂的工作流，可以把记忆操作拆分为独立节点：

```python
def retrieve_memories(state: State):
    """记忆检索节点"""
    query = state["messages"][-1].content
    memories = mem0.search(query, user_id=state["mem0_user_id"], limit=5)
    return {"context": [m["memory"] for m in memories.get("results", [])]}

def save_memories(state: State):
    """记忆存储节点"""
    last_human = next(m for m in reversed(state["messages"]) if isinstance(m, HumanMessage))
    last_ai = next(m for m in reversed(state["messages"]) if isinstance(m, AIMessage))
    mem0.add(
        [{"role": "user", "content": last_human.content},
         {"role": "assistant", "content": last_ai.content}],
        user_id=state["mem0_user_id"]
    )
    return {}

graph.add_node("retrieve_memories", retrieve_memories)
graph.add_node("chatbot", chatbot)
graph.add_node("save_memories", save_memories)
graph.add_edge(START, "retrieve_memories")
graph.add_edge("retrieve_memories", "chatbot")
graph.add_edge("chatbot", "save_memories")
```

## 20.3 CrewAI + mem0

CrewAI 的 Agent 协作框架可以通过 mem0 实现跨任务的偏好记忆。

```bash
pip install crewai crewai-tools mem0ai
```

### 旅行规划 Agent

```python
from crewai import Agent, Task, Crew, Process
from mem0 import MemoryClient

mem0 = MemoryClient()

def get_user_preferences(user_id: str) -> str:
    """从 mem0 检索用户偏好"""
    memories = mem0.search("旅行偏好 目的地 预算", user_id=user_id)
    if memories.get("results"):
        return "\n".join(f"- {m['memory']}" for m in memories["results"])
    return "暂无历史偏好记录"

def save_trip_preferences(user_id: str, preferences: list):
    """保存用户偏好到 mem0"""
    mem0.add(preferences, user_id=user_id)

# 存储用户对话历史
conversation = [
    {"role": "user", "content": "我想去海边度假，预算 5000 元以内"},
    {"role": "assistant", "content": "好的，为您推荐几个海边目的地"},
    {"role": "user", "content": "我不喜欢人多的地方，希望安静一些"},
]
save_trip_preferences("alice", conversation)

# 读取偏好，动态构建 Agent
user_prefs = get_user_preferences("alice")

travel_agent = Agent(
    role="旅行规划专家",
    goal="根据用户偏好提供个性化旅行方案",
    backstory=f"""你是一位经验丰富的旅行规划师。
    
用户历史偏好：
{user_prefs}

请根据以上历史记录，为用户提供高度个性化的建议。""",
    verbose=True,
)

planning_task = Task(
    description="为用户规划一个符合其偏好的三天旅行方案",
    expected_output="包含目的地、行程安排、预算分配的完整旅行计划",
    agent=travel_agent,
)

crew = Crew(
    agents=[travel_agent],
    tasks=[planning_task],
    process=Process.sequential,
)

result = crew.kickoff()
print(result)
```

## 20.4 AutoGen + mem0

AutoGen 的多 Agent 对话框架可以通过 mem0 共享记忆。

```bash
pip install autogen mem0ai
```

```python
import os
from autogen import ConversableAgent
from mem0 import MemoryClient
from openai import OpenAI

memory_client = MemoryClient()
openai_client = OpenAI()
USER_ID = "support-user-001"

# AutoGen Agent
agent = ConversableAgent(
    "support-bot",
    llm_config={"config_list": [{"model": "gpt-4.1-nano-2025-04-14", "api_key": os.environ["OPENAI_API_KEY"]}]},
    code_execution_config=False,
    human_input_mode="NEVER",
)

def chat_with_memory(user_message: str) -> str:
    # 1. 检索历史记忆
    memories = memory_client.search(user_message, user_id=USER_ID, limit=3)
    memory_context = "\n".join(
        f"- {m['memory']}" for m in memories.get("results", [])
    )

    # 2. 注入记忆到系统 prompt
    system_with_memory = f"""你是一个智能客服助手。
    
已知用户信息：
{memory_context}

请基于以上信息提供个性化服务。"""

    # 3. AutoGen 处理对话
    reply = agent.generate_reply(
        messages=[
            {"role": "system", "content": system_with_memory},
            {"role": "user", "content": user_message},
        ]
    )

    # 4. 存储本次交互
    memory_client.add(
        [{"role": "user", "content": user_message},
         {"role": "assistant", "content": reply}],
        user_id=USER_ID,
    )
    return reply

# 多轮对话测试
print(chat_with_memory("我的电视出现横线，型号是 Sony A80K"))
print(chat_with_memory("上次说的问题解决了，但声音有点小"))
print(chat_with_memory("你还记得我的电视型号吗？"))  # mem0 会记住！
```

## 20.5 OpenAI Agents SDK + mem0

OpenAI 官方的 Agents SDK 通过 Function Tool 集成 mem0：

```bash
pip install openai-agents mem0ai
```

```python
from agents import Agent, Runner, function_tool
from mem0 import MemoryClient

mem0 = MemoryClient()

@function_tool
def search_memory(query: str, user_id: str) -> str:
    """搜索用户的历史记忆和偏好"""
    memories = mem0.search(query, user_id=user_id, limit=5)
    if memories.get("results"):
        return "\n".join(f"- {m['memory']}" for m in memories["results"])
    return "暂无相关记忆"

@function_tool
def save_memory(content: str, user_id: str) -> str:
    """保存重要信息到用户记忆"""
    mem0.add([{"role": "user", "content": content}], user_id=user_id)
    return "已保存到记忆"

# 带记忆工具的 Agent
personal_assistant = Agent(
    name="PersonalAssistant",
    instructions="""你是一个智能个人助手。
使用 search_memory 工具查询用户历史偏好。
在对话结束时，使用 save_memory 保存重要信息。""",
    tools=[search_memory, save_memory],
)

result = Runner.run_sync(
    personal_assistant,
    "帮我推荐一家餐厅，我不吃辣",
    context={"user_id": "alice"},
)
print(result.final_output)
```

## 20.6 集成模式总结

四个框架的集成有共同的工程模式：

```
┌─────────────────────────────────────┐
│           集成层（你的代码）           │
│                                     │
│  pre_hook:  mem0.search() → context │
│  execution: Framework.run()         │
│  post_hook: mem0.add(messages)      │
└─────────────────────────────────────┘
         ↑                  ↑
    框架无关              存储无关
```

**最佳实践**：

1. **搜索时精简**：`limit=3~5` 足够，不要把所有记忆都注入
2. **存储时完整**：存储完整对话（user + assistant），不只存用户消息
3. **异步优化**：在高并发场景下，用 `AsyncMemory` 或 `AsyncMemoryClient`
4. **错误隔离**：记忆操作失败不应该中断主对话流程

```python
# 错误隔离示例
async def safe_search(query, user_id):
    try:
        result = await memory.search(query, user_id=user_id)
        return result.get("results", [])
    except Exception as e:
        logger.warning(f"Memory search failed: {e}")
        return []  # 降级：没有记忆，继续对话
```

## 20.7 小结

mem0 的框架集成核心是"三明治模式"：

1. **前置**：用 `search()` 注入历史上下文
2. **中层**：框架正常执行（LangGraph/CrewAI/AutoGen）
3. **后置**：用 `add()` 持久化本次对话

这种模式无侵入、可降级，适用于任何支持系统 Prompt 注入的 Agent 框架。

下一章（附录）提供快速参考资料。
