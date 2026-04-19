import React, { useState, useRef, useCallback, useEffect } from 'react';
import { solveMathProblem } from './services/gemini';
import { generatePracticeTask } from './services/gemini';
import { checkPracticeSolution, solvePracticeTask } from './services/gemini';
import SolutionViewer from './components/SolutionViewer';
import MathRenderer from './components/MathRenderer';
import PracticeSetup from './components/PracticeSetup';
import PracticeSession from './components/PracticeSession';
import PracticeRoomCard from './components/PracticeRoomCard';
import PracticeRoomDetail from './components/PracticeRoomDetail';
import ExamSetup, { ExamConfig } from './components/ExamSetup';
import ExamSession from './components/ExamSession';
import ExamResultView from './components/ExamResultView';
import { MathState, InputMode, HistoryItem, MathSolution, PracticeRoom, PracticeTask, ExamSession as ExamSessionType, ExamTask, HistoryStatus } from './types';
import { buildExportData, serializeExportData, parseAndValidateExport, applyImportData, ImportStrategy } from './services/exportImport';
import {
  downloadExamAsMarkdown,
  downloadExamAsPdf,
  downloadSolutionAsMarkdown,
  downloadSolutionAsPdf
} from './services/documentExport';
import { 
  Calculator, 
  X, 
  Loader2, 
  Send, 
  ImageIcon, 
  Type,
  Clock,
  Trash2,
  ChevronRight,
  GraduationCap,
  Dumbbell,
  BookOpen,
  Settings,
  ClipboardCheck
} from 'lucide-react';
import SettingsModal from './components/SettingsModal';

const PRACTICE_ROOMS_KEY = 'mathPracticeRooms';
const EXAM_SESSIONS_KEY = 'mathExamSessions';
const HISTORY_STORAGE_KEY = 'mathGeniusHistory';

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

type PracticeView = 'setup' | 'detail' | 'session';
type ExamView = 'setup' | 'session' | 'result';
type SolutionOpenView = 'start' | 'summary';

const clampPercent = (value: number): number => {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(100, Math.round(value)));
};

const computeTutorProgress = (solution: MathSolution): number => {
  const total = solution.steps.length;
  if (total === 0) return 0;
  const completed = solution.steps.filter(step => step.loading !== true).length;
  return clampPercent((completed / total) * 100);
};

const buildTutorPreview = (status: HistoryStatus, progress: number, solution?: MathSolution, error?: string): string => {
  if (status === 'failed') {
    return error || 'Tutor-Lektion konnte nicht erstellt werden.';
  }

  if (status === 'completed' && solution) {
    return solution.finalAnswer || solution.steps[0]?.title || 'Tutor-Lektion erstellt.';
  }

  return `Tutor-Lektion wird erstellt (${progress}%).`;
};

const createTutorPlaceholderSolution = (topic: string): MathSolution => ({
  steps: [
    {
      title: topic || 'Tutor-Lektion',
      explanation: 'Die KI erstellt gerade den Lernpfad und die ersten Lektionen.',
      formulas: [],
      loading: true
    }
  ],
  finalAnswer: 'Lernpfad wird erstellt...'
});

const App: React.FC = () => {
  const [state, setState] = useState<MathState>({
    isLoading: false,
    inputMode: InputMode.TEXT,
    textInput: '',
    imageFile: null,
    imagePreview: null,
    solution: null,
    error: null,
    history: [],
    practiceRooms: [],
    activePracticeRoom: null,
    examSessions: [],
    activeExamSession: null
  });

  const [practiceView, setPracticeView] = useState<PracticeView>('setup');
  const [currentPracticeTask, setCurrentPracticeTask] = useState<PracticeTask | null>(null);
  const [isPracticeGenerating, setIsPracticeGenerating] = useState(false);
  const [examView, setExamView] = useState<ExamView>('setup');
  const [isExamGenerating, setIsExamGenerating] = useState(false);
  const [isExamSubmitting, setIsExamSubmitting] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [activeSolutionHistoryId, setActiveSolutionHistoryId] = useState<string | null>(null);
  const [solutionOpenView, setSolutionOpenView] = useState<SolutionOpenView>('start');

  const fileInputRef = useRef<HTMLInputElement>(null);
  const importFileInputRef = useRef<HTMLInputElement>(null);
  const activeSolutionHistoryIdRef = useRef<string | null>(null);

  const history = state.history ?? [];
  const practiceRooms = state.practiceRooms ?? [];

  const setActiveHistoryId = useCallback((id: string | null) => {
    activeSolutionHistoryIdRef.current = id;
    setActiveSolutionHistoryId(id);
  }, []);

  useEffect(() => {
    const updates: Partial<MathState> = {};

    const savedHistory = localStorage.getItem(HISTORY_STORAGE_KEY);
    if (savedHistory) {
      try {
        updates.history = JSON.parse(savedHistory);
      } catch (e) {
        console.error("Failed to parse history", e);
      }
    }

    const savedRooms = localStorage.getItem(PRACTICE_ROOMS_KEY);
    if (savedRooms) {
      try {
        updates.practiceRooms = JSON.parse(savedRooms);
      } catch (e) {
        console.error("Failed to parse practice rooms", e);
      }
    }

    const savedExamSessions = localStorage.getItem(EXAM_SESSIONS_KEY);
    if (savedExamSessions) {
      try {
        updates.examSessions = JSON.parse(savedExamSessions);
      } catch (e) {
        console.error("Failed to parse exam sessions", e);
      }
    }

    if (Object.keys(updates).length) {
      setState(prev => ({ ...prev, ...updates }));
    }
  }, []);

  const savePracticeRooms = useCallback((rooms: PracticeRoom[]) => {
    localStorage.setItem(PRACTICE_ROOMS_KEY, JSON.stringify(rooms));
  }, []);

  const saveExamSessions = useCallback((sessions: ExamSessionType[]) => {
    localStorage.setItem(EXAM_SESSIONS_KEY, JSON.stringify(sessions));
  }, []);

  const updateRoom = useCallback((updatedRoom: PracticeRoom) => {
    setState(prev => {
      const rooms = prev.practiceRooms.map(r => r.id === updatedRoom.id ? updatedRoom : r);
      savePracticeRooms(rooms);
      return { ...prev, practiceRooms: rooms, activePracticeRoom: updatedRoom };
    });
  }, [savePracticeRooms]);

  const updateExamSession = useCallback((updatedSession: ExamSessionType) => {
    setState(prev => {
      const sessions = prev.examSessions.map(s => s.id === updatedSession.id ? updatedSession : s);
      saveExamSessions(sessions);
      return { ...prev, examSessions: sessions, activeExamSession: updatedSession };
    });
  }, [saveExamSessions]);

  const persistHistory = useCallback((items: HistoryItem[]) => {
    localStorage.setItem(HISTORY_STORAGE_KEY, JSON.stringify(items));
  }, []);

  const saveToHistory = useCallback((newItem: HistoryItem) => {
    setState(prev => {
      const updatedHistory = [newItem, ...prev.history].slice(0, 50);
      persistHistory(updatedHistory);
      return { ...prev, history: updatedHistory };
    });
  }, [persistHistory]);

  const updateHistoryItem = useCallback((historyId: string, updater: (item: HistoryItem) => HistoryItem) => {
    setState(prev => {
      let found = false;
      const updatedHistory = prev.history.map(item => {
        if (item.id !== historyId) return item;
        found = true;
        return updater(item);
      });

      if (!found) {
        return prev;
      }

      persistHistory(updatedHistory);
      return { ...prev, history: updatedHistory };
    });
  }, [persistHistory]);

  const clearHistory = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!window.confirm("Moechtest du den Verlauf wirklich loeschen?")) return;

    const clearTutorHistory = state.inputMode === InputMode.TUTOR;
    setState(prev => {
      const remaining = prev.history.filter(item =>
        clearTutorHistory
          ? item.mode !== InputMode.TUTOR
          : item.mode === InputMode.TUTOR
      );
      persistHistory(remaining);
      return {
        ...prev,
        history: remaining,
        solution: null
      };
    });
    setActiveHistoryId(null);
  };

  const deleteHistoryItem = (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    setState(prev => {
      const updatedHistory = prev.history.filter(item => item.id !== id);
      persistHistory(updatedHistory);
      const activeRemoved = activeSolutionHistoryIdRef.current === id;
      return {
        ...prev,
        history: updatedHistory,
        ...(activeRemoved ? { solution: null } : {})
      };
    });

    if (activeSolutionHistoryIdRef.current === id) {
      setActiveHistoryId(null);
    }
  };

  const handleModeChange = (mode: InputMode) => {
    setActiveHistoryId(null);
    setSolutionOpenView('start');
    setState(prev => ({
      ...prev,
      inputMode: mode,
      error: null,
      ...(mode === InputMode.TUTOR ? { imageFile: null, imagePreview: null } : {}),
      ...(mode === InputMode.PRACTICE ? { activePracticeRoom: null } : {}),
      ...(mode === InputMode.EXAM ? { activeExamSession: null } : {})
    }));
    if (mode === InputMode.PRACTICE) {
      setPracticeView('setup');
      setCurrentPracticeTask(null);
    }
    if (mode === InputMode.EXAM) {
      setExamView('setup');
    }
  };

  const handleTextChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setState(prev => ({ ...prev, textInput: e.target.value }));
  };

  const handleReset = () => {
    const nextMode = state.inputMode === InputMode.IMAGE ? InputMode.TEXT : state.inputMode;

    setState(prev => ({
      ...prev,
      isLoading: false,
      inputMode: nextMode,
      textInput: '',
      imageFile: null,
      imagePreview: null,
      solution: null,
      error: null,
      activePracticeRoom: null,
      activeExamSession: null
    }));
    setPracticeView('setup');
    setCurrentPracticeTask(null);
    setExamView('setup');
    setActiveHistoryId(null);
    setSolutionOpenView('start');
  };

  const handleHistoryRestore = (item: HistoryItem, openView: SolutionOpenView = 'start') => {
    setActiveHistoryId(item.id);
    setSolutionOpenView(openView);
    setState(prev => ({
      ...prev,
      solution: item.solution,
      isLoading: false,
      error: null,
      textInput: item.prompt,
      inputMode: item.mode
    }));
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      if (file.type.startsWith('image/')) {
        const reader = new FileReader();
        reader.onloadend = () => {
          setState(prev => ({
            ...prev,
            imageFile: file,
            imagePreview: reader.result as string,
            error: null
          }));
        };
        reader.readAsDataURL(file);
      } else {
        setState(prev => ({ ...prev, error: "Bitte wähle eine gültige Bilddatei." }));
      }
    }
  };

  const handlePaste = useCallback((e: React.ClipboardEvent) => {
    const items = e.clipboardData.items;
    for (let i = 0; i < items.length; i++) {
      if (items[i].type.indexOf('image') !== -1) {
        e.preventDefault();
        const file = items[i].getAsFile();
        if (file) {
          const reader = new FileReader();
          reader.onloadend = () => {
            setState(prev => ({
              ...prev,
              imageFile: file,
              imagePreview: reader.result as string,
              error: null
            }));
          };
          reader.readAsDataURL(file);
          return;
        }
      }
    }
  }, []);

  const removeImage = () => {
    setState(prev => ({ ...prev, imageFile: null, imagePreview: null }));
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleExportData = () => {
    const exportData = buildExportData(history, practiceRooms, state.examSessions ?? []);
    const json = serializeExportData(exportData);
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    const date = new Date().toISOString().slice(0, 10);

    link.href = url;
    link.download = `mathe-erklaerer-backup-${date}.json`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const handleImportClick = () => {
    importFileInputRef.current?.click();
  };

  const handleImportFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = () => {
      try {
        const text = reader.result as string;
        const validation = parseAndValidateExport(text);

        if (!validation.success) {
          const errors = 'errors' in validation ? validation.errors : [];
          window.alert(`Import fehlgeschlagen:\n${errors.join('\n')}`);
          return;
        }

        const imported = validation.data;

        const hasHistoryConflicts = (state.history ?? []).some(existing =>
          imported.history.some(item => item.id === existing.id)
        );
        const hasRoomConflicts = (state.practiceRooms ?? []).some(existing =>
          imported.practiceRooms.some(room => room.id === existing.id)
        );
        const hasExamConflicts = (state.examSessions ?? []).some(existing =>
          imported.examSessions.some(session => session.id === existing.id)
        );
        const hasConflicts = hasHistoryConflicts || hasRoomConflicts || hasExamConflicts;

        const message = hasConflicts
          ? 'Beim Import wurden ueberschneidende Daten gefunden.\n\nOK = Daten intelligent ZUSAMMENFUEHREN (Duplikate vermeiden).\nAbbrechen = aktuelle Daten komplett durch Import ERSETZEN.'
          : 'Wie moechtest du importieren?\n\nOK = intelligent zusammenfuehren (Duplikate vermeiden).\nAbbrechen = aktuelle Daten komplett ersetzen.';

        const merge = window.confirm(message);
        const strategy: ImportStrategy = merge ? 'merge' : 'replace';

        setState(prev => {
          const { history: newHistory, practiceRooms: newPracticeRooms, examSessions: newExamSessions } = applyImportData(
            prev.history ?? [],
            prev.practiceRooms ?? [],
            prev.examSessions ?? [],
            imported,
            strategy
          );

          localStorage.setItem(HISTORY_STORAGE_KEY, JSON.stringify(newHistory));
          localStorage.setItem(PRACTICE_ROOMS_KEY, JSON.stringify(newPracticeRooms));
          localStorage.setItem(EXAM_SESSIONS_KEY, JSON.stringify(newExamSessions));

          let newActivePracticeRoom = prev.activePracticeRoom;
          if (newActivePracticeRoom) {
            const stillExists = newPracticeRooms.find(r => r.id === newActivePracticeRoom!.id);
            if (!stillExists) {
              newActivePracticeRoom = null;
            }
          }

          return {
            ...prev,
            history: newHistory,
            practiceRooms: newPracticeRooms,
            examSessions: newExamSessions,
            activePracticeRoom: newActivePracticeRoom
          };
        });
        setActiveHistoryId(null);

        window.alert(
          strategy === 'merge'
            ? 'Daten wurden erfolgreich zusammengefuehrt. Doppelte Eintraege wurden vermieden.'
            : 'Daten wurden erfolgreich importiert und ersetzt.'
        );
      } catch (error) {
        console.error(error);
        window.alert('Beim Import ist ein unerwarteter Fehler aufgetreten.');
      } finally {
        if (importFileInputRef.current) {
          importFileInputRef.current.value = '';
        }
      }
    };

    reader.onerror = () => {
      window.alert('Die Import-Datei konnte nicht gelesen werden.');
    };

    reader.readAsText(file, 'utf-8');
  };

  const buildActivePromptForExport = useCallback((): string => {
    if (state.textInput.trim()) {
      return state.textInput.trim();
    }
    if (state.inputMode === InputMode.IMAGE) {
      return 'Foto-Analyse';
    }
    if (state.inputMode === InputMode.TUTOR) {
      return 'Tutor-Lektion';
    }
    return 'Mathe-Aufgabe';
  }, [state.inputMode, state.textInput]);

  const handleDownloadSolutionMarkdown = useCallback(() => {
    if (!state.solution) return;
    try {
      const prompt = buildActivePromptForExport();
      downloadSolutionAsMarkdown(state.solution, prompt);
    } catch (error) {
      console.error(error);
      window.alert('Markdown-Export der Loesung fehlgeschlagen.');
    }
  }, [buildActivePromptForExport, state.solution]);

  const handleDownloadSolutionPdf = useCallback(() => {
    if (!state.solution) return;
    try {
      const prompt = buildActivePromptForExport();
      downloadSolutionAsPdf(state.solution, prompt);
    } catch (error: any) {
      console.error(error);
      window.alert(error?.message || 'PDF-Export der Loesung fehlgeschlagen.');
    }
  }, [buildActivePromptForExport, state.solution]);

  const handleDownloadExamMarkdown = useCallback((session: ExamSessionType) => {
    try {
      downloadExamAsMarkdown(session);
    } catch (error) {
      console.error(error);
      window.alert('Markdown-Export der Pruefung fehlgeschlagen.');
    }
  }, []);

  const handleDownloadExamPdf = useCallback((session: ExamSessionType) => {
    try {
      downloadExamAsPdf(session);
    } catch (error: any) {
      console.error(error);
      window.alert(error?.message || 'PDF-Export der Pruefung fehlgeschlagen.');
    }
  }, []);

  const handleSubmit = useCallback(async () => {
    if (state.isLoading && state.inputMode !== InputMode.TUTOR) return;

    if (state.inputMode === InputMode.TUTOR) {
      const tutorTopic = state.textInput.trim();
      if (!tutorTopic) {
        setState(prev => ({
          ...prev,
          error: "Bitte beschreibe ein Thema oder Sachgebiet fuer den Tutor-Modus."
        }));
        return;
      }

      const historyId = generateId();
      const placeholderSolution = createTutorPlaceholderSolution(tutorTopic);
      const initialProgress = computeTutorProgress(placeholderSolution);

      const pendingItem: HistoryItem = {
        id: historyId,
        timestamp: Date.now(),
        mode: InputMode.TUTOR,
        prompt: tutorTopic,
        preview: buildTutorPreview('processing', initialProgress, placeholderSolution),
        solution: placeholderSolution,
        status: 'processing',
        progress: initialProgress
      };

      saveToHistory(pendingItem);
      setActiveHistoryId(historyId);
      setSolutionOpenView('start');
      setState(prev => ({
        ...prev,
        isLoading: false,
        error: null,
        inputMode: InputMode.TUTOR,
        solution: placeholderSolution
      }));

      void solveMathProblem(
        tutorTopic,
        undefined,
        'image/jpeg',
        InputMode.TUTOR,
        {
          onTutorProgress: (partial: MathSolution) => {
            const progress = computeTutorProgress(partial);
            updateHistoryItem(historyId, (item) => ({
              ...item,
              solution: partial,
              status: 'processing',
              progress,
              error: undefined,
              preview: buildTutorPreview('processing', progress, partial)
            }));

            if (activeSolutionHistoryIdRef.current === historyId) {
              setState(prev => ({
                ...prev,
                solution: partial,
                error: null,
                inputMode: InputMode.TUTOR
              }));
            }
          }
        }
      )
        .then((solution) => {
          updateHistoryItem(historyId, (item) => ({
            ...item,
            solution,
            status: 'completed',
            progress: 100,
            error: undefined,
            preview: buildTutorPreview('completed', 100, solution)
          }));

          if (activeSolutionHistoryIdRef.current === historyId) {
            setState(prev => ({
              ...prev,
              solution,
              error: null,
              inputMode: InputMode.TUTOR
            }));
          }
        })
        .catch((err: any) => {
          const message = err?.message || "Tutor-Lektion konnte nicht erstellt werden.";
          updateHistoryItem(historyId, (item) => {
            const keptProgress = clampPercent(item.progress ?? 0);
            return {
              ...item,
              status: 'failed',
              progress: keptProgress,
              error: message,
              preview: buildTutorPreview('failed', keptProgress, item.solution, message)
            };
          });

          if (activeSolutionHistoryIdRef.current === historyId) {
            setState(prev => ({
              ...prev,
              error: message
            }));
          }
        });

      return;
    }

    if (state.inputMode === InputMode.TEXT && !state.textInput.trim() && !state.imageFile) {
      setState(prev => ({
        ...prev,
        error: "Bitte gib eine Aufgabe ein oder lade ein Foto hoch."
      }));
      return;
    }

    setState(prev => ({ ...prev, isLoading: true, error: null, solution: null }));

    try {
      const solution = await solveMathProblem(
        state.textInput,
        state.imagePreview || undefined,
        state.imageFile?.type,
        state.inputMode
      );

      const savedMode = state.inputMode === InputMode.TEXT && state.imageFile ? InputMode.IMAGE : state.inputMode;
      const historyItem: HistoryItem = {
        id: generateId(),
        timestamp: Date.now(),
        mode: savedMode,
        prompt: state.textInput || (state.imageFile ? "Foto-Analyse" : "Aufgabe"),
        preview: solution.finalAnswer || solution.steps[0]?.title || "Geloeste Aufgabe",
        solution,
        status: 'completed',
        progress: 100
      };

      saveToHistory(historyItem);
      setActiveHistoryId(historyItem.id);
      setSolutionOpenView('start');

      setState(prev => ({ ...prev, solution, isLoading: false }));
    } catch (err: any) {
      setState(prev => ({
        ...prev,
        isLoading: false,
        error: err.message || "Es ist ein Fehler aufgetreten. Bitte versuche es erneut."
      }));
    }
  }, [state.isLoading, state.inputMode, state.textInput, state.imagePreview, state.imageFile, saveToHistory, setActiveHistoryId, updateHistoryItem]);

  // ── Practice Mode handlers ──

  const handlePracticeStart = async (topic: string, difficulty: string, exampleTasks: string[]) => {
    setIsPracticeGenerating(true);
    setState(prev => ({ ...prev, error: null }));

    try {
      const result = await generatePracticeTask(topic, difficulty, exampleTasks, []);

      const newTask: PracticeTask = {
        id: generateId(),
        taskText: result.taskText,
        timestamp: Date.now()
      };

      const newRoom: PracticeRoom = {
        id: generateId(),
        topic,
        description: result.description,
        difficulty,
        exampleTasks,
        generatedTasks: [newTask],
        createdAt: Date.now(),
        updatedAt: Date.now()
      };

      setState(prev => {
        const rooms = [newRoom, ...prev.practiceRooms];
        savePracticeRooms(rooms);
        return { ...prev, practiceRooms: rooms, activePracticeRoom: newRoom };
      });

      setCurrentPracticeTask(newTask);
      setPracticeView('session');
    } catch (err: any) {
      setState(prev => ({
        ...prev,
        error: err.message || "Aufgabe konnte nicht erstellt werden."
      }));
    } finally {
      setIsPracticeGenerating(false);
    }
  };

  const handlePracticeTaskUpdated = (updatedTask: PracticeTask) => {
    if (!state.activePracticeRoom) return;

    const updatedRoom: PracticeRoom = {
      ...state.activePracticeRoom,
      generatedTasks: state.activePracticeRoom.generatedTasks.map(
        t => t.id === updatedTask.id ? updatedTask : t
      ),
      updatedAt: Date.now()
    };

    setCurrentPracticeTask(updatedTask);
    updateRoom(updatedRoom);
  };

  const handlePracticeNextTask = async (additionalPrompt?: string) => {
    if (!state.activePracticeRoom) return;

    setIsPracticeGenerating(true);

    try {
      const result = await generatePracticeTask(
        state.activePracticeRoom.topic,
        state.activePracticeRoom.difficulty,
        state.activePracticeRoom.exampleTasks,
        state.activePracticeRoom.generatedTasks,
        additionalPrompt
      );

      const newTask: PracticeTask = {
        id: generateId(),
        taskText: result.taskText,
        additionalPrompt,
        timestamp: Date.now()
      };

      const updatedRoom: PracticeRoom = {
        ...state.activePracticeRoom,
        generatedTasks: [...state.activePracticeRoom.generatedTasks, newTask],
        updatedAt: Date.now()
      };

      updateRoom(updatedRoom);
      setCurrentPracticeTask(newTask);
      setPracticeView('session');
    } catch (err: any) {
      setState(prev => ({
        ...prev,
        error: err.message || "Nächste Aufgabe konnte nicht erstellt werden."
      }));
    } finally {
      setIsPracticeGenerating(false);
    }
  };

  const handleOpenRoom = (room: PracticeRoom) => {
    setState(prev => ({ ...prev, activePracticeRoom: room, inputMode: InputMode.PRACTICE }));
    setPracticeView('detail');
    setCurrentPracticeTask(null);
  };

  const handleDeleteRoom = (e: React.MouseEvent, roomId: string) => {
    e.stopPropagation();
    if (window.confirm("Möchtest du diesen Lernraum wirklich löschen?")) {
      setState(prev => {
        const rooms = prev.practiceRooms.filter(r => r.id !== roomId);
        savePracticeRooms(rooms);
        return {
          ...prev,
          practiceRooms: rooms,
          activePracticeRoom: prev.activePracticeRoom?.id === roomId ? null : prev.activePracticeRoom
        };
      });
    }
  };

  const handleRoomContinue = async (additionalPrompt?: string) => {
    await handlePracticeNextTask(additionalPrompt);
  };

  const handleUpdateExamples = (examples: string[]) => {
    if (!state.activePracticeRoom) return;
    const updatedRoom: PracticeRoom = {
      ...state.activePracticeRoom,
      exampleTasks: examples,
      updatedAt: Date.now()
    };
    updateRoom(updatedRoom);
  };

  const handleResumeTask = (task: PracticeTask) => {
    setCurrentPracticeTask(task);
    setPracticeView('session');
  };

  const handlePracticeBack = () => {
    if (practiceView === 'session') {
      setPracticeView(state.activePracticeRoom?.generatedTasks?.length ? 'detail' : 'setup');
      setCurrentPracticeTask(null);
    } else if (practiceView === 'detail') {
      setState(prev => ({ ...prev, activePracticeRoom: null }));
      setPracticeView('setup');
    }
  };

  // ── Exam Mode handlers ──

  const buildExamSummary = (scorePercent: number, correctCount: number, total: number): string => {
    if (scorePercent >= 90) return `Starke Leistung: $${correctCount}$ von $${total}$ Aufgaben korrekt.`;
    if (scorePercent >= 75) return `Gute Leistung: $${correctCount}$ von $${total}$ Aufgaben korrekt.`;
    if (scorePercent >= 60) return `Solide Basis: $${correctCount}$ von $${total}$ Aufgaben korrekt.`;
    return `Ausbaufähig: $${correctCount}$ von $${total}$ Aufgaben korrekt. Wiederhole die schwachen Themen gezielt.`;
  };

  const handleExamStart = async (config: ExamConfig) => {
    setIsExamGenerating(true);
    setState(prev => ({ ...prev, error: null }));

    try {
      const generatedTasks: ExamTask[] = [];
      const previousTasks: PracticeTask[] = [];

      for (let i = 0; i < config.taskCount; i++) {
        const result = await generatePracticeTask(
          config.topic,
          config.difficulty,
          config.exampleTasks,
          previousTasks,
          `Erstelle Aufgabe ${i + 1} von ${config.taskCount} für eine Prüfung.`
        );

        const task: ExamTask = {
          id: generateId(),
          order: i + 1,
          taskText: result.taskText,
          timestamp: Date.now()
        };

        generatedTasks.push(task);
        previousTasks.push({
          id: task.id,
          taskText: task.taskText,
          timestamp: task.timestamp
        });
      }

      const startedAt = Date.now();
      const newSession: ExamSessionType = {
        id: generateId(),
        topic: config.topic,
        difficulty: config.difficulty,
        taskCount: config.taskCount,
        durationMinutes: config.durationMinutes,
        createdAt: startedAt,
        startedAt,
        endsAt: startedAt + config.durationMinutes * 60 * 1000,
        status: 'running',
        tasks: generatedTasks
      };

      setState(prev => {
        const sessions = [newSession, ...prev.examSessions].slice(0, 30);
        saveExamSessions(sessions);
        return {
          ...prev,
          examSessions: sessions,
          activeExamSession: newSession
        };
      });

      setExamView('session');
    } catch (err: any) {
      setState(prev => ({
        ...prev,
        error: err.message || "Prüfungsaufgaben konnten nicht erstellt werden."
      }));
    } finally {
      setIsExamGenerating(false);
    }
  };

  const handleExamTaskUpdated = (updatedTask: ExamTask) => {
    if (!state.activeExamSession) return;

    const updatedSession: ExamSessionType = {
      ...state.activeExamSession,
      tasks: state.activeExamSession.tasks.map(task => task.id === updatedTask.id ? updatedTask : task),
      remainingSeconds: Math.max(0, Math.floor((state.activeExamSession.endsAt - Date.now()) / 1000))
    };

    updateExamSession(updatedSession);
  };

  const handleExamSubmit = async (reason: 'manual' | 'timeout') => {
    if (!state.activeExamSession || isExamSubmitting) return;
    if (state.activeExamSession.status === 'evaluating' || state.activeExamSession.status === 'completed') return;

    setIsExamSubmitting(true);
    const submittedAt = Date.now();

    const submittedSession: ExamSessionType = {
      ...state.activeExamSession,
      status: 'evaluating',
      submittedAt,
      submitReason: reason,
      remainingSeconds: Math.max(0, Math.floor((state.activeExamSession.endsAt - submittedAt) / 1000))
    };
    updateExamSession(submittedSession);

    try {
      const evaluatedTasks: ExamTask[] = await Promise.all(
        submittedSession.tasks.map(async (task) => {
          const hasAnswer = !!((task.userSolution ?? '').trim() || task.userSolutionImage);
          if (!hasAnswer) {
            const solution = await solvePracticeTask(task.taskText);
            return {
              ...task,
              isCorrect: false,
              aiFeedback: 'Keine Antwort eingereicht.',
              fullSolution: solution
            };
          }

          try {
            const check = await checkPracticeSolution(
              task.taskText,
              task.userSolution,
              task.userSolutionImage
            );

            let fullSolution: MathSolution | undefined = task.fullSolution;
            if (!check.isCorrect) {
              fullSolution = await solvePracticeTask(task.taskText);
            }

            return {
              ...task,
              isCorrect: check.isCorrect,
              aiFeedback: check.feedback,
              fullSolution
            };
          } catch (error: any) {
            return {
              ...task,
              isCorrect: false,
              aiFeedback: 'Aufgabe konnte nicht vollständig bewertet werden.',
              evaluationError: error?.message || 'Unbekannter Fehler'
            };
          }
        })
      );

      const correctCount = evaluatedTasks.filter(task => task.isCorrect).length;
      const wrongCount = evaluatedTasks.length - correctCount;
      const scorePercent = Math.round((correctCount / Math.max(1, evaluatedTasks.length)) * 100);

      const completedSession: ExamSessionType = {
        ...submittedSession,
        tasks: evaluatedTasks,
        status: 'completed',
        completedAt: Date.now(),
        correctCount,
        wrongCount,
        scorePercent,
        feedbackSummary: buildExamSummary(scorePercent, correctCount, evaluatedTasks.length)
      };

      updateExamSession(completedSession);
      setExamView('result');
    } catch (err: any) {
      setState(prev => ({
        ...prev,
        error: err.message || 'Prüfung konnte nicht vollständig ausgewertet werden.'
      }));

      updateExamSession({
        ...submittedSession,
        status: 'submitted'
      });
    } finally {
      setIsExamSubmitting(false);
    }
  };

  const handleOpenExamSession = (session: ExamSessionType) => {
    setState(prev => ({ ...prev, inputMode: InputMode.EXAM, activeExamSession: session }));
    if (session.status === 'completed') {
      setExamView('result');
      return;
    }
    setExamView('session');
  };

  // ── Render: Solution view ──
  if (state.solution && state.inputMode !== InputMode.PRACTICE) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-indigo-50 via-white to-purple-50 flex flex-col items-center p-3 sm:p-4 md:p-8">
        <header className="w-full max-w-4xl mb-6 md:mb-8 flex items-start justify-between gap-3 sm:items-center">
          <div className="flex min-w-0 flex-1 items-center gap-3 cursor-pointer group" onClick={handleReset}>
            <div className="bg-indigo-600 p-2.5 sm:p-3 rounded-xl shadow-lg shadow-indigo-200 group-hover:bg-indigo-700 transition-colors">
              <Calculator className="w-6 h-6 sm:w-8 sm:h-8 text-white" />
            </div>
            <div className="min-w-0">
              <h1 className="text-xl sm:text-3xl font-extrabold text-slate-800 tracking-tight leading-tight">Mathe Erklaerer</h1>
              <p className="text-sm text-slate-500">Zurück zur Übersicht</p>
            </div>
          </div>
          <button
            onClick={() => setSettingsOpen(true)}
            className="self-start sm:self-auto shrink-0 p-2.5 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 bg-white/90 border border-slate-200 rounded-full shadow-sm transition-all"
            title="Einstellungen"
          >
            <Settings className="w-5 h-5" />
          </button>
        </header>

        <SettingsModal
          isOpen={settingsOpen}
          onClose={() => setSettingsOpen(false)}
          onExport={handleExportData}
          onImportClick={handleImportClick}
        />
        <input
          ref={importFileInputRef}
          type="file"
          accept="application/json"
          className="hidden"
          onChange={handleImportFileChange}
        />

        <SolutionViewer 
          key={`${activeSolutionHistoryId ?? 'active-solution'}-${solutionOpenView}`}
          solution={state.solution} 
          onReset={handleReset} 
          initialView={solutionOpenView}
          initialPrompt={state.textInput || (state.inputMode === InputMode.IMAGE ? "Foto-Analyse" : "Dein Mathe-Problem")}
          onDownloadMarkdown={handleDownloadSolutionMarkdown}
          onDownloadPdf={handleDownloadSolutionPdf}
        />
      </div>
    );
  }

  // ── Render: Practice session ──
  if (state.inputMode === InputMode.PRACTICE && practiceView === 'session' && state.activePracticeRoom && currentPracticeTask) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-indigo-50 via-white to-purple-50 flex flex-col items-center p-3 sm:p-4 md:p-8">
        <header className="w-full max-w-4xl mb-6 md:mb-8 flex items-start justify-between gap-3 sm:items-center">
          <div className="flex min-w-0 flex-1 items-center gap-3 cursor-pointer group" onClick={handleReset}>
            <div className="bg-indigo-600 p-2.5 sm:p-3 rounded-xl shadow-lg shadow-indigo-200 group-hover:bg-indigo-700 transition-colors">
              <Calculator className="w-6 h-6 sm:w-8 sm:h-8 text-white" />
            </div>
            <div className="min-w-0">
              <h1 className="text-xl sm:text-3xl font-extrabold text-slate-800 tracking-tight leading-tight">Mathe Erklaerer</h1>
              <p className="text-sm text-slate-500">Zurück zur Übersicht</p>
            </div>
          </div>
          <button
            onClick={() => setSettingsOpen(true)}
            className="self-start sm:self-auto shrink-0 p-2.5 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 bg-white/90 border border-slate-200 rounded-full shadow-sm transition-all"
            title="Einstellungen"
          >
            <Settings className="w-5 h-5" />
          </button>
        </header>

        <SettingsModal
          isOpen={settingsOpen}
          onClose={() => setSettingsOpen(false)}
          onExport={handleExportData}
          onImportClick={handleImportClick}
        />
        <input
          ref={importFileInputRef}
          type="file"
          accept="application/json"
          className="hidden"
          onChange={handleImportFileChange}
        />

        <PracticeSession
          room={state.activePracticeRoom}
          currentTask={currentPracticeTask}
          onTaskUpdated={handlePracticeTaskUpdated}
          onNextTask={handlePracticeNextTask}
          onBack={handlePracticeBack}
          isGenerating={isPracticeGenerating}
        />

        <footer className="mt-8 md:mt-12 text-slate-400 text-xs sm:text-sm text-center px-4">
          Powered by Google Gemini 3
        </footer>
      </div>
    );
  }

  // ── Render: Practice room detail ──
  if (state.inputMode === InputMode.PRACTICE && practiceView === 'detail' && state.activePracticeRoom) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-indigo-50 via-white to-purple-50 flex flex-col items-center p-3 sm:p-4 md:p-8">
        <header className="w-full max-w-4xl mb-6 md:mb-8 flex items-start justify-between gap-3 sm:items-center">
          <div className="flex min-w-0 flex-1 items-center gap-3 cursor-pointer group" onClick={handleReset}>
            <div className="bg-indigo-600 p-2.5 sm:p-3 rounded-xl shadow-lg shadow-indigo-200 group-hover:bg-indigo-700 transition-colors">
              <Calculator className="w-6 h-6 sm:w-8 sm:h-8 text-white" />
            </div>
            <div className="min-w-0">
              <h1 className="text-xl sm:text-3xl font-extrabold text-slate-800 tracking-tight leading-tight">Mathe Erklaerer</h1>
              <p className="text-sm text-slate-500">Zurück zur Übersicht</p>
            </div>
          </div>
          <button
            onClick={() => setSettingsOpen(true)}
            className="self-start sm:self-auto shrink-0 p-2.5 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 bg-white/90 border border-slate-200 rounded-full shadow-sm transition-all"
            title="Einstellungen"
          >
            <Settings className="w-5 h-5" />
          </button>
        </header>

        <SettingsModal
          isOpen={settingsOpen}
          onClose={() => setSettingsOpen(false)}
          onExport={handleExportData}
          onImportClick={handleImportClick}
        />
        <input
          ref={importFileInputRef}
          type="file"
          accept="application/json"
          className="hidden"
          onChange={handleImportFileChange}
        />

        <PracticeRoomDetail
          room={state.activePracticeRoom}
          onContinue={handleRoomContinue}
          onResumeTask={handleResumeTask}
          onUpdateExamples={handleUpdateExamples}
          onTaskUpdated={handlePracticeTaskUpdated}
          onBack={handlePracticeBack}
          isLoading={isPracticeGenerating}
        />

        <footer className="mt-8 md:mt-12 text-slate-400 text-xs sm:text-sm text-center px-4">
          Powered by Google Gemini 3
        </footer>
      </div>
    );
  }

  // ── Render: Exam session ──
  if (state.inputMode === InputMode.EXAM && examView === 'session' && state.activeExamSession) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-indigo-50 via-white to-purple-50 flex flex-col items-center p-3 sm:p-4 md:p-8">
        <header className="w-full max-w-4xl mb-6 md:mb-8 flex items-start justify-between gap-3 sm:items-center">
          <div className="flex min-w-0 flex-1 items-center gap-3 cursor-pointer group" onClick={handleReset}>
            <div className="bg-indigo-600 p-2.5 sm:p-3 rounded-xl shadow-lg shadow-indigo-200 group-hover:bg-indigo-700 transition-colors">
              <Calculator className="w-6 h-6 sm:w-8 sm:h-8 text-white" />
            </div>
            <div className="min-w-0">
              <h1 className="text-xl sm:text-3xl font-extrabold text-slate-800 tracking-tight leading-tight">Mathe Erklaerer</h1>
              <p className="text-sm text-slate-500">Zurück zur Übersicht</p>
            </div>
          </div>
          <button
            onClick={() => setSettingsOpen(true)}
            className="self-start sm:self-auto shrink-0 p-2.5 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 bg-white/90 border border-slate-200 rounded-full shadow-sm transition-all"
            title="Einstellungen"
          >
            <Settings className="w-5 h-5" />
          </button>
        </header>

        <SettingsModal
          isOpen={settingsOpen}
          onClose={() => setSettingsOpen(false)}
          onExport={handleExportData}
          onImportClick={handleImportClick}
        />
        <input
          ref={importFileInputRef}
          type="file"
          accept="application/json"
          className="hidden"
          onChange={handleImportFileChange}
        />

        <ExamSession
          session={state.activeExamSession}
          isSubmitting={isExamSubmitting}
          onTaskUpdated={handleExamTaskUpdated}
          onSubmit={handleExamSubmit}
          onBack={() => setExamView('setup')}
          onDownloadMarkdown={() => handleDownloadExamMarkdown(state.activeExamSession!)}
          onDownloadPdf={() => handleDownloadExamPdf(state.activeExamSession!)}
        />

        <footer className="mt-8 md:mt-12 text-slate-400 text-xs sm:text-sm text-center px-4">
          Powered by Google Gemini 3
        </footer>
      </div>
    );
  }

  // ── Render: Exam result ──
  if (state.inputMode === InputMode.EXAM && examView === 'result' && state.activeExamSession) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-indigo-50 via-white to-purple-50 flex flex-col items-center p-3 sm:p-4 md:p-8">
        <header className="w-full max-w-4xl mb-6 md:mb-8 flex items-start justify-between gap-3 sm:items-center">
          <div className="flex min-w-0 flex-1 items-center gap-3 cursor-pointer group" onClick={handleReset}>
            <div className="bg-indigo-600 p-2.5 sm:p-3 rounded-xl shadow-lg shadow-indigo-200 group-hover:bg-indigo-700 transition-colors">
              <Calculator className="w-6 h-6 sm:w-8 sm:h-8 text-white" />
            </div>
            <div className="min-w-0">
              <h1 className="text-xl sm:text-3xl font-extrabold text-slate-800 tracking-tight leading-tight">Mathe Erklaerer</h1>
              <p className="text-sm text-slate-500">Zurück zur Übersicht</p>
            </div>
          </div>
          <button
            onClick={() => setSettingsOpen(true)}
            className="self-start sm:self-auto shrink-0 p-2.5 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 bg-white/90 border border-slate-200 rounded-full shadow-sm transition-all"
            title="Einstellungen"
          >
            <Settings className="w-5 h-5" />
          </button>
        </header>

        <SettingsModal
          isOpen={settingsOpen}
          onClose={() => setSettingsOpen(false)}
          onExport={handleExportData}
          onImportClick={handleImportClick}
        />
        <input
          ref={importFileInputRef}
          type="file"
          accept="application/json"
          className="hidden"
          onChange={handleImportFileChange}
        />

        <ExamResultView
          session={state.activeExamSession}
          onDownloadMarkdown={() => handleDownloadExamMarkdown(state.activeExamSession!)}
          onDownloadPdf={() => handleDownloadExamPdf(state.activeExamSession!)}
          onBackToSetup={() => {
            setState(prev => ({ ...prev, activeExamSession: null }));
            setExamView('setup');
          }}
        />

        <footer className="mt-8 md:mt-12 text-slate-400 text-xs sm:text-sm text-center px-4">
          Powered by Google Gemini 3
        </footer>
      </div>
    );
  }

  // ── Render: Main input form ──
  return (
    <div className="min-h-screen bg-gradient-to-br from-indigo-50 via-white to-purple-50 flex flex-col items-center p-3 sm:p-4 md:p-8">
      
      {/* Header */}
      <header className="w-full max-w-4xl mb-6 md:mb-8 flex items-start justify-between gap-3 sm:items-center">
        <div className="flex min-w-0 flex-1 items-center gap-3">
          <div className="bg-indigo-600 p-2.5 sm:p-3 rounded-xl shadow-lg shadow-indigo-200">
            <Calculator className="w-6 h-6 sm:w-8 sm:h-8 text-white" />
          </div>
          <div className="min-w-0">
            <h1 className="text-xl sm:text-3xl font-extrabold text-slate-800 tracking-tight leading-tight">Mathe Erklaerer</h1>
            <p className="text-xs sm:text-sm text-slate-500">Dein persönlicher Schritt-für-Schritt Tutor</p>
          </div>
        </div>
        <button
          onClick={() => setSettingsOpen(true)}
          className="self-start sm:self-auto shrink-0 p-2.5 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 bg-white/90 border border-slate-200 rounded-full shadow-sm transition-all"
          title="Einstellungen"
        >
          <Settings className="w-5 h-5" />
        </button>
      </header>

      <SettingsModal
        isOpen={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        onExport={handleExportData}
        onImportClick={handleImportClick}
      />
      <input
        ref={importFileInputRef}
        type="file"
        accept="application/json"
        className="hidden"
        onChange={handleImportFileChange}
      />

      {/* Main Card */}
      <main className="w-full max-w-4xl bg-white rounded-2xl sm:rounded-3xl shadow-xl overflow-hidden border border-slate-100 transition-all mb-8 md:mb-12">
        
        {/* Input Section */}
        <div className="p-4 sm:p-6 md:p-8 bg-white">
          
          {/* Tabs */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5 sm:gap-2 mb-5 sm:mb-6 bg-slate-100 p-1 rounded-xl w-full">
            <button
              onClick={() => handleModeChange(InputMode.TEXT)}
              className={`flex items-center justify-center gap-1.5 sm:gap-2 px-2 sm:px-4 py-2.5 sm:py-3 rounded-lg text-xs sm:text-sm font-semibold transition-all duration-200 ${
                state.inputMode === InputMode.TEXT
                  ? 'bg-white text-indigo-600 shadow-sm'
                  : 'text-slate-500 hover:text-slate-700 hover:bg-slate-200/50'
              }`}
            >
              <Type className="w-4 h-4" />
              <span className="sm:hidden">Loesen</span>
              <span className="hidden sm:inline">{'Aufgabe L\u00f6sen'}</span>
            </button>
            <button
              onClick={() => handleModeChange(InputMode.TUTOR)}
              className={`flex items-center justify-center gap-1.5 sm:gap-2 px-2 sm:px-4 py-2.5 sm:py-3 rounded-lg text-xs sm:text-sm font-semibold transition-all duration-200 ${
                state.inputMode === InputMode.TUTOR
                  ? 'bg-white text-indigo-600 shadow-sm'
                  : 'text-slate-500 hover:text-slate-700 hover:bg-slate-200/50'
              }`}
            >
              <GraduationCap className="w-4 h-4" />
              <span className="sm:hidden">Tutor</span>
              <span className="hidden sm:inline">Tutor-Modus</span>
            </button>
            <button
              onClick={() => handleModeChange(InputMode.PRACTICE)}
              className={`flex items-center justify-center gap-1.5 sm:gap-2 px-2 sm:px-4 py-2.5 sm:py-3 rounded-lg text-xs sm:text-sm font-semibold transition-all duration-200 ${
                state.inputMode === InputMode.PRACTICE
                  ? 'bg-white text-indigo-600 shadow-sm'
                  : 'text-slate-500 hover:text-slate-700 hover:bg-slate-200/50'
              }`}
            >
              <Dumbbell className="w-4 h-4" />
              <span className="sm:hidden">Ueben</span>
              <span className="hidden sm:inline">{'Aufgaben \u00fcben'}</span>
            </button>
            <button
              onClick={() => handleModeChange(InputMode.EXAM)}
              className={`flex items-center justify-center gap-1.5 sm:gap-2 px-2 sm:px-4 py-2.5 sm:py-3 rounded-lg text-xs sm:text-sm font-semibold transition-all duration-200 ${
                state.inputMode === InputMode.EXAM
                  ? 'bg-white text-indigo-600 shadow-sm'
                  : 'text-slate-500 hover:text-slate-700 hover:bg-slate-200/50'
              }`}
            >
              <ClipboardCheck className="w-4 h-4" />
              <span className="sm:hidden">Pruefung</span>
              <span className="hidden sm:inline">{'Pr\u00fcfungsmodus'}</span>
            </button>
          </div>

          {/* Aufgabe (Text + optional Foto) */}
          {state.inputMode === InputMode.TEXT && (
            <div className="space-y-4">
              <textarea
                value={state.textInput}
                onChange={handleTextChange}
                onPaste={handlePaste}
                placeholder="Gib hier deine Matheaufgabe ein (z.B. 'Löse die Gleichung x^2 - 4 = 0') oder lade ein Foto der Aufgabe hoch … Tipp: Bild mit Strg+V einfügen!"
                className="w-full h-36 sm:h-32 p-4 bg-slate-50 rounded-2xl border border-slate-200 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200 focus:bg-white transition-all resize-none text-slate-700 text-base sm:text-lg placeholder:text-slate-400"
              />
              {!state.imagePreview ? (
                <div
                  onClick={() => fileInputRef.current?.click()}
                  className="w-full h-32 border-2 border-dashed border-slate-300 rounded-2xl flex flex-col items-center justify-center bg-slate-50 hover:bg-indigo-50 hover:border-indigo-400 transition-all cursor-pointer group"
                >
                  <ImageIcon className="w-6 h-6 text-indigo-500 mb-2 group-hover:scale-110 transition-transform" />
                  <p className="text-slate-600 text-sm font-medium">Foto anhängen (optional)</p>
                  <p className="text-xs text-slate-400 mt-0.5">Klicken oder Strg+V · JPG, PNG, WEBP</p>
                </div>
              ) : (
                <div className="relative w-full rounded-2xl overflow-hidden border border-slate-200 bg-slate-900 group">
                  <img
                    src={state.imagePreview}
                    alt="Upload Preview"
                    className="w-full h-48 object-contain opacity-90"
                  />
                  <div className="absolute inset-0 bg-black/40 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                    <button
                      onClick={removeImage}
                      className="bg-white/20 backdrop-blur-md hover:bg-white/30 text-white p-3 rounded-full transition-colors"
                    >
                      <X className="w-6 h-6" />
                    </button>
                  </div>
                </div>
              )}
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={handleFileChange}
              />
            </div>
          )}

          {/* Tutor Input Mode */}
          {state.inputMode === InputMode.TUTOR && (
            <div className="space-y-4">
              <textarea
                value={state.textInput}
                onChange={handleTextChange}
                placeholder="Welches Thema soll ich dir beibringen? Beschreibe gerne dein Level (z.B. 'Noch nie gehört', 'Grundlagen bekannt', 'bitte ab Klasse 8 Niveau')."
                className="w-full h-44 sm:h-40 p-4 bg-slate-50 rounded-2xl border border-slate-200 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200 focus:bg-white transition-all resize-none text-slate-700 text-base sm:text-lg placeholder:text-slate-400"
              />
            </div>
          )}

          {/* Practice Input Mode */}
          {state.inputMode === InputMode.PRACTICE && (
            <PracticeSetup
              onStart={handlePracticeStart}
              isLoading={isPracticeGenerating}
            />
          )}

          {state.inputMode === InputMode.EXAM && (
            <ExamSetup
              onStart={handleExamStart}
              isLoading={isExamGenerating}
            />
          )}

          {/* Error Message */}
          {state.error && state.inputMode !== InputMode.PRACTICE && state.inputMode !== InputMode.EXAM && (
            <div className="mt-4 p-3 bg-red-50 border border-red-100 rounded-lg flex items-center space-x-2 text-red-600 text-sm">
              <X className="w-4 h-4" />
              <span>{state.error}</span>
            </div>
          )}

          {/* Submit Button (only for TEXT and TUTOR) */}
          {state.inputMode !== InputMode.PRACTICE && state.inputMode !== InputMode.EXAM && (
            <div className="mt-6 flex justify-end">
              <button
                onClick={handleSubmit}
                disabled={
                  (state.inputMode === InputMode.TUTOR && !state.textInput.trim()) ||
                  (state.inputMode === InputMode.TEXT && (state.isLoading || (!state.textInput.trim() && !state.imageFile)))
                }
                className="w-full sm:w-auto justify-center bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed text-white px-6 sm:px-8 py-3.5 rounded-xl font-bold text-base sm:text-lg shadow-lg shadow-indigo-200 flex items-center space-x-2 transition-all active:scale-95"
              >
                {state.isLoading ? (
                  <>
                    <Loader2 className="w-5 h-5 animate-spin" />
                    <span>{state.inputMode === InputMode.TUTOR ? 'Erstelle Tutor-Lektion...' : 'Löse Aufgabe...'}</span>
                  </>
                ) : (
                  <>
                    <Send className="w-5 h-5" />
                    <span>{state.inputMode === InputMode.TUTOR ? 'Tutor starten' : 'Aufgabe Lösen'}</span>
                  </>
                )}
              </button>
            </div>
          )}

          {/* Practice error (shown inside PracticeSetup area) */}
          {state.error && (state.inputMode === InputMode.PRACTICE || state.inputMode === InputMode.EXAM) && (
            <div className="mt-4 p-3 bg-red-50 border border-red-100 rounded-lg flex items-center space-x-2 text-red-600 text-sm">
              <X className="w-4 h-4" />
              <span>{state.error}</span>
            </div>
          )}
        </div>
        
        {/* Loading State Visualization */}
        {state.isLoading && state.inputMode === InputMode.TEXT && (
          <div className="p-8 sm:p-12 text-center bg-slate-50/50 border-t border-slate-100">
             <div className="inline-block relative w-20 h-20">
               <div className="absolute top-0 left-0 w-full h-full border-4 border-indigo-100 rounded-full animate-pulse"></div>
               <div className="absolute top-0 left-0 w-full h-full border-t-4 border-indigo-600 rounded-full animate-spin"></div>
             </div>
             <p className="mt-6 text-indigo-900 font-medium animate-pulse">
               Die KI analysiert deine Aufgabe und berechnet die Schritte...
             </p>
          </div>
        )}

      </main>

      {/* Practice Rooms Section */}
      {state.inputMode === InputMode.PRACTICE && practiceRooms.length > 0 && !isPracticeGenerating && (
        <section className="w-full max-w-4xl animate-in slide-in-from-bottom-8 fade-in duration-500 mb-8">
          <div className="flex items-center justify-between mb-4 px-1 sm:px-2 gap-2">
            <h3 className="text-xl font-bold text-slate-700 flex items-center gap-2">
              <BookOpen className="w-5 h-5 text-amber-500" />
              Deine Lernräume
            </h3>
          </div>
          <div className="grid gap-3 sm:gap-4 md:grid-cols-1">
            {practiceRooms.map(room => (
              <PracticeRoomCard
                key={room.id}
                room={room}
                onClick={() => handleOpenRoom(room)}
                onDelete={(e) => handleDeleteRoom(e, room.id)}
              />
            ))}
          </div>
        </section>
      )}

      {state.inputMode === InputMode.EXAM && state.examSessions.length > 0 && !isExamGenerating && (
        <section className="w-full max-w-4xl animate-in slide-in-from-bottom-8 fade-in duration-500 mb-8">
          <div className="flex items-center justify-between mb-4 px-1 sm:px-2 gap-2">
            <h3 className="text-xl font-bold text-slate-700 flex items-center gap-2">
              <ClipboardCheck className="w-5 h-5 text-rose-500" />
              Letzte Prüfungen
            </h3>
          </div>
          <div className="grid gap-3 sm:gap-4 md:grid-cols-1">
            {state.examSessions.slice(0, 8).map(session => (
              <button
                key={session.id}
                onClick={() => handleOpenExamSession(session)}
                className="w-full text-left bg-white p-4 sm:p-5 rounded-2xl shadow-sm border border-slate-100 hover:shadow-md hover:border-indigo-200 transition-all"
              >
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="font-semibold text-slate-800">{session.topic}</p>
                    <p className="text-sm text-slate-500 mt-0.5">
                      {session.taskCount} Aufgaben · {session.durationMinutes} Min · {session.difficulty}
                    </p>
                  </div>
                  {session.status === 'completed' ? (
                    <span className="text-xs font-semibold px-2 py-1 rounded-full bg-emerald-50 text-emerald-700">
                      {session.scorePercent ?? 0}%
                    </span>
                  ) : (
                    <span className="text-xs font-semibold px-2 py-1 rounded-full bg-amber-50 text-amber-700">
                      Offen
                    </span>
                  )}
                </div>
              </button>
            ))}
          </div>
        </section>
      )}

      {/* History Section */}
      {state.inputMode !== InputMode.PRACTICE && state.inputMode !== InputMode.EXAM && (() => {
        const filteredHistory = history.filter(item =>
          state.inputMode === InputMode.TUTOR
            ? item.mode === InputMode.TUTOR
            : item.mode === InputMode.TEXT || item.mode === InputMode.IMAGE
        );
        return filteredHistory.length > 0 && (
        <section className="w-full max-w-4xl animate-in slide-in-from-bottom-8 fade-in duration-500">
           <div className="flex items-center justify-between mb-4 px-1 sm:px-2 gap-2">
             <h3 className="text-xl font-bold text-slate-700 flex items-center gap-2">
               <Clock className="w-5 h-5 text-indigo-500" />
               Verlauf
             </h3>
             <button 
               onClick={clearHistory}
               className="text-xs text-red-400 hover:text-red-600 flex items-center gap-1 px-3 py-1.5 rounded-full hover:bg-red-50 transition-colors"
             >
               <Trash2 className="w-3 h-3" />
               Verlauf löschen
             </button>
           </div>
           
           <div className="grid gap-3 sm:gap-4 md:grid-cols-1">
             {filteredHistory.map((item) => (
               <div 
                  key={item.id}
                  onClick={() => handleHistoryRestore(item)}
                  className="bg-white p-4 sm:p-5 rounded-2xl shadow-sm border border-slate-100 hover:shadow-md hover:border-indigo-200 transition-all cursor-pointer group flex items-start justify-between gap-2"
               >
                 <div className="flex-1 min-w-0 pr-4">
                   <div className="flex items-center gap-2 mb-2">
                      <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wider ${
                        item.mode === InputMode.IMAGE
                          ? 'bg-purple-100 text-purple-700'
                          : item.mode === InputMode.TUTOR
                          ? 'bg-emerald-100 text-emerald-700'
                          : 'bg-blue-100 text-blue-700'
                      }`}>
                        {item.mode === InputMode.IMAGE ? 'Foto' : item.mode === InputMode.TUTOR ? 'Tutor' : 'Text'}
                      </span>
                      {item.mode === InputMode.TUTOR && item.status === 'processing' && (
                        <span className="text-[10px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wider bg-amber-100 text-amber-700">
                          {clampPercent(item.progress ?? 0)}%
                        </span>
                      )}
                      {item.mode === InputMode.TUTOR && item.status === 'failed' && (
                        <span className="text-[10px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wider bg-red-100 text-red-700">
                          Fehler
                        </span>
                      )}
                      <span className="text-xs text-slate-400">
                        {new Date(item.timestamp).toLocaleDateString()} • {new Date(item.timestamp).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}
                      </span>
                   </div>
                   
                   {/* Prompt with LaTeX Support */}
                   <div className="font-semibold text-slate-800 mb-1 line-clamp-1">
                      <MathRenderer content={item.prompt} />
                   </div>
                   
                   {/* Preview / Result with LaTeX Support */}
                   <div className="text-sm text-slate-500 line-clamp-2">
                      <span className="font-medium text-slate-400 mr-1">Ergebnis:</span>
                      <MathRenderer content={item.preview} />
                   </div>
                 </div>
                 
                  <div className="flex flex-col items-end gap-2">
                     {item.mode === InputMode.TUTOR && item.status === 'completed' && (
                       <button
                         onClick={(e) => {
                           e.stopPropagation();
                           handleHistoryRestore(item, 'summary');
                         }}
                         className="px-3 py-1.5 text-xs font-semibold text-indigo-600 bg-indigo-50 hover:bg-indigo-100 rounded-full transition-colors"
                         title="Direkt zur Uebersicht"
                       >
                         Uebersicht
                       </button>
                     )}
                     <button 
                       onClick={(e) => deleteHistoryItem(e, item.id)}
                       className="p-2 text-slate-300 hover:text-red-500 hover:bg-red-50 rounded-full transition-colors opacity-100 sm:opacity-0 sm:group-hover:opacity-100"
                      title="Eintrag löschen"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                    <div className="p-2 text-indigo-300 group-hover:text-indigo-600 transition-colors">
                      <ChevronRight className="w-5 h-5" />
                    </div>
                 </div>
               </div>
             ))}
           </div>
        </section>
      );})()}
      
      <footer className="mt-8 md:mt-12 text-slate-400 text-xs sm:text-sm text-center px-4">
        Powered by Google Gemini 3
      </footer>
    </div>
  );
};

export default App;

