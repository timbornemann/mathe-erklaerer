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

type FunctionPlotGraphType = 'polyline' | 'interval' | 'scatter' | 'text';

interface FunctionPlotDataItem {
  fn?: string;
  points?: [number, number][];
  color?: string;
  title?: string;
  fnType?: 'linear' | 'parametric' | 'implicit' | 'polar' | 'points' | 'vector' | string;
  graphType?: FunctionPlotGraphType;
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
const FUNCTION_PLOT_GRAPH_TYPES: readonly FunctionPlotGraphType[] = ['polyline', 'interval', 'scatter', 'text'];

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

const decodeCommonHtmlEntities = (value: string): string =>
  value
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/&apos;/gi, "'")
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&');

const extractSpanBlock = (
  content: string,
  startIndex: number
): { block: string; endIndex: number } | null => {
  const openingTagEnd = content.indexOf('>', startIndex);
  if (openingTagEnd === -1) {
    return null;
  }

  let depth = 1;
  let cursor = openingTagEnd + 1;

  while (cursor < content.length) {
    const nextOpen = content.indexOf('<span', cursor);
    const nextClose = content.indexOf('</span>', cursor);

    if (nextClose === -1) {
      return null;
    }

    if (nextOpen !== -1 && nextOpen < nextClose) {
      depth += 1;
      cursor = nextOpen + 5;
      continue;
    }

    depth -= 1;
    cursor = nextClose + 7;

    if (depth === 0) {
      return {
        block: content.slice(startIndex, cursor),
        endIndex: cursor
      };
    }
  }

  return null;
};

const isLikelyMathExpression = (value: string): boolean =>
  /\\[A-Za-z]+/.test(value) ||
  /[=+\-*/^_]/.test(value) ||
  /\b(?:frac|text|sqrt|sum|prod|int|lim|sin|cos|tan|log|ln|var)\b/i.test(value);

const recoverLeakedKatexMarkup = (raw: string): string => {
  if (!/(katex-html|katex-mathml|class\s*=\s*["'][^"']*katex[^"']*["'])/i.test(raw) &&
      !/&lt;span[^&]*katex/i.test(raw)) {
    return raw;
  }

  const decoded = /&lt;span[^&]*katex/i.test(raw) ? decodeCommonHtmlEntities(raw) : raw;
  let output = '';
  let cursor = 0;

  while (cursor < decoded.length) {
    const spanStart = decoded.indexOf('<span', cursor);
    if (spanStart === -1) {
      output += decoded.slice(cursor);
      break;
    }

    output += decoded.slice(cursor, spanStart);
    const openingTagEnd = decoded.indexOf('>', spanStart);
    if (openingTagEnd === -1) {
      output += decoded.slice(spanStart);
      break;
    }

    const openingTag = decoded.slice(spanStart, openingTagEnd + 1);
    const isKatexSpan = /class\s*=\s*["'][^"']*katex[^"']*["']/i.test(openingTag);

    if (!isKatexSpan) {
      output += openingTag;
      cursor = openingTagEnd + 1;
      continue;
    }

    const block = extractSpanBlock(decoded, spanStart);
    if (!block) {
      output += decoded.slice(spanStart);
      break;
    }

    const annotationMatch = block.block.match(
      /<annotation[^>]*encoding=["']application\/x-tex["'][^>]*>([\s\S]*?)<\/annotation>/i
    );
    const stripped = block.block.replace(/<[^>]+>/g, ' ');
    const plainText = decodeCommonHtmlEntities(annotationMatch?.[1] ?? stripped)
      .replace(/[\u200B-\u200D\uFEFF]/g, '')
      .replace(/\s+/g, ' ')
      .trim();

    if (plainText) {
      output += isLikelyMathExpression(plainText) ? `$${plainText}$` : plainText;
    }

    cursor = block.endIndex;
  }

  return output;
};

const escapeRegexToken = (value: string): string => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const collapseSpacedKeyword = (input: string, keyword: string): string => {
  const spacedPattern = keyword
    .split('')
    .map((character) => `${escapeRegexToken(character)}\\s*`)
    .join('');
  const pattern = new RegExp(spacedPattern, 'gi');
  return input.replace(pattern, keyword);
};

const collapseSpacedKeywords = (input: string, keywords: string[]): string => {
  let next = input;
  for (const keyword of keywords) {
    next = collapseSpacedKeyword(next, keyword);
  }
  return next;
};

const normalizeCommandBackslashRuns = (input: string): string =>
  // Some model outputs contain doubled escapes (e.g. "\\frac"), which KaTeX reads as a newline command.
  // For command names we normalize any run of "\" to a single "\".
  input.replace(/\\+(?=[A-Za-z])/g, '\\');

const normalizeBrokenJsonEscapes = (input: string): string =>
  input
    .replace(/\u0008(?=[A-Za-z])/g, '\\b')
    .replace(/\u000c(?=[A-Za-z])/g, '\\f')
    .replace(/\r(?=[A-Za-z])/g, '\\r')
    .replace(/\t(?=[A-Za-z])/g, '\\t')
    .replace(
      /\n(?=(?:eq|eqslant|eqq|infty|neq|nabla|notin|subseteq|supseteq|rightarrow|leftarrow|to|mid|parallel|leq|geq|sim|simeq|approx)\b)/gi,
      '\\n'
    );

const repairTextCommand = (input: string): string => {
  let next = input;
  next = next.replace(/\\text([A-Za-z][A-Za-z0-9]*)/g, (_match, word: string) => `\\text{${word}}`);
  next = next.replace(/(^|[^\\A-Za-z])text(?=\s*\{)/g, (_match, prefix: string) => `${prefix}\\text`);
  next = next.replace(
    /(^|[^\\A-Za-z])text([A-Za-z][A-Za-z0-9]*)/g,
    (_match, prefix: string, word: string) => `${prefix}\\text{${word}}`
  );
  return next;
};

const MATH_COMMANDS_TO_REPAIR = [
  'frac',
  'sqrt',
  'left',
  'right',
  'mathbb',
  'operatorname',
  'partial',
  'cdot',
  'times',
  'leq',
  'geq',
  'neq',
  'approx',
  'infty',
  'sum',
  'prod',
  'int',
  'lim',
  'sin',
  'cos',
  'tan',
  'log',
  'ln',
  'alpha',
  'beta',
  'gamma',
  'delta',
  'theta',
  'lambda',
  'mu',
  'pi',
  'sigma',
  'bar'
];

const repairMissingCommandBackslashes = (input: string): string => {
  let next = input;

  for (const command of MATH_COMMANDS_TO_REPAIR) {
    const pattern = new RegExp(`(^|[^\\\\A-Za-z])(${escapeRegexToken(command)})(?=\\b)`, 'g');
    next = next.replace(pattern, (_match, prefix: string, token: string) => `${prefix}\\${token}`);
  }

  return next;
};

const GREEK_COMMANDS_WITH_IMPLICIT_MULTIPLICATION = [
  'alpha',
  'beta',
  'gamma',
  'delta',
  'epsilon',
  'varepsilon',
  'zeta',
  'eta',
  'theta',
  'vartheta',
  'iota',
  'kappa',
  'lambda',
  'mu',
  'nu',
  'xi',
  'pi',
  'rho',
  'sigma',
  'tau',
  'phi',
  'varphi',
  'chi',
  'psi',
  'omega'
];

const normalizeGluedGreekProducts = (input: string): string => {
  let next = input;

  for (const command of GREEK_COMMANDS_WITH_IMPLICIT_MULTIPLICATION) {
    const pattern = new RegExp(`\\\\${command}(?=[A-Za-z])`, 'g');
    next = next.replace(pattern, `\\${command} `);
  }

  return next;
};

const normalizeMathbbSymbols = (input: string): string =>
  input.replace(/\\mathbb([A-Za-z])/g, (_match, symbol: string) => `\\mathbb{${symbol}}`);

const normalizeCompactFracHints = (input: string): string =>
  input
    .replace(/\\frac(\d+)(?=[A-Za-z\\])/g, (_match, numerator: string) => `\\frac ${numerator} `)
    .replace(/\\frac(\\(?:sigma|lambda|theta|mu|alpha|beta|gamma|delta)(?:\^\{?[\dA-Za-z]+\}?)?)(?=[A-Za-z\\(])/g, (_match, numerator: string) => `\\frac ${numerator} `)
    .replace(/\\frac(\\partial(?:\^\{?[\dA-Za-z]+\}?)?)(?=\\partial)/g, (_match, numerator: string) => `\\frac ${numerator} `);

const normalizeSpecialMathNames = (input: string): string => {
  let next = input;

  next = next
    .replace(/\\operatorname([A-Za-z]+)\s*\(/g, (_match, name: string) => `\\operatorname{${name}}(`)
    .replace(/(^|[^\\A-Za-z])operatorname([A-Za-z]+)\s*\(/gi, (_match, prefix: string, name: string) => `${prefix}\\operatorname{${name}}(`)
    .replace(/\\text\s*\{\s*\\?var\s*\}\s*\(/gi, '\\operatorname{Var}(')
    .replace(/\\text\s*\{\s*var\s*\}\s*\(/gi, '\\operatorname{Var}(')
    .replace(/\\text\s*\{\s*\\?eff\s*\}\s*\(/gi, '\\operatorname{eff}(')
    .replace(/\\text\s*\{\s*eff\s*\}\s*\(/gi, '\\operatorname{eff}(')
    .replace(/\\text\\var\s*\(/gi, '\\operatorname{Var}(')
    .replace(/(^|[^\\A-Za-z])text\\var\s*\(/gi, (_match, prefix: string) => `${prefix}\\operatorname{Var}(`)
    .replace(/\\text\{var\}\s*\(/gi, '\\operatorname{Var}(')
    .replace(/\\var\s*\(/gi, '\\operatorname{Var}(')
    .replace(/(^|[^\\A-Za-z])var\s*\(/gi, (_match, prefix: string) => `${prefix}\\operatorname{Var}(`)
    .replace(/\\text\\eff\s*\(/gi, '\\operatorname{eff}(')
    .replace(/(^|[^\\A-Za-z])text\\eff\s*\(/gi, (_match, prefix: string) => `${prefix}\\operatorname{eff}(`)
    .replace(/\\text\{eff\}\s*\(/gi, '\\operatorname{eff}(')
    .replace(/\\eff\s*\(/g, '\\operatorname{eff}(')
    .replace(/(^|[^\\A-Za-z])eff\s*\(/gi, (_match, prefix: string) => `${prefix}\\operatorname{eff}(`);

  return next;
};

const normalizeOperatorAttachments = (input: string): string => {
  let next = input;

  // Greek-letter-specific glued forms (must run before the general single-letter rule below).
  next = next
    .replace(/\\partialtheta/g, '\\partial\\theta')
    .replace(/\\partiallambda/g, '\\partial\\lambda')
    .replace(/\\partialsigma/g, '\\partial\\sigma');

  // \partial glued to a single letter, e.g. \partiall -> \partial l (but not \partialtheta which is already handled above).
  next = next.replace(/\\partial([A-Za-z])(?![A-Za-z])/g, (_m, letter: string) => `\\partial ${letter}`);

  // Operator commands glued to a single following letter, e.g. \lnL -> \ln L, \lnf -> \ln f.
  next = next.replace(
    /\\(ln|log|sin|cos|tan|exp|det|dim|ker|deg)([A-Za-z])(?![A-Za-z])/g,
    (_m, cmd: string, letter: string) => `\\${cmd} ${letter}`
  );

  return next;
};

const normalizeAccentCommands = (input: string): string =>
  input.replace(
    /\\(bar|hat|tilde|vec|dot|ddot|breve|check)([A-Za-z0-9])(?![A-Za-z])/g,
    (_match, accent: string, symbol: string) => `\\${accent}{${symbol}}`
  );

const TEXT_WRAPPED_MATH_COMMANDS = new Set<string>([
  'sum',
  'prod',
  'int',
  'lim',
  'limsup',
  'liminf',
  'frac',
  'dfrac',
  'tfrac',
  'sqrt',
  'cdot',
  'times',
  'pm',
  'mp',
  'neq',
  'approx',
  'sim',
  'simeq',
  'leq',
  'geq',
  'infty',
  'partial',
  'alpha',
  'beta',
  'gamma',
  'delta',
  'epsilon',
  'varepsilon',
  'zeta',
  'eta',
  'theta',
  'vartheta',
  'iota',
  'kappa',
  'lambda',
  'mu',
  'nu',
  'xi',
  'pi',
  'rho',
  'sigma',
  'tau',
  'phi',
  'varphi',
  'chi',
  'psi',
  'omega',
  'dot',
  'ddot',
  'bar',
  'hat',
  'tilde',
  'vec'
]);

const stripLikelyJsonQuoteArtifacts = (input: string): string => {
  let next = input.trim();
  let changed = true;

  while (changed) {
    changed = false;

    const quoted = next.match(/^([`'"])([\s\S]*)\1,?$/);
    if (quoted && /\\[A-Za-z]/.test(quoted[2])) {
      next = quoted[2].trim();
      changed = true;
      continue;
    }

    const trailingComma = next.match(/^([\s\S]*?)\s*,\s*$/);
    if (trailingComma && /\\[A-Za-z]/.test(trailingComma[1])) {
      next = trailingComma[1].trim();
      changed = true;
    }
  }

  return next;
};

const LATEX_COMMAND_HINTS = new Set<string>([
  'text',
  'sum',
  'prod',
  'int',
  'lim',
  'frac',
  'dfrac',
  'tfrac',
  'sqrt',
  'cdot',
  'times',
  'sim',
  'in',
  'to',
  'left',
  'right',
  'alpha',
  'beta',
  'gamma',
  'delta',
  'theta',
  'lambda',
  'mu',
  'pi',
  'sigma',
  'dot',
  'bar',
  'hat'
]);

const hasMarkdownLinePrefix = (line: string): boolean =>
  /^(?:[#>*-]|\d+\.)\s/.test(line.trim());

const looksLikeStandaloneLatexLine = (line: string): string | null => {
  const trimmed = line.trim();
  if (!trimmed || trimmed.includes('$')) {
    return null;
  }

  const candidate = stripLikelyJsonQuoteArtifacts(trimmed);
  if (!candidate || candidate.includes('$')) {
    return null;
  }

  const commandMatches = candidate.match(/\\[A-Za-z]+/g) ?? [];
  if (commandMatches.length === 0) {
    return null;
  }

  const hintCount = commandMatches.reduce((count, command) => {
    const key = command.slice(1).toLowerCase();
    return LATEX_COMMAND_HINTS.has(key) ? count + 1 : count;
  }, 0);

  const startsWithCommand = /^["'`([{<]*\\[A-Za-z]+/.test(candidate);
  const hasMathSignal =
    /[{}_^]/.test(candidate) ||
    /\\[()[\]{}]/.test(candidate) ||
    /\s(?:=|\\sim|\\in|\\to)\s/.test(candidate);

  const residualText = candidate
    .replace(/\\[A-Za-z]+/g, ' ')
    .replace(/[{}_^=+\-*/~(),.[\]\\]/g, ' ')
    .replace(/\d+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  const residualWordCount = residualText ? residualText.split(' ').filter((word) => word.length >= 2).length : 0;

  const likelyLatex =
    (startsWithCommand && (commandMatches.length >= 2 || hasMathSignal)) ||
    (hintCount >= 3 && residualWordCount <= 4) ||
    (hasMathSignal && commandMatches.length >= 3 && residualWordCount <= 4);

  if (!likelyLatex) {
    return null;
  }

  if (!startsWithCommand && residualWordCount > 4) {
    return null;
  }

  if (residualWordCount > 8 && hintCount < 3) {
    return null;
  }

  return candidate;
};

const wrapQuotedLatexFragments = (line: string): string => {
  let next = line;
  const quotedPatterns = [
    /"([^"\n]*\\[A-Za-z][^"\n]*)",?/g,
    /'([^'\n]*\\[A-Za-z][^'\n]*)',?/g,
    /`([^`\n]*\\[A-Za-z][^`\n]*)`,?/g
  ];

  for (const pattern of quotedPatterns) {
    next = next.replace(pattern, (match, inner: string) => {
      const candidate = looksLikeStandaloneLatexLine(inner);
      return candidate ? `$$${candidate}$$` : match;
    });
  }

  return next;
};

const wrapLooseLatexBlocks = (content: string): string => {
  const lines = content.split('\n');
  const output: string[] = [];
  let inFence = false;

  for (const line of lines) {
    const trimmed = line.trim();

    if (/^`{3,}|^~{3,}/.test(trimmed)) {
      inFence = !inFence;
      output.push(line);
      continue;
    }

    if (inFence || !trimmed || hasMarkdownLinePrefix(line)) {
      output.push(line);
      continue;
    }

    const latexCandidate = looksLikeStandaloneLatexLine(line);
    if (!latexCandidate) {
      output.push(wrapQuotedLatexFragments(line));
      continue;
    }

    const leadingWhitespace = (line.match(/^\s*/) ?? [''])[0];
    output.push(`${leadingWhitespace}$$${latexCandidate}$$`);
  }

  return output.join('\n');
};

const isTextWrappedMathCommand = (value: string): boolean => {
  const trimmed = value.trim();
  if (!trimmed.startsWith('\\')) {
    return false;
  }

  const commandMatch = trimmed.match(/^\\([A-Za-z]+)/);
  if (!commandMatch) {
    return false;
  }

  const command = commandMatch[1].toLowerCase();
  if (TEXT_WRAPPED_MATH_COMMANDS.has(command)) {
    return true;
  }

  return /[_^{}]/.test(trimmed);
};

const splitLeadingScript = (token: string): { script: string; rest: string } | null => {
  if (!token || (token[0] !== '^' && token[0] !== '_')) {
    return null;
  }

  const marker = token[0];
  if (token.length < 2) {
    return null;
  }

  if (token[1] === '{') {
    let depth = 0;
    for (let index = 1; index < token.length; index += 1) {
      const char = token[index];
      if (char === '{') depth += 1;
      if (char === '}') {
        depth -= 1;
        if (depth === 0) {
          return {
            script: token.slice(0, index + 1),
            rest: token.slice(index + 1)
          };
        }
      }
    }
    return null;
  }

  if (token[1] === '\\') {
    let endIndex = 2;
    while (endIndex < token.length && /[A-Za-z]/.test(token[endIndex])) {
      endIndex += 1;
    }
    return {
      script: token.slice(0, endIndex),
      rest: token.slice(endIndex)
    };
  }

  return {
    script: `${marker}${token[1]}`,
    rest: token.slice(2)
  };
};

const readBalancedGroup = (
  source: string,
  startIndex: number,
  openChar: '{' | '(',
  closeChar: '}' | ')'
): number => {
  if (source[startIndex] !== openChar) return -1;

  let depth = 0;
  for (let index = startIndex; index < source.length; index += 1) {
    const char = source[index];
    if (char === openChar) depth += 1;
    if (char === closeChar) {
      depth -= 1;
      if (depth === 0) {
        return index + 1;
      }
    }
  }

  return -1;
};

const normalizeTextWrappedMathCommands = (input: string): string => {
  let output = '';
  let cursor = 0;

  while (cursor < input.length) {
    const textIndex = input.indexOf('\\text', cursor);

    if (textIndex === -1) {
      output += input.slice(cursor);
      break;
    }

    output += input.slice(cursor, textIndex);
    let probe = textIndex + '\\text'.length;

    while (probe < input.length && /\s/.test(input[probe])) {
      probe += 1;
    }

    if (input[probe] !== '{') {
      output += '\\text';
      cursor = textIndex + '\\text'.length;
      continue;
    }

    const bodyEnd = readBalancedGroup(input, probe, '{', '}');
    if (bodyEnd === -1) {
      output += input.slice(textIndex);
      break;
    }

    const body = input.slice(probe + 1, bodyEnd - 1);
    if (isTextWrappedMathCommand(body)) {
      output += body.trim();
    } else {
      output += input.slice(textIndex, bodyEnd);
    }

    cursor = bodyEnd;
  }

  return output;
};

const readLooseMathToken = (
  source: string,
  startIndex: number
): { token: string; nextIndex: number } | null => {
  let index = startIndex;
  while (index < source.length && /\s/.test(source[index])) {
    index += 1;
  }

  if (index >= source.length) {
    return null;
  }

  const first = source[index];

  if (first === '{') {
    const endIndex = readBalancedGroup(source, index, '{', '}');
    if (endIndex === -1) return null;
    return { token: source.slice(index, endIndex), nextIndex: endIndex };
  }

  if (first === '(') {
    const endIndex = readBalancedGroup(source, index, '(', ')');
    if (endIndex === -1) return null;
    return { token: source.slice(index, endIndex), nextIndex: endIndex };
  }

  if (first === '\\') {
    let endIndex = index + 1;
    while (endIndex < source.length && /[A-Za-z]/.test(source[endIndex])) {
      endIndex += 1;
    }

    if (source.slice(index, endIndex) === '\\text' && source[endIndex] === '{') {
      const textGroupEnd = readBalancedGroup(source, endIndex, '{', '}');
      if (textGroupEnd !== -1) {
        endIndex = textGroupEnd;
      }
    }

    while (endIndex < source.length && /\s/.test(source[endIndex])) {
      endIndex += 1;
    }

    if (source[endIndex] === '(') {
      const parenEnd = readBalancedGroup(source, endIndex, '(', ')');
      if (parenEnd !== -1) {
        endIndex = parenEnd;
      }
    }

    return { token: source.slice(index, endIndex), nextIndex: endIndex };
  }

  let endIndex = index;
  while (
    endIndex < source.length &&
    !/\s/.test(source[endIndex]) &&
    source[endIndex] !== '$' &&
    source[endIndex] !== '}' &&
    source[endIndex] !== ')'
  ) {
    endIndex += 1;
  }

  if (endIndex === index) {
    return null;
  }

  return { token: source.slice(index, endIndex), nextIndex: endIndex };
};

const normalizeLooseFractions = (input: string): string => {
  let output = '';
  let cursor = 0;

  while (cursor < input.length) {
    const fracIndex = input.indexOf('\\frac', cursor);

    if (fracIndex === -1) {
      output += input.slice(cursor);
      break;
    }

    output += input.slice(cursor, fracIndex);
    const afterFrac = fracIndex + 5;
    let probe = afterFrac;
    while (probe < input.length && /\s/.test(input[probe])) {
      probe += 1;
    }

    if (input[probe] === '{') {
      output += '\\frac';
      cursor = afterFrac;
      continue;
    }

    const numerator = readLooseMathToken(input, afterFrac);
    if (!numerator) {
      output += '\\frac';
      cursor = afterFrac;
      continue;
    }

    const denominator = readLooseMathToken(input, numerator.nextIndex);
    if (!denominator) {
      output += input.slice(fracIndex, numerator.nextIndex);
      cursor = numerator.nextIndex;
      continue;
    }

    let numeratorToken = numerator.token.trim();
    let denominatorToken = denominator.token.trim();

    const leadingScript = splitLeadingScript(denominatorToken);
    if (leadingScript && leadingScript.rest.trim().length > 0) {
      numeratorToken = `${numeratorToken}${leadingScript.script}`;
      denominatorToken = leadingScript.rest.trim();
    }

    output += `\\frac{${numeratorToken}}{${denominatorToken}}`;
    cursor = denominator.nextIndex;
  }

  return output;
};

const repairLatexExpression = (rawExpression: string): string => {
  let next = rawExpression
    .normalize('NFKD')
    .replace(/\u00a0/g, ' ')
    .replace(/[\u200B-\u200D\uFEFF]/g, '');

  next = stripLikelyJsonQuoteArtifacts(next);
  next = normalizeCommandBackslashRuns(next);
  next = collapseSpacedKeywords(next, [
    'text',
    'frac',
    'sqrt',
    'var',
    'eff',
    'left',
    'right',
    'mathbb',
    'partial',
    'theta',
    'lambda',
    'sigma',
    'geq',
    'leq',
    'ln'
  ]);
  next = normalizeBrokenJsonEscapes(next);
  next = next.replace(/\s*\n+\s*/g, ' ');
  next = repairTextCommand(next);
  next = normalizeTextWrappedMathCommands(next);
  next = normalizeGluedGreekProducts(next);
  next = repairMissingCommandBackslashes(next);
  next = normalizeSpecialMathNames(next);
  next = normalizeMathbbSymbols(next);
  next = normalizeOperatorAttachments(next);
  next = normalizeAccentCommands(next);
  next = normalizeCompactFracHints(next);
  next = normalizeLooseFractions(next);

  return next.replace(/\s{2,}/g, ' ').trim();
};

const isEscapedCharacterAt = (value: string, index: number): boolean => {
  let backslashCount = 0;
  for (let cursor = index - 1; cursor >= 0 && value[cursor] === '\\'; cursor -= 1) {
    backslashCount += 1;
  }
  return backslashCount % 2 === 1;
};

const findMathSegmentEnd = (content: string, startIndex: number, delimiter: '$' | '$$'): number => {
  let cursor = startIndex;

  while (cursor < content.length) {
    if (delimiter === '$$') {
      if (content[cursor] === '$' && content[cursor + 1] === '$' && !isEscapedCharacterAt(content, cursor)) {
        return cursor;
      }
      cursor += 1;
      continue;
    }

    if (content[cursor] === '$' && content[cursor + 1] !== '$' && !isEscapedCharacterAt(content, cursor)) {
      return cursor;
    }
    cursor += 1;
  }

  return -1;
};

const repairLatexInMathSegments = (raw: string): string => {
  let output = '';
  let cursor = 0;

  while (cursor < raw.length) {
    if (raw[cursor] !== '$' || isEscapedCharacterAt(raw, cursor)) {
      output += raw[cursor];
      cursor += 1;
      continue;
    }

    const delimiter: '$' | '$$' = raw[cursor + 1] === '$' ? '$$' : '$';
    const segmentStart = cursor + delimiter.length;
    const segmentEnd = findMathSegmentEnd(raw, segmentStart, delimiter);

    if (segmentEnd === -1) {
      output += raw.slice(cursor);
      break;
    }

    const segment = raw.slice(segmentStart, segmentEnd);
    const repairedSegment = repairLatexExpression(segment);
    output += `${delimiter}${repairedSegment}${delimiter}`;
    cursor = segmentEnd + delimiter.length;
  }

  return output;
};

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
      const trimmed = line.trim();
      if (trimmed === '' || /^`{3,}|^~{3,}/.test(trimmed)) break;
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
  let next = source.replace(/\r\n?/g, '\n');

  // Keep only the Mermaid section if extra markdown/code-fence text leaked into the block.
  const mermaidLines: string[] = [];
  for (const line of next.split('\n')) {
    const fenceIndex = line.search(/`{3,}|~{3,}/);
    if (fenceIndex >= 0) {
      const beforeFence = line.slice(0, fenceIndex).trimEnd();
      if (beforeFence) {
        mermaidLines.push(beforeFence);
      }
      break;
    }
    mermaidLines.push(line);
  }
  next = mermaidLines.join('\n');

  // Some model outputs chain multiple edge statements into one line.
  // Split likely statement boundaries so Mermaid parser gets one statement per line.
  const splitRegexes = [
    /(\]|\)|\})\s+([A-Za-z][A-Za-z0-9_-]*\s*(?:-->|---|==>|-.->|--x|--o|<--|<-->))/g,
    /(\b[A-Za-z][A-Za-z0-9_-]*)\s+([A-Za-z][A-Za-z0-9_-]*\s*(?:-->|---|==>|-.->|--x|--o|<--|<-->))/g
  ];
  const graphDeclarationRegex = /^(?:graph|flowchart|sequenceDiagram|classDiagram|stateDiagram|erDiagram|journey|gantt|pie|mindmap|timeline|xychart)\b/i;
  next = next
    .split('\n')
    .map((line) => {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('%%') || graphDeclarationRegex.test(trimmed)) {
        return line;
      }

      let normalized = line;
      for (const pattern of splitRegexes) {
        let previous = '';
        while (previous !== normalized) {
          previous = normalized;
          normalized = normalized.replace(pattern, '$1\n$2');
        }
      }
      return normalized;
    })
    .join('\n');

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

    if (
      item.graphType !== undefined &&
      (typeof item.graphType !== 'string' ||
        !FUNCTION_PLOT_GRAPH_TYPES.includes(item.graphType as FunctionPlotGraphType))
    ) {
      return { error: '"graphType" muss "polyline", "interval", "scatter" oder "text" sein.' };
    }

    if (item.fnType !== undefined && typeof item.fnType !== 'string') {
      return { error: '"fnType" muss ein String sein.' };
    }

    data.push({
      ...item,
      fn: hasFn ? String(item.fn) : undefined,
      points: hasPoints ? (item.points as [number, number][]) : undefined,
      fnType: typeof item.fnType === 'string' ? item.fnType : hasPoints ? 'points' : undefined,
      graphType: typeof item.graphType === 'string'
        ? (item.graphType as FunctionPlotGraphType)
        : hasPoints
        ? 'scatter'
        : undefined
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
    const withRecoveredKatex = recoverLeakedKatexMarkup(withDisplayMathBlocks);
    const withWrappedGraphBlocks = wrapLooseGraphBlocks(withRecoveredKatex);
    const withWrappedLatexBlocks = wrapLooseLatexBlocks(withWrappedGraphBlocks);
    return repairLatexInMathSegments(withWrappedLatexBlocks);
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
