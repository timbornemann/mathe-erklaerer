import {
  FormulaEntry,
  FormulaGenerationPayload,
  FormulaLesson,
  FormulaLessonCard,
  FormulaSourceRef,
  FormulaStatus
} from '../types';

export const FORMULA_COLLECTION_STORAGE_KEY = 'mathFormulaCollection.v2';

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

const sanitizeLessonCard = (value: unknown): FormulaLessonCard | null => {
  if (!value || typeof value !== 'object') return null;
  const raw = value as Record<string, unknown>;
  const title = typeof raw.title === 'string' ? raw.title.trim() : '';
  const explanation = typeof raw.explanation === 'string' ? raw.explanation.trim() : '';
  const formulas = toStringArray(raw.formulas);
  if (!title && !explanation && formulas.length === 0) return null;
  return { title, explanation, formulas };
};

const sanitizeLesson = (value: unknown): FormulaLesson | null => {
  if (!value || typeof value !== 'object') return null;
  const raw = value as Record<string, unknown>;
  const cards = Array.isArray(raw.cards)
    ? raw.cards.map((card) => sanitizeLessonCard(card)).filter((card): card is FormulaLessonCard => card !== null)
    : [];
  const title = typeof raw.title === 'string' ? raw.title.trim() : '';
  const goal = typeof raw.goal === 'string' ? raw.goal.trim() : '';
  const takeaway = typeof raw.takeaway === 'string' ? raw.takeaway.trim() : '';
  if (!title && !goal && !takeaway && cards.length === 0) return null;
  return {
    title: title || 'Lektion',
    goal,
    cards: cards.length > 0 ? cards : [{ title: 'Kernidee', explanation: goal || takeaway || '', formulas: [] }],
    takeaway
  };
};

const buildLegacyCards = (raw: Record<string, unknown>): FormulaLessonCard[] => {
  const cards: FormulaLessonCard[] = [];
  const shortExplanation = typeof raw.shortExplanation === 'string' ? raw.shortExplanation.trim() : '';
  if (shortExplanation) {
    cards.push({ title: 'Ueberblick', explanation: shortExplanation, formulas: [] });
  }

  const stepByStepExplanation = typeof raw.stepByStepExplanation === 'string' ? raw.stepByStepExplanation.trim() : '';
  if (stepByStepExplanation) {
    cards.push({ title: 'Rechenweg', explanation: stepByStepExplanation, formulas: [] });
  }

  const purpose = typeof raw.purpose === 'string' ? raw.purpose.trim() : '';
  if (purpose) {
    cards.push({ title: 'Verwendung', explanation: purpose, formulas: [] });
  }

  const examples = toStringArray(raw.examples);
  if (examples.length > 0) {
    cards.push({
      title: 'Beispiele',
      explanation: examples.map((example, index) => `${index + 1}. ${example}`).join('\n'),
      formulas: []
    });
  }

  return cards;
};

const buildLegacyLearningPath = (raw: Record<string, unknown>): FormulaLesson[] => {
  const lessons = Array.isArray(raw.detailCards)
    ? raw.detailCards
        .map((detailCard) => sanitizeLessonCard(detailCard))
        .filter((card): card is FormulaLessonCard => card !== null)
        .map((card) => ({
          title: card.title || 'Lektion',
          goal: '',
          cards: [card],
          takeaway: ''
        }))
    : [];

  if (lessons.length > 0) return lessons;

  const legacyCards = buildLegacyCards(raw);
  if (legacyCards.length === 0) return [];
  return [
    {
      title: 'Grundlagen',
      goal: '',
      cards: legacyCards,
      takeaway: ''
    }
  ];
};

const buildSummaryFromLearningPath = (learningPath: FormulaLesson[]): string => {
  if (learningPath.length === 0) return '';
  const firstLesson = learningPath[0];
  const firstCard = firstLesson.cards[0];
  return (
    firstLesson.goal ||
    firstCard?.explanation ||
    firstLesson.takeaway ||
    ''
  ).trim();
};

export const buildFallbackFormulaPayload = (formula: string): FormulaGenerationPayload => ({
  formula,
  title: 'Neue Formel',
  summary: '',
  tags: [],
  learningPath: []
});

export const sanitizeFormulaPayload = (
  payload: Partial<FormulaGenerationPayload> & { formula: string }
): FormulaGenerationPayload => {
  const legacyRaw = payload as unknown as Record<string, unknown>;
  const fallback = buildFallbackFormulaPayload(payload.formula);
  const learningPath =
    (Array.isArray(payload.learningPath)
      ? payload.learningPath
          .map((lesson) => sanitizeLesson(lesson))
          .filter((lesson): lesson is FormulaLesson => lesson !== null)
      : buildLegacyLearningPath(legacyRaw)) ?? [];
  const summaryCandidate =
    typeof payload.summary === 'string'
      ? payload.summary
      : typeof legacyRaw.shortExplanation === 'string'
      ? legacyRaw.shortExplanation
      : '';

  return {
    formula: trimOrFallback(payload.formula, fallback.formula),
    title: trimOrFallback(payload.title, fallback.title),
    summary: trimOrFallback(summaryCandidate, buildSummaryFromLearningPath(learningPath)),
    tags: normalizeTagList(toStringArray(payload.tags)),
    learningPath
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
  const raw = value as Partial<FormulaEntry> & Record<string, unknown>;
  if (!raw.id || typeof raw.formula !== 'string') return null;

  const normalizedFormula = normalizeFormulaLatex(raw.formula);
  if (!normalizedFormula) return null;

  const createdAt = typeof raw.createdAt === 'number' ? raw.createdAt : Date.now();
  const updatedAt = typeof raw.updatedAt === 'number' ? raw.updatedAt : createdAt;
  const payload = sanitizeFormulaPayload({
    formula: raw.formula,
    title: raw.title,
    summary: raw.summary,
    tags: raw.tags,
    learningPath: raw.learningPath,
    shortExplanation: raw.shortExplanation,
    stepByStepExplanation: raw.stepByStepExplanation,
    examples: raw.examples,
    purpose: raw.purpose,
    detailCards: raw.detailCards
  } as Partial<FormulaGenerationPayload> & { formula: string });

  return {
    id: String(raw.id),
    formula: payload.formula,
    normalizedFormula: raw.normalizedFormula || normalizedFormula,
    title: payload.title,
    summary: payload.summary,
    tags: payload.tags,
    learningPath: payload.learningPath,
    usageCount: clampUsage(typeof raw.usageCount === 'number' ? raw.usageCount : 0),
    projectIds: normalizeProjectIds(toStringArray(raw.projectIds)),
    sourceRefs: (Array.isArray(raw.sourceRefs) ? raw.sourceRefs : [])
      .map((source) => sanitizeFormulaSourceRef(source))
      .filter((source): source is FormulaSourceRef => source !== null),
    status: sanitizeFormulaStatus(raw.status),
    generationError: typeof raw.generationError === 'string' ? raw.generationError : undefined,
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
    entry.summary,
    entry.tags.join(' '),
    entry.learningPath
      .map((lesson) =>
        [
          lesson.title,
          lesson.goal,
          lesson.takeaway,
          lesson.cards
            .map((card) => [card.title, card.explanation, card.formulas.join(' ')].join(' '))
            .join(' ')
        ].join(' ')
      )
      .join(' ')
  ]
    .join(' ')
    .toLowerCase();
