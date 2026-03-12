import { defineConfig } from 'vitepress'

export default defineConfig({
  title: 'mem0 源码解析',
  description: '深入剖析 mem0 —— AI Agent 智能记忆层的设计与实现',
  lang: 'zh-CN',

  base: '/',

  head: [
    ['link', { rel: 'icon', type: 'image/svg+xml', href: '/favicon.svg' }],
    ['meta', { name: 'theme-color', content: '#6366f1' }],
    ['meta', { property: 'og:type', content: 'website' }],
    ['meta', { property: 'og:title', content: 'mem0 源码解析' }],
    ['meta', { property: 'og:description', content: '深入剖析 mem0 —— AI Agent 智能记忆层的设计与实现' }],
  ],

  themeConfig: {
    logo: { src: '/logo.svg', alt: 'mem0' },

    nav: [
      { text: '开始阅读', link: '/chapters/01-overview' },
      { text: '目录', link: '/contents' },
      { text: 'GitHub', link: 'https://github.com/coolclaws/mem0-book' },
    ],

    sidebar: [
      {
        text: '前言',
        items: [
          { text: '关于本书', link: '/' },
          { text: '完整目录', link: '/contents' },
        ],
      },
      {
        text: '第一部分：宏观认知',
        collapsed: false,
        items: [
          { text: '第 1 章　项目概览与设计哲学', link: '/chapters/01-overview' },
          { text: '第 2 章　仓库结构与模块依赖', link: '/chapters/02-repo-structure' },
          { text: '第 3 章　MemoryConfig：统一配置体系', link: '/chapters/03-config' },
        ],
      },
      {
        text: '第二部分：核心记忆管线',
        collapsed: false,
        items: [
          { text: '第 4 章　MemoryBase：抽象接口设计', link: '/chapters/04-memory-base' },
          { text: '第 5 章　Memory.add：记忆提取与写入', link: '/chapters/05-memory-add' },
          { text: '第 6 章　Memory.search：语义检索管线', link: '/chapters/06-memory-search' },
          { text: '第 7 章　记忆更新与冲突解消', link: '/chapters/07-memory-update' },
          { text: '第 8 章　SQLite 历史追踪系统', link: '/chapters/08-history' },
        ],
      },
      {
        text: '第三部分：向量存储生态',
        collapsed: false,
        items: [
          { text: '第 9 章　向量存储抽象层设计', link: '/chapters/09-vector-store-base' },
          { text: '第 10 章　主流向量数据库实现解析', link: '/chapters/10-vector-store-impl' },
          { text: '第 11 章　Embedder：文本向量化层', link: '/chapters/11-embedder' },
          { text: '第 12 章　Reranker：重排序优化', link: '/chapters/12-reranker' },
        ],
      },
      {
        text: '第四部分：图记忆系统',
        collapsed: false,
        items: [
          { text: '第 13 章　MemoryGraph：知识图谱记忆', link: '/chapters/13-graph-memory' },
          { text: '第 14 章　实体提取与关系构建', link: '/chapters/14-entity-relation' },
        ],
      },
      {
        text: '第五部分：LLM 集成层',
        collapsed: false,
        items: [
          { text: '第 15 章　LLM 抽象层与 Factory 模式', link: '/chapters/15-llm-layer' },
          { text: '第 16 章　Prompt 工程：事实提取与记忆决策', link: '/chapters/16-prompts' },
        ],
      },
      {
        text: '第六部分：客户端与平台',
        collapsed: false,
        items: [
          { text: '第 17 章　Python SDK：自托管与托管双模式', link: '/chapters/17-python-sdk' },
          { text: '第 18 章　TypeScript SDK 与跨平台集成', link: '/chapters/18-ts-sdk' },
          { text: '第 19 章　REST API Server', link: '/chapters/19-api-server' },
          { text: '第 20 章　框架集成：LangGraph / CrewAI / AutoGen', link: '/chapters/20-integrations' },
        ],
      },
      {
        text: '附录',
        collapsed: true,
        items: [
          { text: '附录 A：推荐阅读路径', link: '/chapters/appendix-a-reading-path' },
          { text: '附录 B：配置速查表', link: '/chapters/appendix-b-config-reference' },
          { text: '附录 C：名词解释', link: '/chapters/appendix-c-glossary' },
        ],
      },
    ],

    outline: {
      level: [2, 3],
      label: '本章目录',
    },

    search: {
      provider: 'local',
    },

    socialLinks: [
      { icon: 'github', link: 'https://github.com/coolclaws/mem0-book' },
    ],

    footer: {
      message: '基于 Apache-2.0 协议开源',
      copyright: 'mem0 源码解析 © 2026',
    },

    editLink: {
      pattern: 'https://github.com/coolclaws/mem0-book/edit/main/chapters/:path',
      text: '在 GitHub 上编辑',
    },
  },
})
