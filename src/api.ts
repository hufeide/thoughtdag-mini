// 前端 → Express 代理的调用层（对应 ThoughtDAG 的 src/lib/api.ts）。
// fetch 拿到的是一个 ReadableStream：边下边读，每读一段就 yield 给调用方。
export interface ChatMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
}

export async function* streamChat(messages: ChatMessage[]): AsyncGenerator<string> {
  const res = await fetch('/api/chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ messages }),
  });
  if (!res.ok || !res.body) throw new Error(`proxy error: ${res.status}`);
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    yield decoder.decode(value, { stream: true });
  }
}
