// 问答卡片（对应 ThoughtDAG 的 src/components/ThoughtNode.tsx，66KB 的那位）。
// React Flow 自定义节点的约定：
//   - 收到 NodeProps（id + data + 选中态…），长什么样完全由你决定；
//   - <Handle> 是连线的锚点：target 在顶（父来的箭头），source 在底（向下续问）。
import { useState } from 'react';
import { Handle, Position, type NodeProps } from '@xyflow/react';
import { useStore, type QANode } from './store';
import Markdown from './Markdown';

export default function NodeCard({ id, data }: NodeProps<QANode>) {
  // 逐字段选择器，而不是 useStore() 整体解构 ——
  // 原项目 ThoughtNode 顶部的注释解释了原因：N 张卡片时，整体订阅会让
  // 每一个流式 chunk 乘出 N 次 Markdown 重渲染。选择器让每张卡片只关心
  // 自己的 data 变化（zustand 按引用比较，别人的卡片引用没变就不重渲染）。
  const askFollowUp = useStore((s) => s.askFollowUp);
  const [draft, setDraft] = useState('');

  const ask = () => {
    const q = draft.trim();
    if (!q) return;
    setDraft('');
    askFollowUp(id, q);
  };

  return (
    <div className="w-[480px] rounded-xl border border-line bg-card shadow-sm">
      <Handle type="target" position={Position.Top} />
      {/* 问题 */}
      <div className="border-b border-line px-4 py-2.5 text-sm font-medium text-ink">
        {data.question}
      </div>
      {/* 回答：流式增长，每个 chunk 重渲染这一段 */}
      <div className="max-h-[400px] overflow-y-auto px-4 py-3 text-sm">
        {data.response ? <Markdown text={data.response} /> : (
          <span className="text-ink-muted">{data.isLoading ? '思考中…' : ''}</span>
        )}
      </div>
      {/* 追问输入：提交后 store 建子节点、连边、沿边编译上下文、调 LLM */}
      <div className="flex gap-2 border-t border-line px-3 py-2">
        <input
          className="nodrag flex-1 rounded-lg border border-line bg-surface px-3 py-1.5 text-sm outline-none focus:border-accent"
          placeholder="追问…"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter' && !e.nativeEvent.isComposing) ask(); }}
        />
        <button
          className="nodrag rounded-lg bg-accent px-3 py-1.5 text-sm text-white disabled:opacity-30"
          onClick={ask}
          disabled={!draft.trim()}
        >
          问
        </button>
      </div>
      <Handle type="source" position={Position.Bottom} />
    </div>
  );
}
