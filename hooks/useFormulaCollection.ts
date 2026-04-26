import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  FormulaEntry,
  FormulaGenerationPayload,
  FormulaSourceRef,
  FormulaSourceType
} from '../types';
import {
  extractFormulasFromMessage,
  generateFormulaFromLatex,
  generateFormulaFromPrompt
} from '../services/gemini';
import {
  FORMULA_COLLECTION_STORAGE_KEY,
  mergeSourceRefs,
  normalizeFormulaLatex,
  normalizeProjectIds,
  normalizeTagList,
  sanitizeFormulaList,
  sanitizeFormulaPayload
} from '../services/formulaCollection';

type DuplicateChoice = 'merge' | 'create' | 'cancel';

interface FormulaSourceInput {
  type: FormulaSourceType;
  label: string;
  id?: string;
}

interface AddFormulaOptions {
  formula: string;
  source: FormulaSourceInput;
  projectId?: string | null;
  contextText?: string;
  autoGenerate?: boolean;
  prefilledPayload?: Partial<FormulaGenerationPayload>;
  skipDuplicatePrompt?: boolean;
}

interface PendingDuplicateDecision {
  incoming: AddFormulaOptions;
  matches: FormulaEntry[];
}

interface AddFormulaResult {
  status: 'added' | 'duplicate' | 'ignored';
  entry?: FormulaEntry;
}

const generateId = (): string => {
  if (typeof globalThis.crypto?.randomUUID === 'function') {
    return globalThis.crypto.randomUUID();
  }

  return `id-${Date.now()}-${Math.random().toString(16).slice(2)}`;
};

const createSourceRef = (source: FormulaSourceInput): FormulaSourceRef => ({
  id: source.id?.trim() || generateId(),
  type: source.type,
  label: source.label.trim() || 'Unbekannte Quelle',
  createdAt: Date.now()
});

const sanitizeIncomingPayload = (
  formula: string,
  prefilledPayload?: Partial<FormulaGenerationPayload>
): FormulaGenerationPayload => {
  const payload = sanitizeFormulaPayload({
    formula,
    ...prefilledPayload
  });
  return {
    ...payload,
    tags: normalizeTagList(payload.tags),
    examples: payload.examples
  };
};

const sortByUpdatedAt = (entries: FormulaEntry[]): FormulaEntry[] =>
  [...entries].sort((a, b) => b.updatedAt - a.updatedAt);

export const useFormulaCollection = () => {
  const [formulas, setFormulas] = useState<FormulaEntry[]>([]);
  const [pendingDuplicateDecision, setPendingDuplicateDecision] = useState<PendingDuplicateDecision | null>(null);
  const duplicateQueueRef = useRef<PendingDuplicateDecision[]>([]);
  const inFlightGenerationRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    const raw = localStorage.getItem(FORMULA_COLLECTION_STORAGE_KEY);
    if (!raw) return;

    try {
      const parsed = JSON.parse(raw);
      setFormulas(sanitizeFormulaList(parsed));
    } catch (error) {
      console.error('Failed to parse formula collection', error);
    }
  }, []);

  useEffect(() => {
    localStorage.setItem(FORMULA_COLLECTION_STORAGE_KEY, JSON.stringify(formulas));
  }, [formulas]);

  const pushOrOpenDuplicateDecision = useCallback((decision: PendingDuplicateDecision) => {
    setPendingDuplicateDecision((current) => {
      if (!current) {
        return decision;
      }
      duplicateQueueRef.current.push(decision);
      return current;
    });
  }, []);

  const openNextDuplicateDecision = useCallback(() => {
    const next = duplicateQueueRef.current.shift() || null;
    setPendingDuplicateDecision(next);
  }, []);

  const runBackgroundGeneration = useCallback(
    async (entryId: string, formula: string, contextText?: string) => {
      if (inFlightGenerationRef.current.has(entryId)) return;
      inFlightGenerationRef.current.add(entryId);

      try {
        const payload = await generateFormulaFromLatex(formula, contextText);
        setFormulas((prev) =>
          sortByUpdatedAt(
            prev.map((entry) => {
              if (entry.id !== entryId) return entry;
              const sanitized = sanitizeIncomingPayload(formula, payload);
              return {
                ...entry,
                formula: sanitized.formula,
                normalizedFormula: normalizeFormulaLatex(sanitized.formula),
                title: sanitized.title,
                shortExplanation: sanitized.shortExplanation,
                stepByStepExplanation: sanitized.stepByStepExplanation,
                examples: sanitized.examples,
                purpose: sanitized.purpose,
                tags: sanitized.tags,
                detailCards: sanitized.detailCards,
                status: 'ready',
                generationError: undefined,
                updatedAt: Date.now()
              };
            })
          )
        );
      } catch (error: any) {
        const message = error?.message || 'Formelinformationen konnten nicht erstellt werden.';
        setFormulas((prev) =>
          sortByUpdatedAt(
            prev.map((entry) =>
              entry.id === entryId
                ? {
                    ...entry,
                    status: 'failed',
                    generationError: message,
                    updatedAt: Date.now()
                  }
                : entry
            )
          )
        );
      } finally {
        inFlightGenerationRef.current.delete(entryId);
      }
    },
    []
  );

  const createFormulaEntry = useCallback(
    (options: AddFormulaOptions): FormulaEntry | null => {
      const normalizedFormula = normalizeFormulaLatex(options.formula);
      if (!normalizedFormula) return null;

      const sourceRef = createSourceRef(options.source);
      const payload = sanitizeIncomingPayload(options.formula, options.prefilledPayload);
      const now = Date.now();
      const autoGenerate = options.autoGenerate ?? true;
      const hasPrefilledData =
        payload.title.trim().length > 0 &&
        (payload.shortExplanation.trim().length > 0 ||
          payload.stepByStepExplanation.trim().length > 0 ||
          payload.examples.length > 0 ||
          payload.purpose.trim().length > 0 ||
          payload.tags.length > 0 ||
          (payload.detailCards?.length ?? 0) > 0);
      const status: FormulaEntry['status'] = autoGenerate && !hasPrefilledData ? 'pending' : 'ready';

      return {
        id: generateId(),
        formula: payload.formula,
        normalizedFormula,
        title: payload.title || 'Neue Formel',
        shortExplanation: payload.shortExplanation,
        stepByStepExplanation: payload.stepByStepExplanation,
        examples: payload.examples,
        purpose: payload.purpose,
        tags: payload.tags,
        detailCards: payload.detailCards,
        usageCount: 0,
        projectIds: normalizeProjectIds(options.projectId ? [options.projectId] : []),
        sourceRefs: [sourceRef],
        status,
        generationError: undefined,
        createdAt: now,
        updatedAt: now
      };
    },
    []
  );

  const addFormulaFromLatex = useCallback(
    async (options: AddFormulaOptions): Promise<AddFormulaResult> => {
      const normalizedFormula = normalizeFormulaLatex(options.formula);
      if (!normalizedFormula) return { status: 'ignored' };

      const duplicateMatches = formulas
        .filter((entry) => entry.normalizedFormula === normalizedFormula)
        .sort((a, b) => b.updatedAt - a.updatedAt);

      if (duplicateMatches.length > 0 && !options.skipDuplicatePrompt) {
        pushOrOpenDuplicateDecision({
          incoming: options,
          matches: duplicateMatches
        });
        return { status: 'duplicate' };
      }

      const entry = createFormulaEntry(options);
      if (!entry) return { status: 'ignored' };

      setFormulas((prev) => sortByUpdatedAt([entry, ...prev]));

      if (entry.status === 'pending') {
        void runBackgroundGeneration(entry.id, entry.formula, options.contextText);
      }

      return { status: 'added', entry };
    },
    [createFormulaEntry, formulas, pushOrOpenDuplicateDecision, runBackgroundGeneration]
  );

  const addFormulaFromPrompt = useCallback(
    async (question: string, source: FormulaSourceInput, projectId?: string | null): Promise<AddFormulaResult> => {
      const payload = await generateFormulaFromPrompt(question);
      return addFormulaFromLatex({
        formula: payload.formula,
        source,
        projectId,
        autoGenerate: false,
        prefilledPayload: payload
      });
    },
    [addFormulaFromLatex]
  );

  const addFormulasFromChatMessage = useCallback(
    async (
      message: string,
      sourceLabel: string,
      projectId?: string | null
    ): Promise<{ added: number; extracted: number }> => {
      const extracted = await extractFormulasFromMessage(message);
      let added = 0;

      for (const formula of extracted) {
        const result = await addFormulaFromLatex({
          formula,
          source: {
            type: 'chat-message',
            label: sourceLabel
          },
          projectId,
          contextText: message
        });
        if (result.status === 'added') {
          added += 1;
        }
      }

      return { added, extracted: extracted.length };
    },
    [addFormulaFromLatex]
  );

  const resolveDuplicateDecision = useCallback(
    async (choice: DuplicateChoice) => {
      const decision = pendingDuplicateDecision;
      if (!decision) return;

      if (choice === 'merge') {
        const target = decision.matches[0];
        if (target) {
          const sourceRef = createSourceRef(decision.incoming.source);
          setFormulas((prev) =>
            sortByUpdatedAt(
              prev.map((entry) => {
                if (entry.id !== target.id) return entry;
                return {
                  ...entry,
                  projectIds: normalizeProjectIds([
                    ...entry.projectIds,
                    ...(decision.incoming.projectId ? [decision.incoming.projectId] : [])
                  ]),
                  sourceRefs: mergeSourceRefs(entry.sourceRefs, [sourceRef]),
                  updatedAt: Date.now()
                };
              })
            )
          );
        }
      } else if (choice === 'create') {
        await addFormulaFromLatex({
          ...decision.incoming,
          skipDuplicatePrompt: true
        });
      }

      openNextDuplicateDecision();
    },
    [addFormulaFromLatex, openNextDuplicateDecision, pendingDuplicateDecision]
  );

  const updateFormula = useCallback((formulaId: string, updates: Partial<FormulaEntry>) => {
    setFormulas((prev) =>
      sortByUpdatedAt(
        prev.map((entry) => {
          if (entry.id !== formulaId) return entry;
          const nextFormula = typeof updates.formula === 'string' ? updates.formula : entry.formula;
          const normalized = normalizeFormulaLatex(nextFormula);
          return {
            ...entry,
            ...updates,
            formula: nextFormula,
            normalizedFormula: normalized || entry.normalizedFormula,
            tags: updates.tags ? normalizeTagList(updates.tags) : entry.tags,
            projectIds: updates.projectIds ? normalizeProjectIds(updates.projectIds) : entry.projectIds,
            updatedAt: Date.now()
          };
        })
      )
    );
  }, []);

  const deleteFormula = useCallback((formulaId: string) => {
    setFormulas((prev) => prev.filter((entry) => entry.id !== formulaId));
  }, []);

  const incrementFormulaUsage = useCallback((formulaId: string) => {
    setFormulas((prev) =>
      sortByUpdatedAt(
        prev.map((entry) =>
          entry.id === formulaId
            ? {
                ...entry,
                usageCount: entry.usageCount + 1,
                updatedAt: Date.now()
              }
            : entry
        )
      )
    );
  }, []);

  const retryFormulaGeneration = useCallback(
    async (formulaId: string) => {
      const target = formulas.find((entry) => entry.id === formulaId);
      if (!target) return;
      setFormulas((prev) =>
        prev.map((entry) =>
          entry.id === formulaId
            ? {
                ...entry,
                status: 'pending',
                generationError: undefined,
                updatedAt: Date.now()
              }
            : entry
        )
      );
      await runBackgroundGeneration(formulaId, target.formula);
    },
    [formulas, runBackgroundGeneration]
  );

  const replaceAllFormulas = useCallback((incoming: FormulaEntry[]) => {
    setFormulas(sortByUpdatedAt(sanitizeFormulaList(incoming)));
    duplicateQueueRef.current = [];
    setPendingDuplicateDecision(null);
  }, []);

  const removeProjectReference = useCallback((projectId: string) => {
    if (!projectId) return;
    setFormulas((prev) =>
      prev.map((entry) => {
        if (!entry.projectIds.includes(projectId)) return entry;
        return {
          ...entry,
          projectIds: entry.projectIds.filter((id) => id !== projectId),
          updatedAt: Date.now()
        };
      })
    );
  }, []);

  const topUsedFormulas = useMemo(
    () => [...formulas].sort((a, b) => b.usageCount - a.usageCount || b.updatedAt - a.updatedAt).slice(0, 12),
    [formulas]
  );

  return {
    formulas,
    topUsedFormulas,
    pendingDuplicateDecision,
    addFormulaFromLatex,
    addFormulaFromPrompt,
    addFormulasFromChatMessage,
    resolveDuplicateDecision,
    updateFormula,
    deleteFormula,
    incrementFormulaUsage,
    retryFormulaGeneration,
    replaceAllFormulas,
    removeProjectReference
  };
};
