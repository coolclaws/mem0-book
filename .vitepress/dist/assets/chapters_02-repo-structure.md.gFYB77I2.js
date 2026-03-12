import{_ as a,o as n,c as p,ag as e}from"./chunks/framework.BZohXCq9.js";const m=JSON.parse('{"title":"第 2 章　仓库结构与模块依赖","description":"","frontmatter":{},"headers":[],"relativePath":"chapters/02-repo-structure.md","filePath":"chapters/02-repo-structure.md"}'),i={name:"chapters/02-repo-structure.md"};function l(t,s,o,c,r,d){return n(),p("div",null,[...s[0]||(s[0]=[e(`<h1 id="第-2-章-仓库结构与模块依赖" tabindex="-1">第 2 章　仓库结构与模块依赖 <a class="header-anchor" href="#第-2-章-仓库结构与模块依赖" aria-label="Permalink to &quot;第 2 章　仓库结构与模块依赖&quot;">​</a></h1><h2 id="_2-1-顶层目录一览" tabindex="-1">2.1 顶层目录一览 <a class="header-anchor" href="#_2-1-顶层目录一览" aria-label="Permalink to &quot;2.1 顶层目录一览&quot;">​</a></h2><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>mem0/                           # 根目录</span></span>
<span class="line"><span>├── mem0/                       # 核心 Python 包</span></span>
<span class="line"><span>│   ├── memory/                 # 记忆管线核心</span></span>
<span class="line"><span>│   ├── vector_stores/          # 向量数据库适配器（20+）</span></span>
<span class="line"><span>│   ├── llms/                   # LLM 适配器（15+）</span></span>
<span class="line"><span>│   ├── embeddings/             # Embedder 适配器</span></span>
<span class="line"><span>│   ├── graphs/                 # 图记忆（Neo4j）</span></span>
<span class="line"><span>│   ├── configs/                # 配置模型（Pydantic）</span></span>
<span class="line"><span>│   ├── utils/                  # 工厂类、工具函数</span></span>
<span class="line"><span>│   ├── client/                 # 托管平台客户端</span></span>
<span class="line"><span>│   ├── reranker/               # 重排序器</span></span>
<span class="line"><span>│   └── proxy/                  # 代理模式</span></span>
<span class="line"><span>│</span></span>
<span class="line"><span>├── mem0-ts/                    # TypeScript SDK</span></span>
<span class="line"><span>│   └── src/</span></span>
<span class="line"><span>│       ├── client/             # 托管平台客户端</span></span>
<span class="line"><span>│       ├── oss/                # 开源自托管</span></span>
<span class="line"><span>│       └── community/         # 社区贡献</span></span>
<span class="line"><span>│</span></span>
<span class="line"><span>├── server/                     # REST API Server (FastAPI)</span></span>
<span class="line"><span>│   ├── main.py</span></span>
<span class="line"><span>│   └── docker-compose.yaml</span></span>
<span class="line"><span>│</span></span>
<span class="line"><span>├── openmemory/                 # OpenMemory MCP 集成</span></span>
<span class="line"><span>├── examples/                   # 示例代码</span></span>
<span class="line"><span>├── cookbooks/                  # Jupyter Notebook 教程</span></span>
<span class="line"><span>├── tests/                      # 测试套件</span></span>
<span class="line"><span>├── evaluation/                 # 性能评估</span></span>
<span class="line"><span>└── embedchain/                 # 前身项目（legacy）</span></span></code></pre></div><h2 id="_2-2-核心包-mem0" tabindex="-1">2.2 核心包：<code>mem0/</code> <a class="header-anchor" href="#_2-2-核心包-mem0" aria-label="Permalink to &quot;2.2 核心包：\`mem0/\`&quot;">​</a></h2><h3 id="_2-2-1-memory-——-记忆管线核心" tabindex="-1">2.2.1 <code>memory/</code> —— 记忆管线核心 <a class="header-anchor" href="#_2-2-1-memory-——-记忆管线核心" aria-label="Permalink to &quot;2.2.1 \`memory/\` —— 记忆管线核心&quot;">​</a></h3><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>mem0/memory/</span></span>
<span class="line"><span>├── base.py          # MemoryBase ABC —— 接口契约</span></span>
<span class="line"><span>├── main.py          # Memory 类 —— 核心实现（2325 行）</span></span>
<span class="line"><span>├── graph_memory.py  # MemoryGraph —— 图记忆</span></span>
<span class="line"><span>├── storage.py       # SQLiteManager —— 历史追踪</span></span>
<span class="line"><span>├── utils.py         # 工具函数（消息解析、事实提取等）</span></span>
<span class="line"><span>├── setup.py         # 初始化与配置加载</span></span>
<span class="line"><span>├── telemetry.py     # 匿名遥测</span></span>
<span class="line"><span>└── kuzu_memory.py   # KuzuDB 图记忆（实验性）</span></span></code></pre></div><p><code>main.py</code> 是整个项目最重要的文件。它实现了 <code>Memory</code> 类，包含：</p><ul><li><code>add()</code> —— 记忆写入管线（~300 行）</li><li><code>search()</code> —— 语义检索</li><li><code>update()</code> / <code>delete()</code> / <code>get()</code> / <code>get_all()</code> —— CRUD 操作</li><li><code>history()</code> —— 变更历史</li><li><code>_add_to_vector_store()</code> —— 向量写入（含去重）</li></ul><h3 id="_2-2-2-vector-stores-——-向量存储生态" tabindex="-1">2.2.2 <code>vector_stores/</code> —— 向量存储生态 <a class="header-anchor" href="#_2-2-2-vector-stores-——-向量存储生态" aria-label="Permalink to &quot;2.2.2 \`vector_stores/\` —— 向量存储生态&quot;">​</a></h3><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>mem0/vector_stores/</span></span>
<span class="line"><span>├── base.py              # VectorStoreBase ABC</span></span>
<span class="line"><span>├── configs.py           # 各存储的配置模型</span></span>
<span class="line"><span>├── qdrant.py            # Qdrant（默认）</span></span>
<span class="line"><span>├── pinecone.py          # Pinecone</span></span>
<span class="line"><span>├── pgvector.py          # PostgreSQL pgvector</span></span>
<span class="line"><span>├── chroma.py            # ChromaDB</span></span>
<span class="line"><span>├── faiss.py             # Facebook FAISS</span></span>
<span class="line"><span>├── milvus.py            # Milvus</span></span>
<span class="line"><span>├── weaviate.py          # Weaviate</span></span>
<span class="line"><span>├── mongodb.py           # MongoDB Atlas</span></span>
<span class="line"><span>├── elasticsearch.py     # Elasticsearch</span></span>
<span class="line"><span>├── redis.py             # Redis VSS</span></span>
<span class="line"><span>├── supabase.py          # Supabase</span></span>
<span class="line"><span>├── azure_ai_search.py   # Azure AI Search</span></span>
<span class="line"><span>├── vertex_ai_vector_search.py  # Google Vertex AI</span></span>
<span class="line"><span>├── opensearch.py        # AWS OpenSearch</span></span>
<span class="line"><span>├── cassandra.py         # Cassandra</span></span>
<span class="line"><span>├── databricks.py        # Databricks Vector Search</span></span>
<span class="line"><span>├── s3_vectors.py        # AWS S3 Vectors</span></span>
<span class="line"><span>└── ...                  # 更多适配器</span></span></code></pre></div><h3 id="_2-2-3-llms-——-llm-适配器" tabindex="-1">2.2.3 <code>llms/</code> —— LLM 适配器 <a class="header-anchor" href="#_2-2-3-llms-——-llm-适配器" aria-label="Permalink to &quot;2.2.3 \`llms/\` —— LLM 适配器&quot;">​</a></h3><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>mem0/llms/</span></span>
<span class="line"><span>├── base.py              # BaseLLM ABC</span></span>
<span class="line"><span>├── configs.py           # LLM 配置模型</span></span>
<span class="line"><span>├── openai.py            # OpenAI（默认）</span></span>
<span class="line"><span>├── anthropic.py         # Anthropic Claude</span></span>
<span class="line"><span>├── gemini.py            # Google Gemini</span></span>
<span class="line"><span>├── azure_openai.py      # Azure OpenAI</span></span>
<span class="line"><span>├── ollama.py            # 本地 Ollama</span></span>
<span class="line"><span>├── groq.py              # Groq</span></span>
<span class="line"><span>├── deepseek.py          # DeepSeek</span></span>
<span class="line"><span>├── aws_bedrock.py       # AWS Bedrock</span></span>
<span class="line"><span>├── litellm.py           # LiteLLM（通用适配器）</span></span>
<span class="line"><span>├── vllm.py              # vLLM</span></span>
<span class="line"><span>├── openai_structured.py # 结构化输出版</span></span>
<span class="line"><span>└── ...</span></span></code></pre></div><h3 id="_2-2-4-configs-——-pydantic-配置体系" tabindex="-1">2.2.4 <code>configs/</code> —— Pydantic 配置体系 <a class="header-anchor" href="#_2-2-4-configs-——-pydantic-配置体系" aria-label="Permalink to &quot;2.2.4 \`configs/\` —— Pydantic 配置体系&quot;">​</a></h3><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>mem0/configs/</span></span>
<span class="line"><span>├── base.py              # MemoryConfig、MemoryItem</span></span>
<span class="line"><span>├── enums.py             # MemoryType 枚举</span></span>
<span class="line"><span>├── prompts.py           # 系统 Prompt 模板</span></span>
<span class="line"><span>├── embeddings/          # Embedder 配置</span></span>
<span class="line"><span>├── llms/                # LLM 配置（按提供商）</span></span>
<span class="line"><span>├── rerankers/           # Reranker 配置</span></span>
<span class="line"><span>└── vector_stores/       # 向量库配置</span></span></code></pre></div><h3 id="_2-2-5-utils-——-工厂模式核心" tabindex="-1">2.2.5 <code>utils/</code> —— 工厂模式核心 <a class="header-anchor" href="#_2-2-5-utils-——-工厂模式核心" aria-label="Permalink to &quot;2.2.5 \`utils/\` —— 工厂模式核心&quot;">​</a></h3><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>mem0/utils/</span></span>
<span class="line"><span>└── factory.py           # 五大工厂类</span></span>
<span class="line"><span>    ├── LlmFactory</span></span>
<span class="line"><span>    ├── EmbedderFactory</span></span>
<span class="line"><span>    ├── VectorStoreFactory</span></span>
<span class="line"><span>    ├── GraphStoreFactory</span></span>
<span class="line"><span>    └── RerankerFactory</span></span></code></pre></div><p>工厂类通过字符串 provider 名称动态加载实现类，这是 mem0 可插拔架构的关键：</p><div class="language-python vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang">python</span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;"># 用法</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">llm </span><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;">=</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;"> LlmFactory.create(</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;">&quot;anthropic&quot;</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">, config)</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">embedder </span><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;">=</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;"> EmbedderFactory.create(</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;">&quot;openai&quot;</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">, config, vs_config)</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">vector_store </span><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;">=</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;"> VectorStoreFactory.create(</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;">&quot;qdrant&quot;</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">, config)</span></span></code></pre></div><h2 id="_2-3-模块依赖关系" tabindex="-1">2.3 模块依赖关系 <a class="header-anchor" href="#_2-3-模块依赖关系" aria-label="Permalink to &quot;2.3 模块依赖关系&quot;">​</a></h2><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>Memory (main.py)</span></span>
<span class="line"><span>  ├── depends on → LlmFactory → [openai/anthropic/gemini/...]</span></span>
<span class="line"><span>  ├── depends on → EmbedderFactory → [openai/huggingface/...]</span></span>
<span class="line"><span>  ├── depends on → VectorStoreFactory → [qdrant/pinecone/...]</span></span>
<span class="line"><span>  ├── depends on → SQLiteManager (storage.py)</span></span>
<span class="line"><span>  ├── depends on → MemoryConfig (configs/base.py)</span></span>
<span class="line"><span>  └── optional → GraphStoreFactory → MemoryGraph</span></span>
<span class="line"><span>                   └── depends on → Neo4jGraph</span></span>
<span class="line"><span>                   └── depends on → EmbedderFactory</span></span>
<span class="line"><span>                   └── depends on → LlmFactory</span></span>
<span class="line"><span></span></span>
<span class="line"><span>MemoryClient (client/main.py)</span></span>
<span class="line"><span>  └── depends on → mem0 Platform REST API</span></span></code></pre></div><p>依赖方向是单向的：Memory → Factory → Impl，没有循环依赖。</p><h2 id="_2-4-typescript-sdk-结构" tabindex="-1">2.4 TypeScript SDK 结构 <a class="header-anchor" href="#_2-4-typescript-sdk-结构" aria-label="Permalink to &quot;2.4 TypeScript SDK 结构&quot;">​</a></h2><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>mem0-ts/src/</span></span>
<span class="line"><span>├── client/</span></span>
<span class="line"><span>│   ├── main.ts          # MemoryClient（托管平台）</span></span>
<span class="line"><span>│   ├── project.ts       # 项目级操作</span></span>
<span class="line"><span>│   └── utils.ts</span></span>
<span class="line"><span>├── oss/</span></span>
<span class="line"><span>│   └── ...              # 自托管实现（实验性）</span></span>
<span class="line"><span>└── community/</span></span>
<span class="line"><span>    └── ...              # 社区贡献组件</span></span></code></pre></div><p>TypeScript SDK 主要面向托管平台，API 设计与 Python SDK 保持一致：</p><div class="language-typescript vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang">typescript</span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;">import</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;"> MemoryClient </span><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;">from</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> &quot;mem0ai&quot;</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">;</span></span>
<span class="line"></span>
<span class="line"><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;">const</span><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;"> client</span><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;"> =</span><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;"> new</span><span style="--shiki-light:#6F42C1;--shiki-dark:#B392F0;"> MemoryClient</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">({ apiKey: </span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;">&quot;m0-xxx&quot;</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;"> });</span></span>
<span class="line"><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;">await</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;"> client.</span><span style="--shiki-light:#6F42C1;--shiki-dark:#B392F0;">add</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">(</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;">&quot;我喜欢喝绿茶&quot;</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">, { user_id: </span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;">&quot;alice&quot;</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;"> });</span></span>
<span class="line"><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;">const</span><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;"> results</span><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;"> =</span><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;"> await</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;"> client.</span><span style="--shiki-light:#6F42C1;--shiki-dark:#B392F0;">search</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">(</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;">&quot;饮品偏好&quot;</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">, { user_id: </span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;">&quot;alice&quot;</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;"> });</span></span></code></pre></div><h2 id="_2-5-rest-api-server" tabindex="-1">2.5 REST API Server <a class="header-anchor" href="#_2-5-rest-api-server" aria-label="Permalink to &quot;2.5 REST API Server&quot;">​</a></h2><p><code>server/main.py</code> 是一个 FastAPI 应用，将 Memory 类封装为 HTTP 端点：</p><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>POST /v1/memories/         ← Memory.add()</span></span>
<span class="line"><span>GET  /v1/memories/         ← Memory.get_all()</span></span>
<span class="line"><span>GET  /v1/memories/{id}     ← Memory.get()</span></span>
<span class="line"><span>PUT  /v1/memories/{id}     ← Memory.update()</span></span>
<span class="line"><span>DELETE /v1/memories/{id}   ← Memory.delete()</span></span>
<span class="line"><span>POST /v1/memories/search/  ← Memory.search()</span></span>
<span class="line"><span>GET  /v1/memories/{id}/history/ ← Memory.history()</span></span></code></pre></div><p>通过 Docker Compose 可以快速启动：</p><div class="language-bash vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang">bash</span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span style="--shiki-light:#6F42C1;--shiki-dark:#B392F0;">docker</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> compose</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> up</span></span>
<span class="line"><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;"># API 默认在 http://localhost:8000</span></span></code></pre></div><h2 id="_2-6-关键文件速查" tabindex="-1">2.6 关键文件速查 <a class="header-anchor" href="#_2-6-关键文件速查" aria-label="Permalink to &quot;2.6 关键文件速查&quot;">​</a></h2><table tabindex="0"><thead><tr><th>你想了解什么</th><th>看哪个文件</th></tr></thead><tbody><tr><td>add/search 核心逻辑</td><td><code>mem0/memory/main.py</code></td></tr><tr><td>记忆接口契约</td><td><code>mem0/memory/base.py</code></td></tr><tr><td>配置模型定义</td><td><code>mem0/configs/base.py</code></td></tr><tr><td>所有 Prompt</td><td><code>mem0/configs/prompts.py</code></td></tr><tr><td>工厂类注册表</td><td><code>mem0/utils/factory.py</code></td></tr><tr><td>向量存储接口</td><td><code>mem0/vector_stores/base.py</code></td></tr><tr><td>图记忆实现</td><td><code>mem0/memory/graph_memory.py</code></td></tr><tr><td>历史追踪</td><td><code>mem0/memory/storage.py</code></td></tr><tr><td>REST 端点</td><td><code>server/main.py</code></td></tr></tbody></table><h2 id="_2-7-小结" tabindex="-1">2.7 小结 <a class="header-anchor" href="#_2-7-小结" aria-label="Permalink to &quot;2.7 小结&quot;">​</a></h2><p>mem0 的仓库是一个设计清晰的 Python 项目：</p><ul><li><strong>单一入口</strong>：<code>Memory</code> 类是所有操作的门面</li><li><strong>工厂模式</strong>：所有可插拔组件通过 Factory 注册和创建</li><li><strong>配置驱动</strong>：Pydantic 模型统一管理所有配置</li><li><strong>关注分离</strong>：记忆管线、存储、LLM、Embedder 各司其职</li></ul><p>下一章，我们深入 <code>MemoryConfig</code>，理解 mem0 的配置体系如何把这些组件粘合在一起。</p>`,36)])])}const k=a(i,[["render",l]]);export{m as __pageData,k as default};
