# 第 18 章　TypeScript SDK 与跨平台集成

## 18.1 TypeScript SDK 概览

mem0 的 TypeScript SDK（`mem0ai` npm 包）主要面向托管平台，让 Node.js 和前端应用能够调用 mem0 云 API。

```bash
npm install mem0ai
# 或
pnpm add mem0ai
```

## 18.2 MemoryClient（TypeScript）

```typescript
import MemoryClient from "mem0ai";

const client = new MemoryClient({
  apiKey: process.env.MEM0_API_KEY,
  // host: "https://api.mem0.ai",  // 默认
  // orgId: "my-org",              // 可选
  // projectId: "my-project",      // 可选
});
```

### 基本操作

```typescript
// 添加记忆
const result = await client.add(
  [{ role: "user", content: "I love green tea" }],
  { userId: "alice" }
);
console.log(result);
// { results: [{ id: "uuid1", memory: "Loves green tea", event: "ADD" }] }

// 搜索
const searchResult = await client.search(
  "beverage preferences",
  { userId: "alice", limit: 5 }
);
console.log(searchResult.results);

// 获取全部
const allMemories = await client.getAll({ userId: "alice" });

// 按 ID 获取
const memory = await client.get("uuid1");

// 更新
await client.update("uuid1", "Loves green tea, especially Dragon Well");

// 删除
await client.delete("uuid1");

// 删除全部
await client.deleteAll({ userId: "alice" });

// 查看历史
const history = await client.history("uuid1");
```

### 完整类型定义

```typescript
interface Message {
  role: "user" | "assistant" | "system";
  content: string;
  name?: string;  // actor_id
}

interface AddOptions {
  userId?: string;
  agentId?: string;
  runId?: string;
  metadata?: Record<string, any>;
  infer?: boolean;
}

interface SearchOptions {
  userId?: string;
  agentId?: string;
  runId?: string;
  limit?: number;
  filters?: Record<string, any>;
  threshold?: number;
}

interface MemoryItem {
  id: string;
  memory: string;
  score?: number;
  metadata?: Record<string, any>;
  createdAt?: string;
  updatedAt?: string;
  userId?: string;
  agentId?: string;
  runId?: string;
}
```

## 18.3 与 Next.js 集成

```typescript
// app/api/chat/route.ts（App Router）
import { NextRequest, NextResponse } from "next/server";
import MemoryClient from "mem0ai";
import OpenAI from "openai";

const memory = new MemoryClient({ apiKey: process.env.MEM0_API_KEY! });
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY! });

export async function POST(req: NextRequest) {
  const { message, userId } = await req.json();

  // 1. 检索相关记忆
  const { results } = await memory.search(message, { userId, limit: 5 });
  const memoriesContext = results
    .map((m) => `- ${m.memory}`)
    .join("\n");

  // 2. 构建上下文 prompt
  const systemPrompt = memoriesContext
    ? `You are a helpful assistant. User preferences:\n${memoriesContext}`
    : "You are a helpful assistant.";

  // 3. 调用 LLM
  const completion = await openai.chat.completions.create({
    model: "gpt-4.1-nano-2025-04-14",
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: message },
    ],
  });
  const answer = completion.choices[0].message.content!;

  // 4. 存储本次对话记忆
  await memory.add(
    [
      { role: "user", content: message },
      { role: "assistant", content: answer },
    ],
    { userId }
  );

  return NextResponse.json({ answer });
}
```

## 18.4 与 Vercel AI SDK 集成

```typescript
import { streamText } from "ai";
import { openai } from "@ai-sdk/openai";
import MemoryClient from "mem0ai";

const memory = new MemoryClient({ apiKey: process.env.MEM0_API_KEY! });

export async function POST(req: Request) {
  const { messages, userId } = await req.json();
  const lastMessage = messages[messages.length - 1].content;

  // 检索记忆
  const { results } = await memory.search(lastMessage, { userId });
  const memorySuffix = results.length > 0
    ? `\n\nUser context:\n${results.map((m) => `- ${m.memory}`).join("\n")}`
    : "";

  const result = streamText({
    model: openai("gpt-4.1-nano-2025-04-14"),
    system: `You are a helpful assistant.${memorySuffix}`,
    messages,
    onFinish: async ({ text }) => {
      // 流式完成后存储记忆
      await memory.add(
        [
          { role: "user", content: lastMessage },
          { role: "assistant", content: text },
        ],
        { userId }
      );
    },
  });

  return result.toDataStreamResponse();
}
```

## 18.5 Node.js 命令行工具

```typescript
// cli.ts
import MemoryClient from "mem0ai";
import readline from "readline";

const client = new MemoryClient({ apiKey: process.env.MEM0_API_KEY! });
const rl = readline.createInterface({ input: process.stdin, output: process.stdout });

const userId = "cli-user";

async function chat(message: string): Promise<string> {
  const { results } = await client.search(message, { userId, limit: 5 });
  // ... 调用 LLM，存储记忆
  return "assistant response";
}

rl.on("line", async (line) => {
  const response = await chat(line.trim());
  console.log(`Assistant: ${response}`);
});
```

## 18.6 Python vs TypeScript SDK 对比

| 维度 | Python SDK | TypeScript SDK |
|------|-----------|---------------|
| 自托管支持 | ✅（`Memory` 类） | 🔄（实验性 `oss/` 目录）|
| 托管平台 | ✅（`MemoryClient`） | ✅（`MemoryClient`）|
| 异步支持 | ✅（`AsyncMemory`） | ✅（原生 async/await） |
| 类型系统 | Pydantic | TypeScript 类型 |
| 图记忆 | ✅ | ❌（通过云端） |
| 自定义 LLM | ✅ | ❌（仅托管平台） |
| 成熟度 | ⭐⭐⭐⭐⭐ | ⭐⭐⭐⭐ |

TypeScript SDK 目前专注于托管平台客户端。如果需要在 Node.js 中自托管，更好的方式是部署 REST API Server（第 19 章），然后通过 HTTP 调用。

## 18.7 小结

TypeScript SDK 让 mem0 进入前端和 Node.js 生态。主要场景：
- Next.js / Nuxt 全栈应用的对话记忆
- Vercel AI SDK 的流式对话增强
- Electron 桌面 AI 应用的个性化

下一章解析 REST API Server，它是连接各语言生态的通用桥梁。
