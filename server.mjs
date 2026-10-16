// Express + Vercel AI SDK：唯一的后端文件（对应 ThoughtDAG 的 server.mjs）。
// 职责只有一件：把前端发来的 messages 转发给 LLM，并把文本流原样写回。
// 前端拿不到 API key —— key 只活在这个进程里，这就是代理存在的理由。
import express from 'express';
import { createOpenAICompatible } from '@ai-sdk/openai-compatible';
import { streamText } from 'ai';

const app = express();
app.use(express.json());

// openai-compatible：任何 OpenAI 协议的网关都能接（智谱 / DeepSeek / 本地 vLLM…），
// 换厂商只改 .env，不改代码。
const provider = createOpenAICompatible({
  name: 'llm',
  baseURL: process.env.LLM_BASE_URL ?? 'https://open.bigmodel.cn/api/paas/v4',
  apiKey: process.env.LLM_API_KEY ?? '',
});

app.post('/api/chat', async (req, res) => {
  res.setHeader('Content-Type', 'text/plain; charset=utf-8');
  // streamText 是 Vercel AI SDK 的核心：统一了各家模型的流式接口。
  const result = streamText({
    model: provider.chatModel(process.env.LLM_MODEL ?? 'glm-4.5-flash'),
    messages: req.body.messages,
  });
  // 逐 chunk 写回 —— 前端 fetch 的 reader 会同步收到，这就是"打字机"效果。
  for await (const chunk of result.textStream) res.write(chunk);
  res.end();
});

app.listen(3001, () => console.log('[mini] LLM proxy on http://localhost:3001'));
