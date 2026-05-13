import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  FormulaExtractionActionResult,
  FormulaExtractionCandidate,
  FormulaEntry,
  FormulaGenerationPayload,
  FormulaSourceRef,
  FormulaSourceType
} from '../types';
import {
  FormulaExtractionCandidateDraft,
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

interface PendingFormulaSelection {
  sourceLabel: string;
  contextText: string;
  projectId?: string | null;
  candidates: FormulaExtractionCandidate[];
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
    tags: normalizeTagList(payload.tags)
  };
};

const sortByUpdatedAt = (entries: FormulaEntry[]): FormulaEntry[] =>
  [...entries].sort((a, b) => b.updatedAt - a.updatedAt);

const createPromptPlaceholderFormula = (id: string): string => `\\text{Formel\\ wird\\ erstellt\\ (${id.slice(0, 8)})}`;

export const useFormulaCollection = () => {
  const [formulas, setFormulas] = useState<FormulaEntry[]>([]);
  const [pendingDuplicateDecision, setPendingDuplicateDecision] = useState<PendingDuplicateDecision | null>(null);
  const [pendingFormulaSelection, setPendingFormulaSelection] = useState<PendingFormulaSelection | null>(null);
  const duplicateQueueRef = useRef<PendingDuplicateDecision[]>([]);
  const inFlightGenerationRef = useRef<Set<string>>(new Set());
  const hasLoadedFromStorageRef = useRef(false);
  const hasSkippedFirstPersistRef = useRef(false);

  useEffect(() => {
    const raw = localStorage.getItem(FORMULA_COLLECTION_STORAGE_KEY);
    if (!raw) {
      hasLoadedFromStorageRef.current = true;
      return;
    }

    try {
      const parsed = JSON.parse(raw);
      setFormulas(sanitizeFormulaList(parsed));
    } catch (error) {
      console.error('Failed to parse formula collection', error);
    } finally {
      hasLoadedFromStorageRef.current = true;
    }
  }, []);

  useEffect(() => {
    // Prevent first render from overwriting stored formulas with [] before hydration finished.
    if (!hasLoadedFromStorageRef.current) return;
    if (!hasSkippedFirstPersistRef.current) {
      hasSkippedFirstPersistRef.current = true;
      return;
    }
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
                summary: sanitized.summary,
                tags: sanitized.tags,
                learningPath: sanitized.learningPath,
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
        (payload.summary.trim().length > 0 ||
          payload.tags.length > 0 ||
          payload.learningPath.length > 0);
      const status: FormulaEntry['status'] = autoGenerate && !hasPrefilledData ? 'pending' : 'ready';

      return {
        id: generateId(),
        formula: payload.formula,
        normalizedFormula,
        title: payload.title || 'Neue Formel',
        summary: payload.summary,
        tags: payload.tags,
        learningPath: payload.learningPath,
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
      const trimmedQuestion = question.trim();
      if (!trimmedQuestion) return { status: 'ignored' };

      const placeholderId = generateId();
      const now = Date.now();
      const sourceRef = createSourceRef(source);
      const placeholderEntry: FormulaEntry = {
        id: placeholderId,
        formula: createPromptPlaceholderFormula(placeholderId),
        normalizedFormula: `pending-${placeholderId}`,
        title: 'Formel wird erstellt...',
        summary: 'Die KI analysiert die Frage und erstellt den Lernpfad.',
        tags: [],
        learningPath: [],
        usageCount: 0,
        projectIds: normalizeProjectIds(projectId ? [projectId] : []),
        sourceRefs: [sourceRef],
        status: 'pending',
        generationError: undefined,
        createdAt: now,
        updatedAt: now
      };

      setFormulas((prev) => sortByUpdatedAt([placeholderEntry, ...prev]));

      try {
        const payload = await generateFormulaFromPrompt(trimmedQuestion);
        const sanitized = sanitizeIncomingPayload(payload.formula, payload);
        setFormulas((prev) =>
          sortByUpdatedAt(
            prev.map((entry) => {
              if (entry.id !== placeholderId) return entry;
              const normalized = normalizeFormulaLatex(sanitized.formula);
              return {
                ...entry,
                formula: sanitized.formula,
                normalizedFormula: normalized || entry.normalizedFormula,
                title: sanitized.title,
                summary: sanitized.summary,
                tags: sanitized.tags,
                learningPath: sanitized.learningPath,
                status: 'ready',
                generationError: undefined,
                updatedAt: Date.now()
              };
            })
          )
        );
      } catch (error: any) {
        const message = error?.message || 'Formel konnte nicht erstellt werden.';
        setFormulas((prev) =>
          sortByUpdatedAt(
            prev.map((entry) =>
              entry.id === placeholderId
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
      }

      return { status: 'added', entry: placeholderEntry };
    },
    []
  );

  const addFormulasFromChatMessage = useCallback(
    async (
      message: string,
      sourceLabel: string,
      projectId?: string | null
    ): Promise<FormulaExtractionActionResult> => {
      const extracted = await extractFormulasFromMessage(message);
      const candidates: FormulaExtractionCandidate[] = extracted
        .map((entry: FormulaExtractionCandidateDraft, index: number) => ({
          id: `${Date.now()}-${index}-${Math.random().toString(16).slice(2)}`,
          title: entry.title.trim() || `Formel ${index + 1}`,
          formula: entry.formula.trim()
        }))
        .filter((entry) => entry.formula.length > 0);

      if (candidates.length === 0) {
        setPendingFormulaSelection(null);
        return { added: 0, extracted: 0, requiresSelection: false };
      }

      setPendingFormulaSelection({
        sourceLabel,
        contextText: message,
        projectId,
        candidates
      });

      return { added: 0, extracted: candidates.length, requiresSelection: true };
    },
    []
  );

  const confirmPendingFormulaSelection = useCallback(
    async (selectedCandidateIds: string[]): Promise<FormulaExtractionActionResult & { selected: number }> => {
      const pending = pendingFormulaSelection;
      if (!pending) {
        return { added: 0, extracted: 0, selected: 0, requiresSelection: false };
      }

      const selectedIdSet = new Set(selectedCandidateIds);
      const selectedCandidates = pending.candidates.filter((entry) => selectedIdSet.has(entry.id));
      let added = 0;

      for (const candidate of selectedCandidates) {
        const result = await addFormulaFromLatex({
          formula: candidate.formula,
          source: {
            type: 'chat-message',
            label: pending.sourceLabel
          },
          projectId: pending.projectId,
          contextText: pending.contextText,
          prefilledPayload: {
            title: candidate.title
          }
        });
        if (result.status === 'added') {
          added += 1;
        }
      }

      setPendingFormulaSelection(null);
      return {
        added,
        extracted: pending.candidates.length,
        selected: selectedCandidates.length,
        requiresSelection: false
      };
    },
    [addFormulaFromLatex, pendingFormulaSelection]
  );

  const cancelPendingFormulaSelection = useCallback(() => {
    setPendingFormulaSelection(null);
  }, []);

  const clearAllTransientState = useCallback(() => {
    duplicateQueueRef.current = [];
    setPendingDuplicateDecision(null);
    setPendingFormulaSelection(null);
  }, []);

  const replaceAllFormulas = useCallback((incoming: FormulaEntry[]) => {
    setFormulas(sortByUpdatedAt(sanitizeFormulaList(incoming)));
    clearAllTransientState();
  }, [clearAllTransientState]);

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

  return {
    formulas,
    topUsedFormulas,
    pendingDuplicateDecision,
    pendingFormulaSelection,
    addFormulaFromLatex,
    addFormulaFromPrompt,
    addFormulasFromChatMessage,
    confirmPendingFormulaSelection,
    cancelPendingFormulaSelection,
    resolveDuplicateDecision,
    updateFormula,
    deleteFormula,
    incrementFormulaUsage,
    retryFormulaGeneration,
    replaceAllFormulas,
    removeProjectReference
  };
};
