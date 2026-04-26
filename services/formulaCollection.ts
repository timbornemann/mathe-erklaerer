import { FormulaDetailCard, FormulaEntry, FormulaGenerationPayload, FormulaSourceRef, FormulaStatus } from '../types';

export const FORMULA_COLLECTION_STORAGE_KEY = 'mathFormulaCollection';

const clampUsage = (value: number): number => {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.round(value));
};

const trimOrFallback = (value: unknown, fallback: string): string => {
  if (typeof value !== 'string') return fallback;
  const trimmed = value.trim();
  return trimmed || fallback;
};

const toStringArray = (value: unknown): string[] =>
  Array.isArray(value)
    ? value
        .filter((entry): entry is string => typeof entry === 'string')
        .map((entry) => entry.trim())
        .filter((entry) => entry.length > 0)
    : [];

export const normalizeFormulaLatex = (formula: string): string => {
  let normalized = formula.trim();
  normalized = normalized.replace(/^\$\$([\s\S]*)\$\$$/, '$1').trim();
  normalized = normalized.replace(/^\$([\s\S]*)\$$/, '$1').trim();
  normalized = normalized.replace(/^\\\(([\s\S]*)\\\)$/, '$1').trim();
  normalized = normalized.replace(/^\\\[([\s\S]*)\\\]$/, '$1').trim();
  normalized = normalized.replace(/\s+/g, '');
  return normalized;
};

export const normalizeTagList = (tags: string[]): string[] => {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const tag of tags) {
    const normalized = tag.trim().toLowerCase();
    if (!normalized || seen.has(normalized)) continue;
    seen.add(normalized);
    result.push(normalized);
  }
  return result;
};

export const normalizeProjectIds = (projectIds: string[]): string[] => {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const id of projectIds) {
    const normalized = id.trim();
    if (!normalized || seen.has(normalized)) continue;
    seen.add(normalized);
    result.push(normalized);
  }
  return result;
};

export const mergeSourceRefs = (current: FormulaSourceRef[], incoming: FormulaSourceRef[]): FormulaSourceRef[] => {
  const byId = new Map<string, FormulaSourceRef>();
  for (const source of [...current, ...incoming]) {
    const key = `${source.type}:${source.id}`;
    const existing = byId.get(key);
    if (!existing || source.createdAt >= existing.createdAt) {
      byId.set(key, source);
    }
  }
  return Array.from(byId.values()).sort((a, b) => b.createdAt - a.createdAt);
};

export const buildFallbackFormulaPayload = (formula: string): FormulaGenerationPayload => ({
  formula,
  title: 'Neue Formel',
  shortExplanation: '',
  stepByStepExplanation: '',
  examples: [],
  purpose: '',
  tags: [],
  detailCards: undefined
});

const sanitizeDetailCards = (value: unknown): FormulaDetailCard[] | undefined => {
  if (!Array.isArray(value)) return undefined;
  const cards = value
    .filter((item): item is Record<string, unknown> => !!item && typeof item === 'object')
    .map((item) => ({
      title: typeof item.title === 'string' ? item.title.trim() : '',
      explanation: typeof item.explanation === 'string' ? item.explanation.trim() : '',
      formulas: (Array.isArray(item.formulas)
        ? item.formulas.filter((f): f is string => typeof f === 'string').map((f) => f.trim()).filter((f) => f.length > 0)
        : [])
    }))
    .filter((card) => card.title || card.explanation);
  return cards.length > 0 ? cards : undefined;
};

export const sanitizeFormulaPayload = (
  payload: Partial<FormulaGenerationPayload> & { formula: string }
): FormulaGenerationPayload => {
  const fallback = buildFallbackFormulaPayload(payload.formula);
  return {
    formula: trimOrFallback(payload.formula, fallback.formula),
    title: trimOrFallback(payload.title, fallback.title),
    shortExplanation: trimOrFallback(payload.shortExplanation, fallback.shortExplanation),
    stepByStepExplanation: trimOrFallback(payload.stepByStepExplanation, fallback.stepByStepExplanation),
    examples: toStringArray(payload.examples),
    purpose: trimOrFallback(payload.purpose, fallback.purpose),
    tags: normalizeTagList(toStringArray(payload.tags)),
    detailCards: sanitizeDetailCards(payload.detailCards)
  };
};

export const sanitizeFormulaStatus = (value: unknown): FormulaStatus =>
  value === 'pending' || value === 'ready' || value === 'failed' ? value : 'ready';

export const sanitizeFormulaSourceRef = (value: unknown): FormulaSourceRef | null => {
  if (!value || typeof value !== 'object') return null;
  const raw = value as Partial<FormulaSourceRef>;
  if (!raw.id || !raw.type || !raw.label) return null;
  if (!['solution-step', 'chat-message', 'manual', 'prompt'].includes(raw.type)) return null;
  return {
    id: String(raw.id),
    type: raw.type,
    label: String(raw.label),
    createdAt: typeof raw.createdAt === 'number' ? raw.createdAt : Date.now()
  };
};

export const sanitizeFormulaEntry = (value: unknown): FormulaEntry | null => {
  if (!value || typeof value !== 'object') return null;
  const raw = value as Partial<FormulaEntry>;
  if (!raw.id || typeof raw.formula !== 'string') return null;

  const normalizedFormula = normalizeFormulaLatex(raw.formula);
  if (!normalizedFormula) return null;

  const createdAt = typeof raw.createdAt === 'number' ? raw.createdAt : Date.now();
  const updatedAt = typeof raw.updatedAt === 'number' ? raw.updatedAt : createdAt;
  const payload = sanitizeFormulaPayload({
    formula: raw.formula,
    title: raw.title,
    shortExplanation: raw.shortExplanation,
    stepByStepExplanation: raw.stepByStepExplanation,
    examples: raw.examples,
    purpose: raw.purpose,
    tags: raw.tags
  });

  return {
    id: String(raw.id),
    formula: payload.formula,
    normalizedFormula: raw.normalizedFormula || normalizedFormula,
    title: payload.title,
    shortExplanation: payload.shortExplanation,
    stepByStepExplanation: payload.stepByStepExplanation,
    examples: payload.examples,
    purpose: payload.purpose,
    tags: payload.tags,
    usageCount: clampUsage(typeof raw.usageCount === 'number' ? raw.usageCount : 0),
    projectIds: normalizeProjectIds(toStringArray(raw.projectIds)),
    sourceRefs: (Array.isArray(raw.sourceRefs) ? raw.sourceRefs : [])
      .map((source) => sanitizeFormulaSourceRef(source))
      .filter((source): source is FormulaSourceRef => source !== null),
    status: sanitizeFormulaStatus(raw.status),
    generationError: typeof raw.generationError === 'string' ? raw.generationError : undefined,
    detailCards: sanitizeDetailCards(raw.detailCards),
    createdAt,
    updatedAt
  };
};

export const sanitizeFormulaList = (value: unknown): FormulaEntry[] => {
  if (!Array.isArray(value)) return [];

  const byNormalized = new Map<string, FormulaEntry>();
  for (const raw of value) {
    const entry = sanitizeFormulaEntry(raw);
    if (!entry) continue;
    const existing = byNormalized.get(entry.normalizedFormula);
    if (!existing || entry.updatedAt >= existing.updatedAt) {
      if (existing) {
        entry.sourceRefs = mergeSourceRefs(existing.sourceRefs, entry.sourceRefs);
        entry.projectIds = normalizeProjectIds([...existing.projectIds, ...entry.projectIds]);
        entry.usageCount = Math.max(existing.usageCount, entry.usageCount);
      }
      byNormalized.set(entry.normalizedFormula, entry);
    } else {
      existing.sourceRefs = mergeSourceRefs(existing.sourceRefs, entry.sourceRefs);
      existing.projectIds = normalizeProjectIds([...existing.projectIds, ...entry.projectIds]);
      existing.usageCount = Math.max(existing.usageCount, entry.usageCount);
    }
  }

  return Array.from(byNormalized.values()).sort((a, b) => b.updatedAt - a.updatedAt);
};

export const buildFormulaSearchText = (entry: FormulaEntry): string =>
  [
    entry.formula,
    entry.title,
    entry.shortExplanation,
    entry.stepByStepExplanation,
    entry.examples.join(' '),
    entry.purpose,
    entry.tags.join(' '),
    (entry.detailCards ?? [])
      .map((card) => [card.title, card.explanation, card.formulas.join(' ')].join(' '))
      .join(' ')
  ]
    .join(' ')
    .toLowerCase();
