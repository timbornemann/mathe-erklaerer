import React, { useEffect, useMemo, useRef, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
import 'katex/dist/katex.min.css';

interface MathRendererProps {
  content: string;
}

interface FunctionPlotLine {
  fn: string;
  color?: string;
  title?: string;
}

interface FunctionPlotSpec {
  functions: FunctionPlotLine[];
  xDomain?: [number, number];
  yDomain?: [number, number];
  grid?: boolean;
  title?: string;
}

type MermaidApi = (typeof import('mermaid'))['default'];
type FunctionPlotFn = (typeof import('function-plot'))['default'];

let mermaidPromise: Promise<MermaidApi> | null = null;
let mermaidInitialized = false;
let functionPlotPromise: Promise<FunctionPlotFn> | null = null;

const GRAPH_DEFAULT_DOMAIN: [number, number] = [-10, 10];

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
  const rawFunctions = payload.functions;
  if (!Array.isArray(rawFunctions) || rawFunctions.length === 0) {
    return { error: 'functionplot braucht ein nicht-leeres "functions"-Array.' };
  }

  const functions: FunctionPlotLine[] = [];
  for (const candidate of rawFunctions) {
    if (!candidate || typeof candidate !== 'object' || Array.isArray(candidate)) {
      return { error: 'Jeder Eintrag in "functions" muss ein Objekt sein.' };
    }
    const item = candidate as Record<string, unknown>;
    if (typeof item.fn !== 'string' || item.fn.trim() === '') {
      return { error: 'Jeder Eintrag in "functions" braucht ein gueltiges "fn".' };
    }
    functions.push({
      fn: item.fn,
      color: typeof item.color === 'string' ? item.color : undefined,
      title: typeof item.title === 'string' ? item.title : undefined
    });
  }

  if (payload.xDomain !== undefined && !isValidDomain(payload.xDomain)) {
    return { error: '"xDomain" muss ein Zahlenpaar [min, max] mit min < max sein.' };
  }
  if (payload.yDomain !== undefined && !isValidDomain(payload.yDomain)) {
    return { error: '"yDomain" muss ein Zahlenpaar [min, max] mit min < max sein.' };
  }
  if (payload.grid !== undefined && typeof payload.grid !== 'boolean') {
    return { error: '"grid" muss true oder false sein.' };
  }
  if (payload.title !== undefined && typeof payload.title !== 'string') {
    return { error: '"title" muss ein String sein.' };
  }

  return {
    spec: {
      functions,
      xDomain: payload.xDomain as [number, number] | undefined,
      yDomain: payload.yDomain as [number, number] | undefined,
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

        const renderId = `mermaid-${Math.random().toString(36).slice(2, 11)}`;
        const rendered = await mermaid.render(renderId, code);
        const nextSvg = typeof rendered === 'string' ? rendered : rendered.svg;

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
    <div className="my-4 overflow-x-auto rounded-xl border border-slate-200 bg-white p-3">
      <div className="[&>svg]:h-auto [&>svg]:max-w-full" dangerouslySetInnerHTML={{ __html: svg }} />
    </div>
  );
};

const FunctionPlotBlock: React.FC<{ source: string }> = ({ source }) => {
  const parsed = useMemo(() => parseFunctionPlotSpec(source), [source]);
  const [runtimeError, setRuntimeError] = useState<string | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setRuntimeError(null);
  }, [source]);

  useEffect(() => {
    if (parsed.error || !parsed.spec || !containerRef.current) {
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
        const height = Math.max(240, Math.round(width * 0.62));

        functionPlot({
          target: chartRoot,
          width,
          height,
          title: parsed.spec.title,
          grid: parsed.spec.grid ?? true,
          xAxis: { domain: parsed.spec.xDomain ?? GRAPH_DEFAULT_DOMAIN },
          yAxis: { domain: parsed.spec.yDomain ?? GRAPH_DEFAULT_DOMAIN },
          data: parsed.spec.functions.map((entry) => ({
            fn: entry.fn,
            color: entry.color,
            title: entry.title
          }))
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
  }, [parsed.error, parsed.spec, source]);

  if (parsed.error) {
    return <CodeBlockFallback language="functionplot" code={source} error={parsed.error} />;
  }

  if (runtimeError) {
    return <CodeBlockFallback language="functionplot" code={source} error={runtimeError} />;
  }

  return (
    <div className="my-4 overflow-x-auto rounded-xl border border-slate-200 bg-white p-3">
      <div ref={containerRef} className="w-full min-h-[260px]" />
    </div>
  );
};

const MathRenderer: React.FC<MathRendererProps> = ({ content }) => {
  return (
    <div className="math-renderer text-slate-800 leading-relaxed text-lg [&>p]:mb-4 last:[&>p]:mb-0">
      <ReactMarkdown
        remarkPlugins={[remarkMath]}
        rehypePlugins={[rehypeKatex]}
        components={{
          strong: ({ node, ...props }) => <span className="font-bold text-indigo-900" {...props} />,
          a: ({ node, ...props }) => <a className="text-indigo-600 hover:underline" {...props} />,
          code: ({ inline, className, children, ...props }: any) =>
            inline ? (
              <code className="rounded bg-slate-100 px-1 py-0.5 font-mono text-sm text-slate-800" {...props}>
                {children}
              </code>
            ) : (
              <code className={className} {...props}>
                {children}
              </code>
            ),
          pre: ({ children, ...props }: any) => {
            const codeChild = React.Children.toArray(children)[0];
            if (React.isValidElement(codeChild) && codeChild.type === 'code') {
              const className = (codeChild.props.className as string | undefined) ?? '';
              const language = (className.match(/language-([a-z0-9_-]+)/i)?.[1] ?? '').toLowerCase();
              const rawCodeValue = codeChild.props.children;
              const rawCode = (Array.isArray(rawCodeValue) ? rawCodeValue.join('') : String(rawCodeValue ?? '')).replace(/\n$/, '');

              if (language === 'mermaid') {
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
        {content}
      </ReactMarkdown>
    </div>
  );
};

export default MathRenderer;
