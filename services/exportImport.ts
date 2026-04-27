import {
  HistoryItem,
  Project,
  PracticeRoom,
  PracticeTask,
  ExportData,
  ExamSession,
  ExamTask,
  FormulaEntry,
  FormulaSourceRef,
  HistoryStatus
} from '../types';
import {
  mergeSourceRefs,
  normalizeProjectIds,
  normalizeTagList,
  sanitizeFormulaList
} from './formulaCollection';

export const CURRENT_EXPORT_VERSION = 4;

export type ImportStrategy = 'replace' | 'merge' | 'skipConflicts';

export interface ValidationSuccess {
  success: true;
  data: ExportData;
}

export interface ValidationFailure {
  success: false;
  errors: string[];
}

export type ValidationResult = ValidationSuccess | ValidationFailure;

const computeStatistics = (
  history: HistoryItem[],
  projects: Project[],
  practiceRooms: PracticeRoom[],
  examSessions: ExamSession[],
  formulas: FormulaEntry[]
) => {
  let totalTasksCompleted = 0;
  let examTasksCompleted = 0;

  for (const room of practiceRooms) {
    for (const task of room.generatedTasks) {
      if (task.isCorrect) {
        totalTasksCompleted += 1;
      }
    }
  }

  for (const session of examSessions) {
    for (const task of session.tasks) {
      if (task.isCorrect !== undefined) {
        examTasksCompleted += 1;
      }
    }
  }

  const formulasUsageTotal = formulas.reduce((sum, formula) => sum + (formula.usageCount ?? 0), 0);

  return {
    historyCount: history.length,
    projectsCount: projects.length,
    practiceRoomsCount: practiceRooms.length,
    totalTasksCompleted,
    examSessionsCount: examSessions.length,
    examTasksCompleted,
    formulasCount: formulas.length,
    formulasUsageTotal
  };
};

export function buildExportData(
  history: HistoryItem[],
  projects: Project[],
  activeProjectId: string | null,
  practiceRooms: PracticeRoom[],
  examSessions: ExamSession[],
  formulas: FormulaEntry[]
): ExportData {
  return {
    version: CURRENT_EXPORT_VERSION,
    exportedAt: Date.now(),
    history,
    projects,
    activeProjectId,
    practiceRooms,
    examSessions,
    formulas,
    statistics: computeStatistics(history, projects, practiceRooms, examSessions, formulas)
  };
}

export function serializeExportData(data: ExportData): string {
  return JSON.stringify(data, null, 2);
}

export function parseAndValidateExport(json: string): ValidationResult {
  let raw: unknown;

  try {
    raw = JSON.parse(json);
  } catch {
    return {
      success: false,
      errors: ['Datei ist kein gueltiges JSON.']
    };
  }

  const errors: string[] = [];

  if (typeof raw !== 'object' || raw === null) {
    errors.push('Exportdaten haben ein ungueltiges Format.');
    return { success: false, errors };
  }

  const obj = raw as any;

  if (typeof obj.version !== 'number') {
    errors.push('Feld "version" fehlt oder ist ungueltig.');
  }

  if (typeof obj.exportedAt !== 'number') {
    errors.push('Feld "exportedAt" fehlt oder ist ungueltig.');
  }

  if (!Array.isArray(obj.history)) {
    errors.push('Feld "history" fehlt oder ist keine Liste.');
  }

  if (obj.projects !== undefined && !Array.isArray(obj.projects)) {
    errors.push('Feld "projects" ist ungueltig.');
  }

  if (obj.activeProjectId !== undefined && obj.activeProjectId !== null && typeof obj.activeProjectId !== 'string') {
    errors.push('Feld "activeProjectId" ist ungueltig.');
  }

  if (!Array.isArray(obj.practiceRooms)) {
    errors.push('Feld "practiceRooms" fehlt oder ist keine Liste.');
  }

  if (obj.examSessions !== undefined && !Array.isArray(obj.examSessions)) {
    errors.push('Feld "examSessions" ist ungueltig.');
  }

  if (obj.formulas !== undefined && !Array.isArray(obj.formulas)) {
    errors.push('Feld "formulas" ist ungueltig.');
  }

  if (typeof obj.statistics !== 'object' || obj.statistics === null) {
    errors.push('Feld "statistics" fehlt oder ist ungueltig.');
  } else {
    const stats = obj.statistics;
    if (typeof stats.historyCount !== 'number') {
      errors.push('statistics.historyCount ist ungueltig.');
    }
    if (stats.projectsCount !== undefined && typeof stats.projectsCount !== 'number') {
      errors.push('statistics.projectsCount ist ungueltig.');
    }
    if (typeof stats.practiceRoomsCount !== 'number') {
      errors.push('statistics.practiceRoomsCount ist ungueltig.');
    }
    if (typeof stats.totalTasksCompleted !== 'number') {
      errors.push('statistics.totalTasksCompleted ist ungueltig.');
    }
    if (stats.examSessionsCount !== undefined && typeof stats.examSessionsCount !== 'number') {
      errors.push('statistics.examSessionsCount ist ungueltig.');
    }
    if (stats.examTasksCompleted !== undefined && typeof stats.examTasksCompleted !== 'number') {
      errors.push('statistics.examTasksCompleted ist ungueltig.');
    }
    if (stats.formulasCount !== undefined && typeof stats.formulasCount !== 'number') {
      errors.push('statistics.formulasCount ist ungueltig.');
    }
    if (stats.formulasUsageTotal !== undefined && typeof stats.formulasUsageTotal !== 'number') {
      errors.push('statistics.formulasUsageTotal ist ungueltig.');
    }
  }

  if (errors.length) {
    return { success: false, errors };
  }

  const data: ExportData = {
    version: obj.version,
    exportedAt: obj.exportedAt,
    history: obj.history as HistoryItem[],
    projects: Array.isArray(obj.projects) ? (obj.projects as Project[]) : [],
    activeProjectId: typeof obj.activeProjectId === 'string' ? obj.activeProjectId : null,
    practiceRooms: obj.practiceRooms as PracticeRoom[],
    examSessions: Array.isArray(obj.examSessions) ? (obj.examSessions as ExamSession[]) : [],
    formulas: sanitizeFormulaList(Array.isArray(obj.formulas) ? obj.formulas : []),
    statistics: {
      historyCount: obj.statistics.historyCount,
      projectsCount: obj.statistics.projectsCount ?? (Array.isArray(obj.projects) ? obj.projects.length : 0),
      practiceRoomsCount: obj.statistics.practiceRoomsCount,
      totalTasksCompleted: obj.statistics.totalTasksCompleted,
      examSessionsCount: obj.statistics.examSessionsCount ?? (Array.isArray(obj.examSessions) ? obj.examSessions.length : 0),
      examTasksCompleted: obj.statistics.examTasksCompleted ?? 0,
      formulasCount: obj.statistics.formulasCount ?? (Array.isArray(obj.formulas) ? obj.formulas.length : 0),
      formulasUsageTotal: obj.statistics.formulasUsageTotal ?? 0
    }
  };

  return { success: true, data };
}

export function applyImportData(
  currentHistory: HistoryItem[],
  currentProjects: Project[],
  currentActiveProjectId: string | null,
  currentPracticeRooms: PracticeRoom[],
  currentExamSessions: ExamSession[],
  currentFormulas: FormulaEntry[],
  imported: ExportData,
  strategy: ImportStrategy
): {
  history: HistoryItem[];
  projects: Project[];
  activeProjectId: string | null;
  practiceRooms: PracticeRoom[];
  examSessions: ExamSession[];
  formulas: FormulaEntry[];
} {
  const importedProjects = imported.projects ?? [];
  const importedActiveProjectId = normalizeProjectId(imported.activeProjectId);

  if (strategy === 'replace') {
    const projects = importedProjects;
    const projectIds = new Set(projects.map((project) => project.id));
    const history = sanitizeHistoryProjectRefs(imported.history, projectIds);
    const practiceRooms = sanitizePracticeRoomProjectRefs(imported.practiceRooms, projectIds);
    const examSessions = sanitizeExamSessionProjectRefs(imported.examSessions ?? [], projectIds);
    const formulas = sanitizeFormulaProjectRefs(imported.formulas ?? [], projectIds);
    const activeProjectId =
      importedActiveProjectId && projectIds.has(importedActiveProjectId)
        ? importedActiveProjectId
        : null;

    return {
      history,
      projects,
      activeProjectId,
      practiceRooms,
      examSessions,
      formulas
    };
  }

  const projects = mergeById(
    currentProjects,
    importedProjects,
    mergeProject,
    strategy
  ).sort((a, b) => b.updatedAt - a.updatedAt);

  const projectIds = new Set(projects.map((project) => project.id));

  const history = mergeById(
    currentHistory,
    imported.history,
    mergeHistoryItem,
    strategy
  );

  const practiceRooms = mergeById(
    currentPracticeRooms,
    imported.practiceRooms,
    mergePracticeRoom,
    strategy
  );

  const examSessions = mergeById(
    currentExamSessions,
    imported.examSessions ?? [],
    mergeExamSession,
    strategy
  );

  const formulas = mergeFormulaEntries(
    currentFormulas ?? [],
    imported.formulas ?? [],
    strategy
  );

  const sanitizedHistory = sanitizeHistoryProjectRefs(history, projectIds).sort((a, b) => b.timestamp - a.timestamp);
  const sanitizedPracticeRooms = sanitizePracticeRoomProjectRefs(practiceRooms, projectIds).sort((a, b) => b.updatedAt - a.updatedAt);
  const sanitizedExamSessions = sanitizeExamSessionProjectRefs(examSessions, projectIds).sort(
    (a, b) => getExamActivityTime(b) - getExamActivityTime(a)
  );
  const sanitizedFormulas = sanitizeFormulaProjectRefs(formulas, projectIds).sort((a, b) => b.updatedAt - a.updatedAt);

  const currentCandidate = normalizeProjectId(currentActiveProjectId);
  const activeProjectId = importedActiveProjectId && projectIds.has(importedActiveProjectId)
    ? importedActiveProjectId
    : currentCandidate && projectIds.has(currentCandidate)
      ? currentCandidate
      : null;

  return {
    history: sanitizedHistory,
    projects,
    activeProjectId,
    practiceRooms: sanitizedPracticeRooms,
    examSessions: sanitizedExamSessions,
    formulas: sanitizedFormulas
  };
}

const HISTORY_STATUS_PRIORITY: Record<HistoryStatus, number> = {
  failed: 0,
  processing: 1,
  completed: 2
};

const EXAM_STATUS_PRIORITY: Record<ExamSession['status'], number> = {
  configuring: 0,
  running: 1,
  submitted: 2,
  evaluating: 3,
  completed: 4
};

const normalizeHistoryStatus = (item: HistoryItem): HistoryStatus => item.status ?? 'completed';

const normalizeHistoryProgress = (item: HistoryItem): number => {
  if (typeof item.progress === 'number') return item.progress;
  return normalizeHistoryStatus(item) === 'completed' ? 100 : 0;
};

const normalizeProjectId = (value: unknown): string | undefined =>
  typeof value === 'string' && value.trim() !== '' ? value : undefined;

const normalizeLinkedProjectId = (value: unknown, knownProjectIds: Set<string>): string | undefined => {
  const normalized = normalizeProjectId(value);
  if (!normalized) return undefined;
  return knownProjectIds.has(normalized) ? normalized : undefined;
};

const sanitizeHistoryProjectRefs = (items: HistoryItem[], knownProjectIds: Set<string>): HistoryItem[] =>
  items.map((item) => {
    const projectId = normalizeLinkedProjectId(item.projectId, knownProjectIds);
    if (projectId) {
      if (item.projectId === projectId) return item;
      return { ...item, projectId };
    }
    if (item.projectId === undefined) return item;
    const cloned: HistoryItem = { ...item };
    delete cloned.projectId;
    return cloned;
  });

const sanitizePracticeRoomProjectRefs = (rooms: PracticeRoom[], knownProjectIds: Set<string>): PracticeRoom[] =>
  rooms.map((room) => {
    const projectId = normalizeLinkedProjectId(room.projectId, knownProjectIds);
    if (projectId) {
      if (room.projectId === projectId) return room;
      return { ...room, projectId };
    }
    if (room.projectId === undefined) return room;
    const cloned: PracticeRoom = { ...room };
    delete cloned.projectId;
    return cloned;
  });

const sanitizeExamSessionProjectRefs = (sessions: ExamSession[], knownProjectIds: Set<string>): ExamSession[] =>
  sessions.map((session) => {
    const projectId = normalizeLinkedProjectId(session.projectId, knownProjectIds);
    if (projectId) {
      if (session.projectId === projectId) return session;
      return { ...session, projectId };
    }
    if (session.projectId === undefined) return session;
    const cloned: ExamSession = { ...session };
    delete cloned.projectId;
    return cloned;
  });

const sanitizeFormulaProjectRefs = (formulas: FormulaEntry[], knownProjectIds: Set<string>): FormulaEntry[] =>
  sanitizeFormulaList(formulas).map((formula) => ({
    ...formula,
    projectIds: formula.projectIds.filter((projectId) => knownProjectIds.has(projectId))
  }));

const maxDefined = (...values: Array<number | undefined>): number | undefined =>
  values.reduce<number | undefined>(
    (best, value) => (value === undefined ? best : best === undefined ? value : Math.max(best, value)),
    undefined
  );

const minDefined = (...values: Array<number | undefined>): number | undefined =>
  values.reduce<number | undefined>(
    (best, value) => (value === undefined ? best : best === undefined ? value : Math.min(best, value)),
    undefined
  );

const mergeById = <T extends { id: string }>(
  current: T[],
  incoming: T[],
  resolver: (currentItem: T, incomingItem: T) => T,
  strategy: ImportStrategy
): T[] => {
  const result = new Map<string, T>();

  for (const item of current) {
    result.set(item.id, item);
  }

  for (const item of incoming) {
    const existing = result.get(item.id);
    if (!existing) {
      result.set(item.id, item);
      continue;
    }

    if (strategy === 'skipConflicts') {
      continue;
    }

    result.set(item.id, resolver(existing, item));
  }

  return Array.from(result.values());
};

const mergeProject = (current: Project, incoming: Project): Project => {
  const preferIncoming = incoming.updatedAt >= current.updatedAt;
  const preferred = preferIncoming ? incoming : current;
  const fallback = preferIncoming ? current : incoming;

  return {
    ...fallback,
    ...preferred,
    name: (preferred.name || fallback.name || 'Projekt').trim(),
    description: (preferred.description ?? fallback.description ?? '').trim(),
    color: preferred.color || fallback.color || '#4f46e5',
    createdAt: minDefined(current.createdAt, incoming.createdAt) ?? preferred.createdAt ?? fallback.createdAt ?? Date.now(),
    updatedAt: maxDefined(current.updatedAt, incoming.updatedAt) ?? preferred.updatedAt ?? fallback.updatedAt ?? Date.now()
  };
};

const mergeHistoryItem = (current: HistoryItem, incoming: HistoryItem): HistoryItem => {
  const currentStatus = normalizeHistoryStatus(current);
  const incomingStatus = normalizeHistoryStatus(incoming);
  const currentPriority = HISTORY_STATUS_PRIORITY[currentStatus];
  const incomingPriority = HISTORY_STATUS_PRIORITY[incomingStatus];

  if (incomingPriority !== currentPriority) {
    return incomingPriority > currentPriority ? incoming : current;
  }

  const currentProgress = normalizeHistoryProgress(current);
  const incomingProgress = normalizeHistoryProgress(incoming);
  if (incomingProgress !== currentProgress) {
    return incomingProgress > currentProgress ? incoming : current;
  }

  return incoming.timestamp >= current.timestamp ? incoming : current;
};

const mergeTextLists = (primary: string[], secondary: string[]): string[] => {
  const seen = new Set<string>();
  const result: string[] = [];

  for (const entry of [...primary, ...secondary]) {
    const normalized = entry.trim();
    if (!normalized) continue;
    if (seen.has(normalized)) continue;
    seen.add(normalized);
    result.push(normalized);
  }

  return result;
};

const mergePracticeTask = (current: PracticeTask, incoming: PracticeTask): PracticeTask => {
  const newer = incoming.timestamp >= current.timestamp ? incoming : current;
  const older = newer === incoming ? current : incoming;

  return {
    ...older,
    ...newer,
    userSolution: newer.userSolution ?? older.userSolution,
    userSolutionImage: newer.userSolutionImage ?? older.userSolutionImage,
    isCorrect: newer.isCorrect ?? older.isCorrect,
    aiFeedback: newer.aiFeedback ?? older.aiFeedback,
    fullSolution: newer.fullSolution ?? older.fullSolution,
    additionalPrompt: newer.additionalPrompt ?? older.additionalPrompt,
    timestamp: Math.max(current.timestamp, incoming.timestamp)
  };
};

const mergePracticeRoom = (current: PracticeRoom, incoming: PracticeRoom): PracticeRoom => {
  const preferIncoming = incoming.updatedAt >= current.updatedAt;
  const preferred = preferIncoming ? incoming : current;
  const fallback = preferIncoming ? current : incoming;

  const generatedTasks = mergeById(
    current.generatedTasks ?? [],
    incoming.generatedTasks ?? [],
    mergePracticeTask,
    'merge'
  ).sort((a, b) => a.timestamp - b.timestamp);

  return {
    ...fallback,
    ...preferred,
    projectId: normalizeProjectId(preferred.projectId) ?? normalizeProjectId(fallback.projectId),
    topic: preferred.topic || fallback.topic,
    description: preferred.description || fallback.description,
    difficulty: preferred.difficulty || fallback.difficulty,
    exampleTasks: mergeTextLists(preferred.exampleTasks ?? [], fallback.exampleTasks ?? []),
    generatedTasks,
    createdAt: minDefined(current.createdAt, incoming.createdAt) ?? preferred.createdAt ?? fallback.createdAt,
    updatedAt: maxDefined(current.updatedAt, incoming.updatedAt) ?? preferred.updatedAt ?? fallback.updatedAt
  };
};

const mergeExamTask = (current: ExamTask, incoming: ExamTask): ExamTask => {
  const newer = incoming.timestamp >= current.timestamp ? incoming : current;
  const older = newer === incoming ? current : incoming;

  return {
    ...older,
    ...newer,
    order: newer.order ?? older.order,
    taskText: newer.taskText || older.taskText,
    userSolution: newer.userSolution ?? older.userSolution,
    userSolutionImage: newer.userSolutionImage ?? older.userSolutionImage,
    isCorrect: newer.isCorrect ?? older.isCorrect,
    aiFeedback: newer.aiFeedback ?? older.aiFeedback,
    fullSolution: newer.fullSolution ?? older.fullSolution,
    evaluationError: newer.evaluationError ?? older.evaluationError,
    timestamp: Math.max(current.timestamp, incoming.timestamp)
  };
};

const getExamActivityTime = (session: ExamSession): number =>
  session.completedAt ?? session.submittedAt ?? session.startedAt ?? session.createdAt;

const mergeExamSession = (current: ExamSession, incoming: ExamSession): ExamSession => {
  const currentPriority = EXAM_STATUS_PRIORITY[current.status];
  const incomingPriority = EXAM_STATUS_PRIORITY[incoming.status];

  const preferIncoming =
    incomingPriority > currentPriority ||
    (incomingPriority === currentPriority && getExamActivityTime(incoming) >= getExamActivityTime(current));

  const preferred = preferIncoming ? incoming : current;
  const fallback = preferIncoming ? current : incoming;

  const tasks = mergeById(
    current.tasks ?? [],
    incoming.tasks ?? [],
    mergeExamTask,
    'merge'
  ).sort((a, b) => {
    if (a.order !== b.order) return a.order - b.order;
    return a.timestamp - b.timestamp;
  });

  const merged: ExamSession = {
    ...fallback,
    ...preferred,
    projectId: normalizeProjectId(preferred.projectId) ?? normalizeProjectId(fallback.projectId),
    topic: preferred.topic || fallback.topic,
    difficulty: preferred.difficulty || fallback.difficulty,
    taskCount: Math.max(preferred.taskCount ?? 0, fallback.taskCount ?? 0, tasks.length),
    durationMinutes: preferred.durationMinutes || fallback.durationMinutes,
    status: preferred.status,
    tasks,
    createdAt: minDefined(current.createdAt, incoming.createdAt) ?? preferred.createdAt ?? fallback.createdAt,
    startedAt: maxDefined(current.startedAt, incoming.startedAt) ?? preferred.startedAt ?? fallback.startedAt,
    endsAt: maxDefined(current.endsAt, incoming.endsAt) ?? preferred.endsAt ?? fallback.endsAt,
    submittedAt: maxDefined(current.submittedAt, incoming.submittedAt),
    completedAt: maxDefined(current.completedAt, incoming.completedAt),
    remainingSeconds: preferred.remainingSeconds ?? fallback.remainingSeconds,
    submitReason: preferred.submitReason ?? fallback.submitReason,
    scorePercent: preferred.scorePercent ?? fallback.scorePercent,
    correctCount: preferred.correctCount ?? fallback.correctCount,
    wrongCount: preferred.wrongCount ?? fallback.wrongCount,
    feedbackSummary: preferred.feedbackSummary ?? fallback.feedbackSummary
  };

  if (merged.status === 'completed') {
    const evaluableTasks = merged.tasks.filter(task => task.isCorrect !== undefined);
    const correctCount = evaluableTasks.filter(task => task.isCorrect === true).length;
    const wrongCount = Math.max(0, evaluableTasks.length - correctCount);

    if (merged.correctCount === undefined) merged.correctCount = correctCount;
    if (merged.wrongCount === undefined) merged.wrongCount = wrongCount;
    if (merged.scorePercent === undefined) {
      merged.scorePercent = evaluableTasks.length > 0 ? Math.round((correctCount / evaluableTasks.length) * 100) : 0;
    }
  }

  return merged;
};

const mergeFormulaEntry = (current: FormulaEntry, incoming: FormulaEntry): FormulaEntry => {
  const preferIncoming = incoming.updatedAt >= current.updatedAt;
  const preferred = preferIncoming ? incoming : current;
  const fallback = preferIncoming ? current : incoming;
  const statusRank: Record<FormulaEntry['status'], number> = { failed: 0, pending: 1, ready: 2 };
  const status = statusRank[incoming.status] >= statusRank[current.status] ? incoming.status : current.status;
  const generationError =
    status === 'failed'
      ? incoming.generationError || current.generationError
      : undefined;
  const preferredLearningPath =
    Array.isArray(preferred.learningPath) && preferred.learningPath.length > 0
      ? preferred.learningPath
      : undefined;
  const fallbackLearningPath =
    Array.isArray(fallback.learningPath) && fallback.learningPath.length > 0
      ? fallback.learningPath
      : undefined;

  return {
    ...fallback,
    ...preferred,
    formula: preferred.formula || fallback.formula,
    normalizedFormula: preferred.normalizedFormula || fallback.normalizedFormula,
    title: preferred.title || fallback.title,
    summary: preferred.summary || fallback.summary,
    tags: normalizeTagList([...(preferred.tags ?? []), ...(fallback.tags ?? [])]),
    projectIds: normalizeProjectIds([...(preferred.projectIds ?? []), ...(fallback.projectIds ?? [])]),
    sourceRefs: mergeSourceRefs(
      (current.sourceRefs ?? []) as FormulaSourceRef[],
      (incoming.sourceRefs ?? []) as FormulaSourceRef[]
    ),
    learningPath: preferredLearningPath ?? fallbackLearningPath ?? [],
    usageCount: Math.max(current.usageCount ?? 0, incoming.usageCount ?? 0),
    status,
    generationError,
    createdAt: minDefined(current.createdAt, incoming.createdAt) ?? preferred.createdAt ?? fallback.createdAt,
    updatedAt: maxDefined(current.updatedAt, incoming.updatedAt) ?? preferred.updatedAt ?? fallback.updatedAt
  };
};

const mergeFormulaEntries = (
  current: FormulaEntry[],
  incoming: FormulaEntry[],
  strategy: ImportStrategy
): FormulaEntry[] => {
  const currentSanitized = sanitizeFormulaList(current);
  const incomingSanitized = sanitizeFormulaList(incoming);
  const byNormalized = new Map<string, FormulaEntry>();

  for (const entry of currentSanitized) {
    byNormalized.set(entry.normalizedFormula, entry);
  }

  for (const incomingEntry of incomingSanitized) {
    const existing = byNormalized.get(incomingEntry.normalizedFormula);
    if (!existing) {
      byNormalized.set(incomingEntry.normalizedFormula, incomingEntry);
      continue;
    }

    if (strategy === 'skipConflicts') continue;
    byNormalized.set(incomingEntry.normalizedFormula, mergeFormulaEntry(existing, incomingEntry));
  }

  return Array.from(byNormalized.values());
};
