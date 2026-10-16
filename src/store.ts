// 全局状态：zustand + persist + idb-keyval（对应 ThoughtDAG 的 src/store/）。
//
// 这一个文件浓缩了原项目 store 层的四个决定：
//  1. 图状态（nodes/edges）唯一存放处，React Flow 是受控的 —— 它每次拖动/连线
//     都通过 onNodesChange/onConnect 汇报回来，由这里改数据，再渲染回去。
//  2. persist 中间件把图写进 IndexedDB（idb-keyval 适配成 zustand 要的 storage）。
//  3. isLoading 这类瞬态不落盘（partialize），刷新后不会卡出一个"永远加载中"
//     （对应 store/index.ts 的 stripTransient）。
//  4. 布局写在建节点的地方：子节点与父同列、y 接在父下方 —— 原项目
//     lib/layout.ts 五遍列树布局砍到只剩骨架（"布局服从箭头顺序"）。
import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { get as idbGet, set as idbSet, del as idbDel } from 'idb-keyval';
import {
  applyNodeChanges,
  applyEdgeChanges,
  MarkerType,
  type Node,
  type Edge,
  type NodeChange,
  type EdgeChange,
  type Connection,
} from '@xyflow/react';
import { streamChat, type ChatMessage } from './api';

// ── 数据模型：一个节点 = 一轮问答（ThoughtDAG 的 ThoughtData 骨架）──
export interface QAData extends Record<string, unknown> {
  question: string;
  response: string;
  isLoading: boolean;
}
export type QANode = Node<QAData, 'qa'>;

const COL_WIDTH = 560; // 列距：新对话开一列（对应 LAYOUT_COL_WIDTH + H_GAP）
const V_GAP = 96;      // 行距：同链接在父节点正下方（对应 LAYOUT_V_GAP）
const FALLBACK_H = 320; // React Flow 未测量到高度时的估值（对应 estimateNodeHeight）

// idb-keyval → zustand persist 的适配器（对应 lib/persistence.ts）
const idbStorage = {
  getItem: async (name: string) => (await idbGet<string>(name)) ?? null,
  setItem: async (name: string, value: string) => { await idbSet(name, value); },
  removeItem: async (name: string) => { await idbDel(name); },
};

interface StoreState {
  nodes: QANode[];
  edges: Edge[];
  onNodesChange: (changes: NodeChange<QANode>[]) => void;
  onEdgesChange: (changes: EdgeChange<Edge>[]) => void;
  onConnect: (conn: Connection) => void;
  askRoot: (question: string) => void;
  askFollowUp: (parentId: string, question: string) => void;
  generate: (nodeId: string) => Promise<void>;
}

// 边 = 上下文流：沿入边一路向上走，把祖先的 Q/A 拼成 messages。
// 这就是"图即对话"：LLM 看到什么，完全由画布上的连线决定
// （对应 store/context-builder.ts 的最小版）。
function buildMessages(nodeId: string, nodes: QANode[], edges: Edge[]): ChatMessage[] {
  const chain: QANode[] = [];
  let cur: QANode | undefined = nodes.find((n) => n.id === nodeId);
  while (cur) {
    chain.unshift(cur);
    const parentEdge = edges.find((e) => e.target === cur!.id);
    cur = parentEdge ? nodes.find((n) => n.id === parentEdge.source) : undefined;
  }
  const messages: ChatMessage[] = [];
  for (const n of chain) {
    messages.push({ role: 'user', content: n.data.question });
    if (n.id !== nodeId && n.data.response) {
      messages.push({ role: 'assistant', content: n.data.response });
    }
  }
  return messages;
}

export const useStore = create<StoreState>()(
  persist(
    (set, get) => ({
      nodes: [],
      edges: [],

      // React Flow 受控模式三件套：它汇报变更，我们应用变更。
      onNodesChange: (changes) =>
        set((s) => ({ nodes: applyNodeChanges<QANode>(changes, s.nodes) })),
      onEdgesChange: (changes) =>
        set((s) => ({ edges: applyEdgeChanges<Edge>(changes, s.edges) })),
      onConnect: (conn) =>
        set((s) => ({
          edges: [
            ...s.edges,
            { id: crypto.randomUUID(), ...conn, markerEnd: { type: MarkerType.ArrowClosed } },
          ],
        })),

      askRoot: (question) => {
        const id = crypto.randomUUID();
        set((s) => ({
          nodes: [
            ...s.nodes,
            {
              id,
              type: 'qa',
              // 新对话 = 新列：放到最右列的右边
              position: {
                x: s.nodes.length ? Math.max(...s.nodes.map((n) => n.position.x)) + COL_WIDTH : 0,
                y: 0,
              },
              data: { question, response: '', isLoading: true },
            },
          ],
        }));
        void get().generate(id);
      },

      askFollowUp: (parentId, question) => {
        const parent = get().nodes.find((n) => n.id === parentId);
        if (!parent) return;
        const id = crypto.randomUUID();
        set((s) => ({
          nodes: [
            ...s.nodes,
            {
              id,
              type: 'qa',
              // 追问 = 同列下方（布局铁律：同一对话链竖向对齐）
              position: {
                x: parent.position.x,
                y: parent.position.y + (parent.measured?.height ?? FALLBACK_H) + V_GAP,
              },
              data: { question, response: '', isLoading: true },
            },
          ],
          edges: [
            ...s.edges,
            {
              id: crypto.randomUUID(),
              source: parentId,
              target: id,
              markerEnd: { type: MarkerType.ArrowClosed },
            },
          ],
        }));
        void get().generate(id);
      },

      generate: async (nodeId) => {
        const messages = buildMessages(nodeId, get().nodes, get().edges);
        const patch = (fn: (d: QAData) => QAData) =>
          set((s) => ({
            nodes: s.nodes.map((n) => (n.id === nodeId ? { ...n, data: fn(n.data) } : n)),
          }));
        try {
          for await (const chunk of streamChat(messages)) {
            // 流式写回：每个 chunk 触发该节点的重渲染（其他卡片不动，
            // 因为组件用逐字段选择器订阅 —— 见 NodeCard.tsx 顶部注释）
            patch((d) => ({ ...d, response: d.response + chunk }));
          }
        } catch (err) {
          patch((d) => ({ ...d, response: d.response || `生成失败：${String(err)}` }));
        } finally {
          patch((d) => ({ ...d, isLoading: false }));
        }
      },
    }),
    {
      name: 'thoughtdag-mini',
      storage: createJSONStorage(() => idbStorage),
      // 只存图；isLoading 是瞬态，落盘前剥掉
      partialize: (s) => ({
        nodes: s.nodes.map((n) => ({ ...n, data: { ...n.data, isLoading: false } })),
        edges: s.edges,
      }),
    },
  ),
);
