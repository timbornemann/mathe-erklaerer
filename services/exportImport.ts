import { HistoryItem, PracticeRoom, ExportData, ExamSession } from '../types';

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

const generateId = (): string => {
  if (typeof globalThis.crypto?.randomUUID === 'function') {
    return globalThis.crypto.randomUUID();
  }

  if (typeof globalThis.crypto?.getRandomValues === 'function') {
    const bytes = new Uint8Array(16);
    globalThis.crypto.getRandomValues(bytes);
    bytes[6] = (bytes[6] & 0x0f) | 0x40;
    bytes[8] = (bytes[8] & 0x3f) | 0x80;

    const hex = Array.from(bytes, byte => byte.toString(16).padStart(2, '0')).join('');
    return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
  }

  return `id-${Date.now()}-${Math.random().toString(16).slice(2)}`;
};

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

  const mergeWithStrategy = <T extends { id: string }>(
    current: T[],
    incoming: T[]
  ): T[] => {
    const existingIds = new Set(current.map(item => item.id));
    const result = [...current];

    for (const item of incoming) {
      if (existingIds.has(item.id)) {
        if (strategy === 'skipConflicts') {
          continue;
        }

        const cloned: T = { ...item, id: generateId() };
        result.push(cloned);
        existingIds.add(cloned.id);
      } else {
        result.push(item);
        existingIds.add(item.id);
      }
    }

    return result;
  };

  return {
    history: mergeWithStrategy(currentHistory, imported.history),
    practiceRooms: mergeWithStrategy(currentPracticeRooms, imported.practiceRooms),
    examSessions: mergeWithStrategy(currentExamSessions, imported.examSessions ?? [])
  };
}

