import {
  HistoryItem,
  PracticeRoom,
  PracticeTask,
  ExportData,
  ExamSession,
  ExamTask,
  HistoryStatus
} from '../types';

export const CURRENT_EXPORT_VERSION = 1;

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

const computeStatistics = (history: HistoryItem[], practiceRooms: PracticeRoom[], examSessions: ExamSession[]) => {
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

  return {
    historyCount: history.length,
    practiceRoomsCount: practiceRooms.length,
    totalTasksCompleted,
    examSessionsCount: examSessions.length,
    examTasksCompleted
  };
};

export function buildExportData(history: HistoryItem[], practiceRooms: PracticeRoom[], examSessions: ExamSession[]): ExportData {
  return {
    version: CURRENT_EXPORT_VERSION,
    exportedAt: Date.now(),
    history,
    practiceRooms,
    examSessions,
    statistics: computeStatistics(history, practiceRooms, examSessions)
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
      errors: ['Datei ist kein gültiges JSON.']
    };
  }

  const errors: string[] = [];

  if (typeof raw !== 'object' || raw === null) {
    errors.push('Exportdaten haben ein ungültiges Format.');
    return { success: false, errors };
  }

  const obj = raw as any;

  if (typeof obj.version !== 'number') {
    errors.push('Feld "version" fehlt oder ist ungültig.');
  }

  if (typeof obj.exportedAt !== 'number') {
    errors.push('Feld "exportedAt" fehlt oder ist ungültig.');
  }

  if (!Array.isArray(obj.history)) {
    errors.push('Feld "history" fehlt oder ist keine Liste.');
  }

  if (!Array.isArray(obj.practiceRooms)) {
    errors.push('Feld "practiceRooms" fehlt oder ist keine Liste.');
  }

  if (obj.examSessions !== undefined && !Array.isArray(obj.examSessions)) {
    errors.push('Feld "examSessions" ist ungültig.');
  }

  if (typeof obj.statistics !== 'object' || obj.statistics === null) {
    errors.push('Feld "statistics" fehlt oder ist ungültig.');
  } else {
    const stats = obj.statistics;
    if (typeof stats.historyCount !== 'number') {
      errors.push('statistics.historyCount ist ungültig.');
    }
    if (typeof stats.practiceRoomsCount !== 'number') {
      errors.push('statistics.practiceRoomsCount ist ungültig.');
    }
    if (typeof stats.totalTasksCompleted !== 'number') {
      errors.push('statistics.totalTasksCompleted ist ungültig.');
    }
    if (stats.examSessionsCount !== undefined && typeof stats.examSessionsCount !== 'number') {
      errors.push('statistics.examSessionsCount ist ungültig.');
    }
    if (stats.examTasksCompleted !== undefined && typeof stats.examTasksCompleted !== 'number') {
      errors.push('statistics.examTasksCompleted ist ungültig.');
    }
  }

  if (errors.length) {
    return { success: false, errors };
  }

  const data: ExportData = {
    version: obj.version,
    exportedAt: obj.exportedAt,
    history: obj.history as HistoryItem[],
    practiceRooms: obj.practiceRooms as PracticeRoom[],
    examSessions: Array.isArray(obj.examSessions) ? (obj.examSessions as ExamSession[]) : [],
    statistics: {
      historyCount: obj.statistics.historyCount,
      practiceRoomsCount: obj.statistics.practiceRoomsCount,
      totalTasksCompleted: obj.statistics.totalTasksCompleted,
      examSessionsCount: obj.statistics.examSessionsCount ?? (Array.isArray(obj.examSessions) ? obj.examSessions.length : 0),
      examTasksCompleted: obj.statistics.examTasksCompleted ?? 0
    }
  };

  return { success: true, data };
}

export function applyImportData(
  currentHistory: HistoryItem[],
  currentPracticeRooms: PracticeRoom[],
  currentExamSessions: ExamSession[],
  imported: ExportData,
  strategy: ImportStrategy
): { history: HistoryItem[]; practiceRooms: PracticeRoom[]; examSessions: ExamSession[] } {
  if (strategy === 'replace') {
    return {
      history: imported.history,
      practiceRooms: imported.practiceRooms,
      examSessions: imported.examSessions ?? []
    };
  }

  const history = mergeById(
    currentHistory,
    imported.history,
    mergeHistoryItem,
    strategy
  ).sort((a, b) => b.timestamp - a.timestamp);

  const practiceRooms = mergeById(
    currentPracticeRooms,
    imported.practiceRooms,
    mergePracticeRoom,
    strategy
  ).sort((a, b) => b.updatedAt - a.updatedAt);

  const examSessions = mergeById(
    currentExamSessions,
    imported.examSessions ?? [],
    mergeExamSession,
    strategy
  ).sort((a, b) => getExamActivityTime(b) - getExamActivityTime(a));

  return { history, practiceRooms, examSessions };
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

