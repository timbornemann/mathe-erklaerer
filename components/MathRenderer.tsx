import React from 'react';
import ReactMarkdown from 'react-markdown';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
import 'katex/dist/katex.min.css';

interface MathRendererProps {
  content: string;
}

const MathRenderer: React.FC<MathRendererProps> = ({ content }) => {
  // preprocess to ensure newlines are respected if they are simple \n
  // helping markdown treat them as breaks if double \n
  // For now let's pass content directly.
  
  return (
    <div className="math-renderer text-slate-800 leading-relaxed text-lg [&>p]:mb-4 last:[&>p]:mb-0">
      <ReactMarkdown
        remarkPlugins={[remarkMath]}
        rehypePlugins={[rehypeKatex]}
        components={{
          // Customize strong to match previous style
          strong: ({node, ...props}) => <span className="font-bold text-indigo-900" {...props} />,
          // Customize links
          a: ({node, ...props}) => <a className="text-indigo-600 hover:underline" {...props} />
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
};

export default MathRenderer;