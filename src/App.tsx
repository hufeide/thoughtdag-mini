// 组装层（对应 ThoughtDAG 的 src/App.tsx）：唯一把画布、状态、样式缝起来的地方。
import { useEffect, useState } from 'react';
import {
  ReactFlow,
  Background,
  BackgroundVariant,
  Controls,
  MiniMap,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { useStore } from './store';
import NodeCard from './NodeCard';

// nodeTypes 必须是稳定引用（每次渲染新建对象会让 React Flow 反复重挂载节点），
// 所以定义在组件外 —— 原项目同理，且只有一种节点类型 key，按数据分发。
const nodeTypes = { qa: NodeCard };

export default function App() {
  // hydration gate：IndexedDB 恢复完成前不挂画布 ——
  // 否则 fitView 对着空图取景，恢复的节点闪出来时不在视野里。
  const [hydrated, setHydrated] = useState(useStore.persist.hasHydrated());
  useEffect(() => useStore.persist.onFinishHydration(() => setHydrated(true)), []);
  if (!hydrated) return null;
  return <Canvas />;
}

function Canvas() {
  const nodes = useStore((s) => s.nodes);
  const edges = useStore((s) => s.edges);
  const onNodesChange = useStore((s) => s.onNodesChange);
  const onEdgesChange = useStore((s) => s.onEdgesChange);
  const onConnect = useStore((s) => s.onConnect);
  const askRoot = useStore((s) => s.askRoot);
  const [draft, setDraft] = useState('');

  const ask = () => {
    const q = draft.trim();
    if (!q) return;
    setDraft('');
    askRoot(q);
  };

  return (
    <div className="h-full w-full bg-surface">
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onConnect={onConnect}
        nodeTypes={nodeTypes}
        fitView
        minZoom={0.2}
      >
        <Background variant={BackgroundVariant.Dots} gap={20} size={1.5} color="#E8E5E0" />
        <Controls />
        <MiniMap pannable zoomable />
      </ReactFlow>

      {/* 底部输入框：开一段新对话（新列） */}
      <div className="absolute bottom-4 left-1/2 z-10 flex w-[520px] -translate-x-1/2 gap-2 rounded-xl border border-line bg-card p-2 shadow-lg">
        <input
          className="flex-1 rounded-lg border border-line bg-surface px-3 py-2 text-sm outline-none focus:border-accent"
          placeholder="问点什么，开一段新对话…"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter' && !e.nativeEvent.isComposing) ask(); }}
        />
        <button
          className="rounded-lg bg-accent px-4 py-2 text-sm text-white disabled:opacity-30"
          onClick={ask}
          disabled={!draft.trim()}
        >
          提问
        </button>
      </div>
    </div>
  );
}
