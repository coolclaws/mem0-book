# 第 15 章　LLM 抽象层与 Factory 模式

## 15.1 LLM 在 mem0 中的角色

mem0 每次 `add()` 至少调用 LLM 两次：
1. **事实提取**：把对话转为结构化事实列表
2. **更新决策**：比较新旧事实，决定 ADD/UPDATE/DELETE/NONE

图记忆模式下还会调用 LLM 做实体提取和关系建立。因此，LLM 的质量和速度直接影响整个系统的表现。

## 15.2 LLMBase：单一抽象接口

```python
class LLMBase(ABC):
    def __init__(self, config=None):
        if config is None:
            self.config = BaseLlmConfig()
        elif isinstance(config, dict):
            self.config = BaseLlmConfig(**config)
        else:
            self.config = config
        self._validate_config()

    @abstractmethod
    def generate_response(
        self,
        messages: List[Dict[str, str]],
        tools: Optional[List[Dict]] = None,
        tool_choice: str = "auto",
        **kwargs
    ) -> Union[str, Dict]:
        """
        生成回复。
        - 无 tools 时返回 str（文本回复）
        - 有 tools 时返回 dict（包含 content + tool_calls）
        """
        pass
```

`generate_response()` 是所有 LLM 适配器的唯一公开接口，支持两种调用模式：
- **普通生成**：用于事实提取、更新决策（返回 JSON 字符串）
- **Tool Calling**：用于图记忆的实体/关系提取（返回工具调用结果）

## 15.3 推理模型的特殊处理

v1.0 新增了对 o1/o3/GPT-5 系列推理模型的识别：

```python
def _is_reasoning_model(self, model: str) -> bool:
    reasoning_models = {"o1", "o1-preview", "o3-mini", "o3", "gpt-5", ...}
    return model.lower() in reasoning_models

def _get_supported_params(self, **kwargs) -> Dict:
    if self._is_reasoning_model(self.config.model):
        # 推理模型不支持 temperature/top_p，过滤掉
        return {
            "messages": kwargs.get("messages"),
            "response_format": kwargs.get("response_format"),
            "tools": kwargs.get("tools"),
            "tool_choice": kwargs.get("tool_choice"),
        }
    else:
        return self._get_common_params(**kwargs)
```

推理模型（如 o1）不支持 `temperature` 和 `top_p` 参数，直接传会报错。`_get_supported_params()` 自动过滤，让 mem0 能透明支持推理模型。

## 15.4 OpenAI LLM（默认）

```python
class OpenAILLM(LLMBase):
    def __init__(self, config=None):
        # 默认模型
        self.config.model = self.config.model or "gpt-4.1-nano-2025-04-14"

        # 自动检测 OpenRouter
        if os.environ.get("OPENROUTER_API_KEY"):
            self.client = OpenAI(
                api_key=os.environ["OPENROUTER_API_KEY"],
                base_url="https://openrouter.ai/api/v1",
            )
        else:
            self.client = OpenAI(
                api_key=self.config.api_key or os.getenv("OPENAI_API_KEY"),
                base_url=self.config.openai_base_url or "https://api.openai.com/v1",
            )

    def generate_response(self, messages, tools=None, tool_choice="auto", **kwargs):
        params = {
            "model": self.config.model,
            "messages": messages,
            **self._get_supported_params(**kwargs)
        }

        if tools:
            params["tools"] = tools
            params["tool_choice"] = tool_choice

        response = self.client.chat.completions.create(**params)
        return self._parse_response(response, tools)
```

OpenRouter 支持：如果设置了 `OPENROUTER_API_KEY`，自动切换到 OpenRouter，可以用一个 key 访问几乎所有模型。

## 15.5 结构化输出：OpenAI Structured

```python
class OpenAIStructuredLLM(OpenAILLM):
    """
    使用 OpenAI Structured Outputs（response_format=json_schema）
    保证 100% 合法 JSON，不需要手动解析或错误处理
    """
    def generate_response(self, messages, response_format=None, ...):
        if response_format and isinstance(response_format, dict):
            # 使用 Pydantic 模型定义 schema
            params["response_format"] = response_format
```

与普通 `response_format={"type": "json_object"}` 的区别：Structured Outputs 通过 JSON Schema 约束输出格式，保证字段名和类型完全正确，适合生产环境。

## 15.6 主要 LLM 适配器

### Anthropic Claude

```python
config = MemoryConfig(
    llm=LlmConfig(
        provider="anthropic",
        config={
            "model": "claude-opus-4-5",
            "temperature": 0,
            "max_tokens": 2000,
        }
    )
)
```

Claude 系列的优势：长上下文（200K tokens）、遵循指令能力强，适合需要大量历史对话的场景。

### Google Gemini

```python
config = MemoryConfig(
    llm=LlmConfig(
        provider="gemini",
        config={
            "model": "gemini-2.0-flash",
            "temperature": 0,
        }
    )
)
```

Gemini Flash 系列速度快、成本低，适合高频 add() 场景。

### Ollama（本地）

```python
config = MemoryConfig(
    llm=LlmConfig(
        provider="ollama",
        config={
            "model": "llama3.2",
            "ollama_base_url": "http://localhost:11434",
            "temperature": 0,
        }
    )
)
```

配合本地 Embedder，实现零成本、完全离线的 mem0。

### LiteLLM（通用适配器）

```python
config = MemoryConfig(
    llm=LlmConfig(
        provider="litellm",
        config={
            "model": "together_ai/mistralai/Mixtral-8x7B-Instruct-v0.1",
        }
    )
)
```

LiteLLM 支持 100+ 模型，是"兜底"选择——任何 LiteLLM 支持的模型都能直接用于 mem0。

## 15.7 LlmFactory：注册表模式

```python
class LlmFactory:
    provider_to_class = {
        "openai":                 ("mem0.llms.openai.OpenAILLM", OpenAIConfig),
        "anthropic":              ("mem0.llms.anthropic.AnthropicLLM", AnthropicConfig),
        "gemini":                 ("mem0.llms.gemini.GeminiLLM", BaseLlmConfig),
        "azure_openai":           ("mem0.llms.azure_openai.AzureOpenAILLM", AzureOpenAIConfig),
        "ollama":                 ("mem0.llms.ollama.OllamaLLM", OllamaConfig),
        "groq":                   ("mem0.llms.groq.GroqLLM", BaseLlmConfig),
        "deepseek":               ("mem0.llms.deepseek.DeepSeekLLM", DeepSeekConfig),
        "aws_bedrock":            ("mem0.llms.aws_bedrock.AWSBedrockLLM", BaseLlmConfig),
        "litellm":                ("mem0.llms.litellm.LiteLLM", BaseLlmConfig),
        "openai_structured":      ("mem0.llms.openai_structured.OpenAIStructuredLLM", OpenAIConfig),
        "azure_openai_structured":("mem0.llms.azure_openai_structured.AzureOpenAIStructuredLLM", AzureOpenAIConfig),
        "xai":                    ("mem0.llms.xai.XAILLM", BaseLlmConfig),
        "vllm":                   ("mem0.llms.vllm.VllmLLM", VllmConfig),
        "langchain":              ("mem0.llms.langchain.LangchainLLM", BaseLlmConfig),
        "lmstudio":               ("mem0.llms.lmstudio.LMStudioLLM", LMStudioConfig),
        "together":               ("mem0.llms.together.TogetherLLM", BaseLlmConfig),
        "sarvam":                 ("mem0.llms.sarvam.SarvamLLM", BaseLlmConfig),
    }

    @classmethod
    def create(cls, provider_name, config=None, **kwargs):
        class_type, config_class = cls.provider_to_class[provider_name]
        llm_class = load_class(class_type)  # 动态 import

        if config is None:
            config = config_class(**kwargs)
        elif isinstance(config, dict):
            config = config_class(**{**config, **kwargs})

        return llm_class(config)
```

每个 provider 对应两个东西：实现类的路径（字符串，懒加载）和配置类（用于类型校验）。

## 15.8 generate_response() 的两种返回格式

**普通文本模式**（事实提取、更新决策）：

```python
response = self.llm.generate_response(
    messages=[...],
    response_format={"type": "json_object"}
)
# 返回 str，如：'{"facts": ["喜欢绿茶", "住在上海"]}'
```

**Tool Calling 模式**（图记忆实体/关系提取）：

```python
response = self.llm.generate_response(
    messages=[...],
    tools=[EXTRACT_ENTITIES_TOOL],
    tool_choice="auto"
)
# 返回 dict：
# {
#     "content": None,
#     "tool_calls": [
#         {"name": "establish_nodes", "arguments": {"entities": [...]}}
#     ]
# }
```

## 15.9 小结

LLM 层的设计精华：

1. **单一接口**：`generate_response()` 统一所有提供商
2. **推理模型感知**：自动过滤不支持的参数
3. **懒加载注册**：不安装的 SDK 不会被 import
4. **OpenRouter 捷径**：一个环境变量解锁所有模型

下一章深入 Prompt 工程，解析 mem0 两个核心 Prompt 的设计逻辑。
