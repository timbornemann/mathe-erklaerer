import React, { useMemo } from 'react';
import katex from 'katex';

interface MathRendererProps {
  content: string;
}

const MathRenderer: React.FC<MathRendererProps> = ({ content }) => {
  const parts = useMemo(() => {
    // Regex matches:
    // 1. $$...$$ (Display mode)
    // 2. $...$ (Inline mode)
    // Note: The order matters. We check for double $$ first.
    const regex = /\$\$([\s\S]+?)\$\$|\$([^$\n]+?)\$/g;
    
    const result = [];
    let lastIndex = 0;
    let match;

    while ((match = regex.exec(content)) !== null) {
      // Add preceding text
      if (match.index > lastIndex) {
        result.push({
          type: 'text',
          value: content.slice(lastIndex, match.index),
        });
      }

      if (match[1]) {
        // Double dollar capture group -> Display
        result.push({
          type: 'latex-display',
          value: match[1],
        });
      } else if (match[2]) {
        // Single dollar capture group -> Inline
        result.push({
          type: 'latex-inline',
          value: match[2],
        });
      }

      lastIndex = regex.lastIndex;
    }

    // Add remaining text
    if (lastIndex < content.length) {
      result.push({
        type: 'text',
        value: content.slice(lastIndex),
      });
    }

    return result;
  }, [content]);

  return (
    <div className="text-slate-800 leading-relaxed text-lg">
      {parts.map((part, index) => {
        if (part.type === 'latex-display') {
          try {
            const html = katex.renderToString(part.value, {
              throwOnError: false,
              displayMode: true,
            });
            return (
              <div 
                key={index} 
                className="my-4 overflow-x-auto py-2 text-center"
                dangerouslySetInnerHTML={{ __html: html }} 
              />
            );
          } catch (e) {
            return <code key={index} className="text-red-500 block">{part.value}</code>;
          }
        } else if (part.type === 'latex-inline') {
          try {
            const html = katex.renderToString(part.value, {
              throwOnError: false,
              displayMode: false,
            });
            return (
              <span 
                key={index} 
                className="px-0.5"
                dangerouslySetInnerHTML={{ __html: html }} 
              />
            );
          } catch (e) {
            return <code key={index} className="text-red-500">{part.value}</code>;
          }
        } else {
          // Plain text handling
          return (
            <span key={index} className="whitespace-pre-wrap">
               {part.value.split(/(\*\*.*?\*\*)/g).map((subPart, i) => {
                 if (subPart.startsWith('**') && subPart.endsWith('**')) {
                   return <strong key={i} className="font-bold text-indigo-900">{subPart.slice(2, -2)}</strong>;
                 }
                 return <span key={i}>{subPart}</span>;
               })}
            </span>
          );
        }
      })}
    </div>
  );
};

export default MathRenderer;