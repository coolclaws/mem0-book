---
layout: home

hero:
  name: "mem0 源码解析"
  text: "AI Agent 智能记忆层深度剖析"
  tagline: 从 add() 到 search()，从向量存储到知识图谱，完整解构 mem0 的每一行核心代码
  image:
    src: /logo.svg
    alt: mem0
  actions:
    - theme: brand
      text: 开始阅读
      link: /chapters/01-overview
    - theme: alt
      text: 完整目录
      link: /contents
    - theme: alt
      text: mem0 官方
      link: https://mem0.ai

features:
  - icon: 🧠
    title: 记忆管线全解析
    details: 深入 add/search/update 三大核心操作，理解 LLM 驱动的记忆提取、事实抽取、冲突消解完整流程。

  - icon: 🗄️
    title: 向量存储生态
    details: 解析 20+ 向量数据库适配器（Qdrant、Pinecone、PGVector、Chroma 等），理解统一抽象层的设计哲学。

  - icon: 🕸️
    title: 图记忆系统
    details: 剖析基于 Neo4j 的 MemoryGraph，理解实体提取、关系构建、BM25 混合检索的实现细节。

  - icon: 🔌
    title: 多 LLM / Embedder 集成
    details: Factory 模式支持 OpenAI、Anthropic、Gemini、Ollama 等 15+ 提供商，理解可插拔架构的工程实践。

  - icon: 📦
    title: 双模式 SDK
    details: Python SDK 自托管与托管双模式，TypeScript SDK 跨平台，REST API Server 生产部署全链路。

  - icon: 🔗
    title: 框架生态集成
    details: LangGraph、CrewAI、AutoGen、OpenAI Agents SDK 集成方案，带记忆的 AI Agent 工程实践。
---
