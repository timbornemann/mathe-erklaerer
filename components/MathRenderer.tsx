import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import ReactMarkdown from 'react-markdown';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
import { Maximize2, X } from 'lucide-react';
import 'katex/dist/katex.min.css';

interface MathRendererProps {
  content: string;
}

const GRAPH_START_KEYWORDS = [
  'graph',
  'flowchart',
  'sequenceDiagram',
  'classDiagram',
  'stateDiagram',
  'erDiagram',
  'journey',
  'gantt',
  'pie',
  'mindmap',
  'timeline',
  'xychart'
];

interface FunctionPlotDataItem {
  fn?: string;
  points?: [number, number][];
  color?: string;
  title?: string;
  fnType?: string;
  graphType?: string;
  [key: string]: unknown;
}

interface FunctionPlotSpec {
  data: FunctionPlotDataItem[];
  xDomain?: [number, number];
  yDomain?: [number, number];
  grid?: boolean;
  title?: string;
}

interface ExpandableModalProps {
  isOpen: boolean;
  title: string;
  onClose: () => void;
  children: React.ReactNode;
  maxWidthClass?: string;
}

interface ExpandableBlockProps {
  title: string;
  modalTitle: string;
  children: React.ReactNode;
  expandedContent: React.ReactNode;
  className?: string;
  maxWidthClass?: string;
}

type MermaidApi = (typeof import('mermaid'))['default'];
type FunctionPlotFn = (typeof import('function-plot'))['default'];

let mermaidPromise: Promise<MermaidApi> | null = null;
let mermaidInitialized = false;
let functionPlotPromise: Promise<FunctionPlotFn> | null = null;

const GRAPH_DEFAULT_DOMAIN: [number, number] = [-10, 10];

const ExpandableModal: React.FC<ExpandableModalProps> = ({
  isOpen,
  title,
  onClose,
  children,
  maxWidthClass = 'max-w-6xl'
}) => {
  useEffect(() => {
    if (!isOpen || typeof document === 'undefined') return;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onClose();
      }
    };

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    document.addEventListener('keydown', handleKeyDown);

    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen, onClose]);

  if (!isOpen || typeof document === 'undefined') {
    return null;
  }

  return createPortal(
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/70 p-3 backdrop-blur-sm sm:p-6"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label={title}
    >
      <div
        className={`flex max-h-[92vh] w-full ${maxWidthClass} flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl`}
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-center justify-between gap-3 border-b border-slate-200 px-4 py-3 sm:px-5">
          <h3 className="text-sm font-bold text-slate-800 sm:text-base">{title}</h3>
          <button
            onClick={onClose}
            className="inline-flex h-9 w-9 items-center justify-center rounded-full text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-800"
            title="Schliessen"
            aria-label="Schliessen"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-auto p-4 sm:p-6">
          {children}
        </div>
      </div>
    </div>,
    document.body
  );
};

const ExpandableButton: React.FC<{ title: string; onClick: () => void }> = ({ title, onClick }) => (
  <button
    type="button"
    onClick={(event) => {
      event.stopPropagation();
      onClick();
    }}
    className="absolute right-2 top-2 z-10 inline-flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 bg-white/95 text-slate-500 opacity-80 shadow-sm transition-all hover:border-indigo-200 hover:bg-indigo-50 hover:text-indigo-600 hover:opacity-100 focus:outline-none focus:ring-2 focus:ring-indigo-300 print:hidden"
    title={title}
    aria-label={title}
  >
    <Maximize2 className="h-4 w-4" />
  </button>
);

const ExpandableBlock: React.FC<ExpandableBlockProps> = ({
  title,
  modalTitle,
  children,
  expandedContent,
  className = '',
  maxWidthClass
}) => {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <>
      <div className={`group/expandable relative ${className}`}>
        {children}
        <ExpandableButton title={title} onClick={() => setIsOpen(true)} />
      </div>
      <ExpandableModal
        isOpen={isOpen}
        title={modalTitle}
        onClose={() => setIsOpen(false)}
        maxWidthClass={maxWidthClass}
      >
        {expandedContent}
      </ExpandableModal>
    </>
  );
};

const looksLikeMermaidSource = (source: string): boolean => {
  const firstNonEmptyLine = source
    .split('\n')
    .map((line) => line.trim())
    .find((line) => line.length > 0);

  if (!firstNonEmptyLine) {
    return false;
  }

  const normalized = firstNonEmptyLine.toLowerCase();
  return GRAPH_START_KEYWORDS.some((keyword) => normalized.startsWith(keyword.toLowerCase()));
};

const stripLooseGraphLanguagePrefix = (language: string, source: string): string | null => {
  const trimmed = source.trim();
  const prefixMatch = trimmed.match(/^(mermaid|functionplot)\s+([\s\S]+)$/i);

  if (!prefixMatch || prefixMatch[1].toLowerCase() !== language) {
    return null;
  }

  const remainder = prefixMatch[2].trim();
  if (language === 'mermaid' && looksLikeMermaidSource(remainder)) {
    return remainder;
  }
  if (language === 'functionplot' && remainder.startsWith('{')) {
    return remainder;
  }

  return null;
};

const parseLooseGraphMarker = (line: string): { language: 'mermaid' | 'functionplot'; firstSourceLine?: string } | null => {
  const trimmed = line.trim();
  const inlineCodeMatch = trimmed.match(/^`{1,3}\s*([\s\S]*?)\s*`{1,3}$/);
  const candidate = inlineCodeMatch ? inlineCodeMatch[1].trim() : trimmed;
  const lower = candidate.toLowerCase();

  if (lower === 'mermaid' || lower === 'functionplot') {
    return { language: lower };
  }

  const languageMatch = lower.match(/^(mermaid|functionplot)\b/);
  if (!languageMatch) {
    return null;
  }

  const language = languageMatch[1] as 'mermaid' | 'functionplot';
  const firstSourceLine = stripLooseGraphLanguagePrefix(language, candidate);
  if (!firstSourceLine) {
    return null;
  }

  return { language, firstSourceLine };
};

const normalizeEscapedNewlines = (raw: string): string => {
  let text = raw;

  // Convert common double-escaped line breaks that appear in model JSON strings.
  // This deliberately avoids blanket replacement to not corrupt LaTeX commands like \neq.
  text = text
    .replace(/(?:\\n\s*)+(?=(?:`{1,3})?\s*(?:mermaid|functionplot)\b)/gi, '\n\n')
    .replace(/\\n(?=mermaid\b|functionplot\b)/gi, '\n')
    .replace(/(mermaid|functionplot)\\n/gi, '$1\n')
    .replace(/\\n(?=\d+\.)/g, '\n')
    .replace(/\\n(?=\{)/g, '\n')
    .replace(/\\n(?=\s)/g, '\n')
    .replace(/\\n(?=[A-ZÄÖÜ])/g, '\n')
    .replace(/\\n(?=\s*`{1,3}\s*$)/g, '\n')
    .replace(/\\n$/g, '\n');

  for (const keyword of GRAPH_START_KEYWORDS) {
    const escapedStarter = new RegExp(`\\\\n(?=${keyword}\\b)`, 'gi');
    text = text.replace(escapedStarter, '\n');
  }

  return text;
};

const normalizeDisplayMathBlocks = (raw: string): string =>
  raw.replace(
    /(^|\n)\s*\$\$\s*([^\n]+?)\s*\$\$\s*(?=\n|$)/g,
    (_match, prefix: string, formula: string) => `${prefix}$$\n${formula.trim()}\n$$`
  );

const wrapLooseGraphBlocks = (content: string): string => {
  const lines = content.split('\n');
  const output: string[] = [];

  let i = 0;
  while (i < lines.length) {
    const marker = parseLooseGraphMarker(lines[i]);

    if (!marker) {
      output.push(lines[i]);
      i += 1;
      continue;
    }

    const blockLines: string[] = marker.firstSourceLine ? [marker.firstSourceLine] : [];
    i += 1;

    while (i < lines.length) {
      const line = lines[i];
      if (line.trim() === '') break;
      blockLines.push(line);
      i += 1;
    }

    if (blockLines.length === 0) {
      output.push(lines[i - 1] ?? marker.language);
      continue;
    }

    output.push(`\`\`\`${marker.language}`);
    output.push(...blockLines);
    output.push('```');
  }

  return output.join('\n');
};

const loadMermaid = async (): Promise<MermaidApi> => {
  if (!mermaidPromise) {
    mermaidPromise = import('mermaid').then((module) => {
      if (!module.default) {
        throw new Error('Mermaid-Modul konnte nicht geladen werden.');
      }
      return module.default;
    });
  }
  return mermaidPromise;
};

const escapeMermaidLabel = (label: string): string =>
  label.replace(/\\/g, '\\\\').replace(/"/g, '\\"');

const sanitizeMermaidSource = (source: string): string => {
  let next = source;

  // Quote square-bracket labels with special chars, e.g. C[|] -> C["|"].
  next = next.replace(
    /(\b[A-Za-z0-9_-]+)\[\s*([^\]\n"]*?[^\w\s][^\]\n"]*)\s*\]/g,
    (_match, id: string, label: string) => `${id}["${escapeMermaidLabel(label.trim())}"]`
  );

  // Quote double-circle labels with special chars, e.g. A((★)) -> A(("★")).
  next = next.replace(
    /(\b[A-Za-z0-9_-]+)\(\(\s*([^\)\n"]*?[^\w\s][^\)\n"]*)\s*\)\)/g,
    (_match, id: string, label: string) => `${id}(("${escapeMermaidLabel(label.trim())}"))`
  );

  return next;
};

const loadFunctionPlot = async (): Promise<FunctionPlotFn> => {
  if (!functionPlotPromise) {
    functionPlotPromise = import('function-plot').then((module) => {
      const plotter = (module as unknown as { default?: FunctionPlotFn }).default ?? (module as unknown as FunctionPlotFn);
      if (typeof plotter !== 'function') {
        throw new Error('function-plot-Modul konnte nicht geladen werden.');
      }
      return plotter;
    });
  }
  return functionPlotPromise;
};

const isValidDomain = (value: unknown): value is [number, number] => {
  if (!Array.isArray(value) || value.length !== 2) return false;
  const [min, max] = value;
  return (
    typeof min === 'number' &&
    typeof max === 'number' &&
    Number.isFinite(min) &&
    Number.isFinite(max) &&
    min < max
  );
};

const getAxisDomain = (value: unknown): unknown => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return undefined;
  }
  return (value as Record<string, unknown>).domain;
};

const isValidPointTuple = (value: unknown): value is [number, number] => {
  if (!Array.isArray(value) || value.length !== 2) return false;
  const [x, y] = value;
  return (
    typeof x === 'number' &&
    Number.isFinite(x) &&
    typeof y === 'number' &&
    Number.isFinite(y)
  );
};

const isValidPointsArray = (value: unknown): value is [number, number][] => {
  return Array.isArray(value) && value.length > 0 && value.every(isValidPointTuple);
};

const parseFunctionPlotSpec = (source: string): { spec?: FunctionPlotSpec; error?: string } => {
  let parsed: unknown;
  try {
    parsed = JSON.parse(source);
  } catch {
    return { error: 'Ungueltiges JSON im functionplot-Block.' };
  }

  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    return { error: 'functionplot erwartet ein JSON-Objekt.' };
  }

  const payload = parsed as Record<string, unknown>;
  const rawSeries = payload.functions ?? payload.data;
  if (!Array.isArray(rawSeries) || rawSeries.length === 0) {
    return { error: 'functionplot braucht ein nicht-leeres "functions"- oder "data"-Array.' };
  }

  const data: FunctionPlotDataItem[] = [];
  for (const candidate of rawSeries) {
    if (!candidate || typeof candidate !== 'object' || Array.isArray(candidate)) {
      return { error: 'Jeder Eintrag in "functions"/"data" muss ein Objekt sein.' };
    }

    const item = candidate as Record<string, unknown>;

    const hasFn = typeof item.fn === 'string' && item.fn.trim() !== '';
    const hasPoints = item.points !== undefined && isValidPointsArray(item.points);

    if (!hasFn && !hasPoints) {
      return {
        error:
          'Jeder Eintrag in "functions"/"data" braucht entweder ein gueltiges "fn" oder gueltige "points".'
      };
    }

    if (item.points !== undefined && !isValidPointsArray(item.points)) {
      return { error: '"points" muss ein nicht-leeres Array von [x, y]-Zahlenpaaren sein.' };
    }

    data.push({
      ...item,
      fn: hasFn ? String(item.fn) : undefined,
      points: hasPoints ? (item.points as [number, number][]) : undefined
    });
  }

  const xDomain = payload.xDomain ?? getAxisDomain(payload.xAxis);
  const yDomain = payload.yDomain ?? getAxisDomain(payload.yAxis);

  if (xDomain !== undefined && !isValidDomain(xDomain)) {
    return { error: '"xDomain" (oder "xAxis.domain") muss [min, max] mit min < max sein.' };
  }
  if (yDomain !== undefined && !isValidDomain(yDomain)) {
    return { error: '"yDomain" (oder "yAxis.domain") muss [min, max] mit min < max sein.' };
  }
  if (payload.grid !== undefined && typeof payload.grid !== 'boolean') {
    return { error: '"grid" muss true oder false sein.' };
  }
  if (payload.title !== undefined && typeof payload.title !== 'string') {
    return { error: '"title" muss ein String sein.' };
  }

  return {
    spec: {
      data,
      xDomain: xDomain as [number, number] | undefined,
      yDomain: yDomain as [number, number] | undefined,
      grid: payload.grid as boolean | undefined,
      title: payload.title as string | undefined
    }
  };
};

const CodeBlockFallback: React.FC<{ language: string; code: string; error: string }> = ({ language, code, error }) => (
  <div className="my-4 rounded-xl border border-amber-200 bg-amber-50 p-4">
    <p className="mb-2 text-sm font-semibold text-amber-800">
      {language} konnte nicht dargestellt werden.
    </p>
    <p className="mb-3 text-xs text-amber-700">{error}</p>
    <pre className="overflow-x-auto rounded-lg border border-amber-100 bg-white p-3 text-xs text-slate-700">
      <code>{code}</code>
    </pre>
  </div>
);

const MermaidBlock: React.FC<{ code: string }> = ({ code }) => {
  const [svg, setSvg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    const renderMermaid = async () => {
      const renderSvg = async (mermaid: MermaidApi, source: string): Promise<string> => {
        const renderId = `mermaid-${Math.random().toString(36).slice(2, 11)}`;
        const rendered = await mermaid.render(renderId, source);
        return typeof rendered === 'string' ? rendered : rendered.svg;
      };

      try {
        setSvg(null);
        setError(null);
        const mermaid = await loadMermaid();

        if (!mermaidInitialized) {
          mermaid.initialize({
            startOnLoad: false,
            securityLevel: 'strict'
          });
          mermaidInitialized = true;
        }

        let nextSvg: string;
        try {
          nextSvg = await renderSvg(mermaid, code);
        } catch (firstError) {
          const sanitized = sanitizeMermaidSource(code);
          if (sanitized === code) {
            throw firstError;
          }
          nextSvg = await renderSvg(mermaid, sanitized);
        }

        if (!cancelled) {
          setSvg(nextSvg);
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Unbekannter Fehler');
        }
      }
    };

    void renderMermaid();
    return () => {
      cancelled = true;
    };
  }, [code]);

  if (error) {
    return <CodeBlockFallback language="mermaid" code={code} error={error} />;
  }

  if (!svg) {
    return (
      <div className="my-4 rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-500">
        Diagramm wird geladen ...
      </div>
    );
  }

  return (
    <ExpandableBlock
      className="my-4"
      title="Diagramm vergrößern"
      modalTitle="Diagramm"
      maxWidthClass="max-w-7xl"
      expandedContent={
        <div className="overflow-auto rounded-xl border border-slate-200 bg-white p-4">
          <div
            className="flex min-w-[620px] justify-center [&>svg]:block [&>svg]:h-auto [&>svg]:max-h-[74vh] [&>svg]:max-w-full [&>svg]:mx-auto"
            dangerouslySetInnerHTML={{ __html: svg }}
          />
        </div>
      }
    >
      <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white p-3 pr-12">
        <div
          className="flex justify-center [&>svg]:block [&>svg]:h-auto [&>svg]:max-w-full [&>svg]:mx-auto"
          dangerouslySetInnerHTML={{ __html: svg }}
        />
      </div>
    </ExpandableBlock>
  );
};

const FunctionPlotCanvas: React.FC<{ source: string; spec: FunctionPlotSpec; minHeight?: number }> = ({
  source,
  spec,
  minHeight = 260
}) => {
  const [runtimeError, setRuntimeError] = useState<string | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setRuntimeError(null);
  }, [source]);

  useEffect(() => {
    if (!containerRef.current) {
      return;
    }

    const chartRoot = containerRef.current;
    let disposed = false;
    let observer: ResizeObserver | null = null;
    let frameId: number | null = null;

    const draw = async () => {
      try {
        const functionPlot = await loadFunctionPlot();
        if (disposed || !chartRoot) return;

        chartRoot.innerHTML = '';

        const width = Math.max(320, Math.floor(chartRoot.clientWidth || 480));
        const height = Math.max(minHeight, Math.round(width * 0.62));

        functionPlot({
          target: chartRoot,
          width,
          height,
          title: spec.title,
          grid: spec.grid ?? true,
          xAxis: { domain: spec.xDomain ?? GRAPH_DEFAULT_DOMAIN },
          yAxis: { domain: spec.yDomain ?? GRAPH_DEFAULT_DOMAIN },
          data: spec.data
        });

        setRuntimeError(null);
      } catch (err) {
        if (!disposed) {
          setRuntimeError(err instanceof Error ? err.message : 'Unbekannter Fehler');
        }
      }
    };

    const scheduleDraw = () => {
      if (frameId !== null) {
        cancelAnimationFrame(frameId);
      }
      frameId = requestAnimationFrame(() => {
        void draw();
      });
    };

    scheduleDraw();

    if (typeof ResizeObserver !== 'undefined') {
      observer = new ResizeObserver(scheduleDraw);
      observer.observe(chartRoot);
    } else {
      window.addEventListener('resize', scheduleDraw);
    }

    return () => {
      disposed = true;
      if (frameId !== null) {
        cancelAnimationFrame(frameId);
      }
      if (observer) {
        observer.disconnect();
      } else {
        window.removeEventListener('resize', scheduleDraw);
      }
      chartRoot.innerHTML = '';
    };
  }, [minHeight, source, spec]);

  if (runtimeError) {
    return <CodeBlockFallback language="functionplot" code={source} error={runtimeError} />;
  }

  return <div ref={containerRef} className="w-full" style={{ minHeight }} />;
};

const FunctionPlotBlock: React.FC<{ source: string }> = ({ source }) => {
  const parsed = useMemo(() => parseFunctionPlotSpec(source), [source]);

  if (parsed.error) {
    return <CodeBlockFallback language="functionplot" code={source} error={parsed.error} />;
  }

  if (!parsed.spec) {
    return <CodeBlockFallback language="functionplot" code={source} error="functionplot konnte nicht gelesen werden." />;
  }

  return (
    <ExpandableBlock
      className="my-4"
      title="Diagramm vergrößern"
      modalTitle="Funktionsdiagramm"
      maxWidthClass="max-w-7xl"
      expandedContent={
        <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white p-4">
          <div className="min-w-[720px]">
            <FunctionPlotCanvas source={source} spec={parsed.spec} minHeight={520} />
          </div>
        </div>
      }
    >
      <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white p-3 pr-12">
        <FunctionPlotCanvas source={source} spec={parsed.spec} />
      </div>
    </ExpandableBlock>
  );
};

const ExpandableFormula: React.FC<React.HTMLAttributes<HTMLSpanElement>> = ({
  className = '',
  children,
  ...props
}) => {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <>
      <span className="group/formula relative my-4 block overflow-x-auto rounded-xl border border-slate-200 bg-white px-4 py-3 pr-12 text-center shadow-sm">
        <span
          className={`block min-w-max text-center [&_.katex-display]:my-0 ${className}`}
          {...props}
        >
          {children}
        </span>
        <ExpandableButton title="Formel vergrößern" onClick={() => setIsOpen(true)} />
      </span>
      <ExpandableModal
        isOpen={isOpen}
        title="Formel"
        onClose={() => setIsOpen(false)}
        maxWidthClass="max-w-5xl"
      >
        <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white p-5 sm:p-8">
          <span
            className={`block min-w-max text-center text-2xl sm:text-3xl [&_.katex-display]:my-0 ${className}`}
            {...props}
          >
            {children}
          </span>
        </div>
      </ExpandableModal>
    </>
  );
};

const MathRenderer: React.FC<MathRendererProps> = ({ content }) => {
  const normalizedContent = useMemo(() => {
    const withNormalizedEscapes = normalizeEscapedNewlines(content);
    const withDisplayMathBlocks = normalizeDisplayMathBlocks(withNormalizedEscapes);
    return wrapLooseGraphBlocks(withDisplayMathBlocks);
  }, [content]);

  return (
    <div className="math-renderer text-slate-800 leading-relaxed text-lg [&>p]:mb-4 last:[&>p]:mb-0">
      <ReactMarkdown
        remarkPlugins={[remarkMath]}
        rehypePlugins={[rehypeKatex]}
        components={{
          strong: ({ node, ...props }) => <span className="font-bold text-indigo-900" {...props} />,
          a: ({ node, ...props }) => <a className="text-indigo-600 hover:underline" {...props} />,
          span: ({ node: _node, className, children, ...props }: any) => {
            const normalizedClassName = typeof className === 'string' ? className : '';
            const isDisplayFormula = normalizedClassName.split(/\s+/).includes('katex-display');

            if (isDisplayFormula) {
              return (
                <ExpandableFormula className={normalizedClassName} {...props}>
                  {children}
                </ExpandableFormula>
              );
            }

            return (
              <span className={className} {...props}>
                {children}
              </span>
            );
          },
          code: ({ node: _node, inline, className, children, ...props }: any) =>
            inline ? (
              <code className="rounded bg-slate-100 px-1 py-0.5 font-mono text-sm text-slate-800" {...props}>
                {children}
              </code>
            ) : (
              <code className={className} {...props}>
                {children}
              </code>
            ),
          pre: ({ node: _node, children, ...props }: any) => {
            const codeChild = React.Children.toArray(children).find((child) => React.isValidElement(child));

            // In react-markdown, `codeChild.type` can be a custom component function
            // (because we override `code` above), not necessarily the literal string "code".
            if (React.isValidElement(codeChild)) {
              const codeProps = (codeChild.props ?? {}) as Record<string, unknown>;
              const className = (codeProps.className as string | undefined) ?? '';
              const language = (className.match(/language-([a-z0-9_-]+)/i)?.[1] ?? '').toLowerCase();
              const rawCodeValue = codeProps.children;
              const rawCode = (Array.isArray(rawCodeValue) ? rawCodeValue.join('') : String(rawCodeValue ?? '')).replace(/\n$/, '');
              const isUnlabeledMermaid = language === '' && looksLikeMermaidSource(rawCode);

              if (language === 'mermaid' || isUnlabeledMermaid) {
                return <MermaidBlock code={rawCode} />;
              }
              if (language === 'functionplot') {
                return <FunctionPlotBlock source={rawCode} />;
              }
            }

            return (
              <pre className="my-4 overflow-x-auto rounded-xl border border-slate-200 bg-slate-50 p-3" {...props}>
                {children}
              </pre>
            );
          }
        }}
      >
        {normalizedContent}
      </ReactMarkdown>
    </div>
  );
};

export default MathRenderer;
