// Markdown 渲染管线（对应 ThoughtDAG 的 src/components/Markdown.tsx）。
// react-markdown 的工作方式是"插件链"：
//   remark（markdown → 语法树）：gfm 表格/删除线，math 识别 $..$/$$..$$
//   rehype（语法树 → HTML）：katex 渲染公式，highlight 给代码块上色
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
import rehypeHighlight from 'rehype-highlight';
import 'katex/dist/katex.min.css';
import 'highlight.js/styles/github.css';

export default function Markdown({ text }: { text: string }) {
  return (
    <div className="md">
      <ReactMarkdown
        remarkPlugins={[remarkGfm, remarkMath]}
        rehypePlugins={[rehypeKatex, rehypeHighlight]}
      >
        {text}
      </ReactMarkdown>
    </div>
  );
}
