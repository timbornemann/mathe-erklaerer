import React, { useState, useRef, useCallback, useEffect } from 'react';
import { solveMathProblem, resumeTutorSolution } from './services/gemini';
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
import PrintExportPage from './components/PrintExportPage';
import { MathState, InputMode, HistoryItem, MathSolution, PracticeRoom, PracticeTask, ExamSession as ExamSessionType, ExamTask, HistoryStatus, Project } from './types';
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
  Download,
  ChevronDown,
  ChevronRight,
  GraduationCap,
  Dumbbell,
  BookOpen,
  Folder,
  Plus,
  Pencil,
  Settings,
  ClipboardCheck
} from 'lucide-react';
import SettingsModal from './components/SettingsModal';

const PRACTICE_ROOMS_KEY = 'mathPracticeRooms';
const EXAM_SESSIONS_KEY = 'mathExamSessions';
const HISTORY_STORAGE_KEY = 'mathGeniusHistory';
const PROJECTS_STORAGE_KEY = 'mathProjects';
const ACTIVE_PROJECT_STORAGE_KEY = 'mathActiveProjectId';

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
type MainTab = InputMode.TEXT | InputMode.TUTOR | InputMode.PRACTICE | InputMode.EXAM | 'PROJECTS';
type ProjectsView = 'folders' | 'detail';

interface ProjectFormState {
  name: string;
  description: string;
  color: string;
}

const DEFAULT_PROJECT_COLOR = '#4f46e5';
const DETAIL_ACTION_BUTTON_BASE_CLASS =
  'inline-flex h-8 w-28 items-center justify-center gap-1.5 rounded-lg px-3 text-[11px] font-semibold transition-colors';
const PROJECT_HEADER_ACTION_BUTTON_CLASS =
  'inline-flex h-9 min-w-[132px] items-center justify-center gap-1.5 rounded-lg px-3 text-xs font-semibold transition-colors';
const PROJECT_DETAIL_MAX_WIDTH_CLASS = 'max-w-[2100px]';

const normalizeProjectColor = (value?: string): string => {
  if (!value) return DEFAULT_PROJECT_COLOR;
  const trimmed = value.trim();
  const shortHexMatch = /^#([a-fA-F0-9]{3})$/;
  const longHexMatch = /^#([a-fA-F0-9]{6})$/;

  if (longHexMatch.test(trimmed)) {
    return trimmed.toLowerCase();
  }

  const shortMatch = trimmed.match(shortHexMatch);
  if (shortMatch) {
    const [r, g, b] = shortMatch[1].split('');
    return `#${r}${r}${g}${g}${b}${b}`.toLowerCase();
  }

  return DEFAULT_PROJECT_COLOR;
};

const parseHexColor = (hexColor: string): [number, number, number] => {
  const normalized = normalizeProjectColor(hexColor);
  return [
    parseInt(normalized.slice(1, 3), 16),
    parseInt(normalized.slice(3, 5), 16),
    parseInt(normalized.slice(5, 7), 16)
  ];
};

const adjustHexColor = (hexColor: string, amount: number): string => {
  const [r, g, b] = parseHexColor(hexColor);
  const clampByte = (value: number) => Math.max(0, Math.min(255, Math.round(value)));

  const adjustChannel = (value: number): number => {
    if (amount >= 0) {
      return clampByte(value + (255 - value) * amount);
    }
    return clampByte(value * (1 + amount));
  };

  return `#${[adjustChannel(r), adjustChannel(g), adjustChannel(b)]
    .map(channel => channel.toString(16).padStart(2, '0'))
    .join('')}`;
};

const withHexAlpha = (hexColor: string, alpha: number): string => {
  const normalized = normalizeProjectColor(hexColor);
  const clampedAlpha = Math.max(0, Math.min(1, alpha));
  const alphaHex = Math.round(clampedAlpha * 255)
    .toString(16)
    .padStart(2, '0');
  return `${normalized}${alphaHex}`;
};

const clampPercent = (value: number): number => {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(100, Math.round(value)));
};

const computeTutorProgress = (solution: MathSolution): number => {
  const total = solution.steps.length;
  if (total === 0) return 0;
  const completed = solution.steps.filter(step => step.loading !== true && !step.generationError).length;
  return clampPercent((completed / total) * 100);
};

const getTutorRetryStartIndex = (solution: MathSolution): number =>
  solution.steps.findIndex(step => step.loading === true || !!step.generationError);

const hasTutorRetryableSteps = (solution: MathSolution): boolean => getTutorRetryStartIndex(solution) >= 0;

const buildTutorPreview = (status: HistoryStatus, progress: number, solution?: MathSolution, error?: string): string => {
  const unresolvedCount = solution
    ? solution.steps.filter(step => step.loading === true || !!step.generationError).length
    : 0;

  if (status === 'failed') {
    if (unresolvedCount > 0) {
      return `Tutor-Lektion teilweise erstellt. ${unresolvedCount} Lektion(en) offen - bitte Retry klicken.`;
    }
    return error || 'Tutor-Lektion konnte nicht erstellt werden.';
  }

  if (status === 'completed' && solution) {
    if (unresolvedCount > 0) {
      return `Tutor-Lektion teilweise erstellt. ${unresolvedCount} Lektion(en) offen - bitte Retry klicken.`;
    }
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
    projects: [],
    activeProjectId: null,
    practiceRooms: [],
    activePracticeRoom: null,
    examSessions: [],
    activeExamSession: null
  });

  const [activeMainTab, setActiveMainTab] = useState<MainTab>(InputMode.TEXT);
  const [practiceView, setPracticeView] = useState<PracticeView>('setup');
  const [currentPracticeTask, setCurrentPracticeTask] = useState<PracticeTask | null>(null);
  const [isPracticeGenerating, setIsPracticeGenerating] = useState(false);
  const [examView, setExamView] = useState<ExamView>('setup');
  const [isExamGenerating, setIsExamGenerating] = useState(false);
  const [isExamSubmitting, setIsExamSubmitting] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [activeSolutionHistoryId, setActiveSolutionHistoryId] = useState<string | null>(null);
  const [solutionOpenView, setSolutionOpenView] = useState<SolutionOpenView>('start');
  const [openHistoryDownloadMenuId, setOpenHistoryDownloadMenuId] = useState<string | null>(null);
  const [retryingHistoryId, setRetryingHistoryId] = useState<string | null>(null);
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null);
  const [projectsView, setProjectsView] = useState<ProjectsView>('folders');
  const [projectModalOpen, setProjectModalOpen] = useState(false);
  const [editingProjectId, setEditingProjectId] = useState<string | null>(null);
  const [projectForm, setProjectForm] = useState<ProjectFormState>({
    name: '',
    description: '',
    color: DEFAULT_PROJECT_COLOR
  });
  const printExportKey =
    typeof window !== 'undefined'
      ? new URLSearchParams(window.location.search).get('printExport')
      : null;

  const fileInputRef = useRef<HTMLInputElement>(null);
  const importFileInputRef = useRef<HTMLInputElement>(null);
  const activeSolutionHistoryIdRef = useRef<string | null>(null);

  const history = state.history ?? [];
  const projects = state.projects ?? [];
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

    const savedProjects = localStorage.getItem(PROJECTS_STORAGE_KEY);
    if (savedProjects) {
      try {
        updates.projects = JSON.parse(savedProjects);
      } catch (e) {
        console.error("Failed to parse projects", e);
      }
    }

    const savedActiveProjectId = localStorage.getItem(ACTIVE_PROJECT_STORAGE_KEY);
    if (savedActiveProjectId) {
      updates.activeProjectId = savedActiveProjectId;
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
      setState(prev => {
        const merged = { ...prev, ...updates };
        const knownIds = new Set((merged.projects ?? []).map(project => project.id));
        if (merged.activeProjectId && !knownIds.has(merged.activeProjectId)) {
          merged.activeProjectId = null;
          localStorage.removeItem(ACTIVE_PROJECT_STORAGE_KEY);
        }
        return merged;
      });
    }
  }, []);

  useEffect(() => {
    if (!openHistoryDownloadMenuId) return;

    const handleDocumentClick = (event: MouseEvent) => {
      const target = event.target as HTMLElement | null;
      if (target?.closest('[data-history-download-menu]')) return;
      setOpenHistoryDownloadMenuId(null);
    };

    document.addEventListener('click', handleDocumentClick);
    return () => document.removeEventListener('click', handleDocumentClick);
  }, [openHistoryDownloadMenuId]);

  useEffect(() => {
    if (selectedProjectId && projects.some(project => project.id === selectedProjectId)) {
      return;
    }
    setSelectedProjectId(projects[0]?.id ?? null);
  }, [projects, selectedProjectId]);

  useEffect(() => {
    if (activeMainTab !== 'PROJECTS') return;
    if (projectsView !== 'detail') return;
    if (!selectedProjectId || !projects.some(project => project.id === selectedProjectId)) {
      setProjectsView('folders');
    }
  }, [activeMainTab, projects, projectsView, selectedProjectId]);

  const savePracticeRooms = useCallback((rooms: PracticeRoom[]) => {
    localStorage.setItem(PRACTICE_ROOMS_KEY, JSON.stringify(rooms));
  }, []);

  const saveExamSessions = useCallback((sessions: ExamSessionType[]) => {
    localStorage.setItem(EXAM_SESSIONS_KEY, JSON.stringify(sessions));
  }, []);

  const saveProjects = useCallback((projectItems: Project[]) => {
    localStorage.setItem(PROJECTS_STORAGE_KEY, JSON.stringify(projectItems));
  }, []);

  const saveActiveProjectId = useCallback((projectId: string | null) => {
    if (projectId) {
      localStorage.setItem(ACTIVE_PROJECT_STORAGE_KEY, projectId);
      return;
    }
    localStorage.removeItem(ACTIVE_PROJECT_STORAGE_KEY);
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

  const handleActiveProjectChange = useCallback((projectId: string | null) => {
    setState(prev => ({ ...prev, activeProjectId: projectId }));
    saveActiveProjectId(projectId);
  }, [saveActiveProjectId]);

  const assignPracticeRoomToProject = useCallback((roomId: string, projectId: string | null) => {
    setState(prev => {
      let updatedActivePracticeRoom = prev.activePracticeRoom;
      const rooms = prev.practiceRooms.map(room => {
        if (room.id !== roomId) return room;
        const nextRoom: PracticeRoom = projectId ? { ...room, projectId } : { ...room };
        if (!projectId) {
          delete nextRoom.projectId;
        }
        if (updatedActivePracticeRoom?.id === room.id) {
          updatedActivePracticeRoom = nextRoom;
        }
        return nextRoom;
      });
      savePracticeRooms(rooms);
      return {
        ...prev,
        practiceRooms: rooms,
        activePracticeRoom: updatedActivePracticeRoom
      };
    });
  }, [savePracticeRooms]);

  const assignExamSessionToProject = useCallback((sessionId: string, projectId: string | null) => {
    setState(prev => {
      let updatedActiveExamSession = prev.activeExamSession;
      const sessions = prev.examSessions.map(session => {
        if (session.id !== sessionId) return session;
        const nextSession: ExamSessionType = projectId ? { ...session, projectId } : { ...session };
        if (!projectId) {
          delete nextSession.projectId;
        }
        if (updatedActiveExamSession?.id === session.id) {
          updatedActiveExamSession = nextSession;
        }
        return nextSession;
      });
      saveExamSessions(sessions);
      return {
        ...prev,
        examSessions: sessions,
        activeExamSession: updatedActiveExamSession
      };
    });
  }, [saveExamSessions]);

  const resetProjectForm = () => {
    setEditingProjectId(null);
    setProjectForm({
      name: '',
      description: '',
      color: DEFAULT_PROJECT_COLOR
    });
  };

  const closeProjectModal = () => {
    setProjectModalOpen(false);
    resetProjectForm();
  };

  const startCreateProject = () => {
    resetProjectForm();
    setProjectModalOpen(true);
  };

  const startEditProject = (project: Project) => {
    setEditingProjectId(project.id);
    setProjectForm({
      name: project.name,
      description: project.description,
      color: project.color || DEFAULT_PROJECT_COLOR
    });
    setProjectModalOpen(true);
  };

  const saveProjectForm = () => {
    const name = projectForm.name.trim();
    if (!name) {
      window.alert('Bitte gib einen Projektnamen ein.');
      return;
    }

    const now = Date.now();

    setState(prev => {
      let updatedProjects: Project[];
      let selectedIdAfterSave: string | null = null;

      if (editingProjectId) {
        updatedProjects = prev.projects.map(project => {
          if (project.id !== editingProjectId) return project;
          selectedIdAfterSave = project.id;
          return {
            ...project,
            name,
            description: projectForm.description.trim(),
            color: projectForm.color || DEFAULT_PROJECT_COLOR,
            updatedAt: now
          };
        });
      } else {
        const newProject: Project = {
          id: generateId(),
          name,
          description: projectForm.description.trim(),
          color: projectForm.color || DEFAULT_PROJECT_COLOR,
          createdAt: now,
          updatedAt: now
        };
        updatedProjects = [newProject, ...prev.projects];
        selectedIdAfterSave = newProject.id;
      }

      saveProjects(updatedProjects);
      if (selectedIdAfterSave) {
        setSelectedProjectId(selectedIdAfterSave);
      }

      return {
        ...prev,
        projects: updatedProjects
      };
    });

    setProjectModalOpen(false);
    resetProjectForm();
  };

  const handleDeleteProject = (projectId: string) => {
    const project = projects.find(entry => entry.id === projectId);
    if (!project) return;

    if (!window.confirm(`Projekt "${project.name}" wirklich loeschen? Inhalte bleiben erhalten und werden nur entkoppelt.`)) {
      return;
    }

    setState(prev => {
      const nextProjects = prev.projects.filter(entry => entry.id !== projectId);

      const nextHistory = prev.history.map(item => {
        if (item.projectId !== projectId) return item;
        const nextItem: HistoryItem = { ...item };
        delete nextItem.projectId;
        return nextItem;
      });

      const nextPracticeRooms = prev.practiceRooms.map(room => {
        if (room.projectId !== projectId) return room;
        const nextRoom: PracticeRoom = { ...room };
        delete nextRoom.projectId;
        return nextRoom;
      });

      const nextExamSessions = prev.examSessions.map(session => {
        if (session.projectId !== projectId) return session;
        const nextSession: ExamSessionType = { ...session };
        delete nextSession.projectId;
        return nextSession;
      });

      const nextActiveProjectId = prev.activeProjectId === projectId ? null : prev.activeProjectId;

      saveProjects(nextProjects);
      persistHistory(nextHistory);
      savePracticeRooms(nextPracticeRooms);
      saveExamSessions(nextExamSessions);
      saveActiveProjectId(nextActiveProjectId);

      return {
        ...prev,
        projects: nextProjects,
        activeProjectId: nextActiveProjectId,
        history: nextHistory,
        practiceRooms: nextPracticeRooms,
        examSessions: nextExamSessions,
        activePracticeRoom: prev.activePracticeRoom?.id && prev.activePracticeRoom.projectId === projectId
          ? { ...prev.activePracticeRoom, projectId: undefined }
          : prev.activePracticeRoom,
        activeExamSession: prev.activeExamSession?.id && prev.activeExamSession.projectId === projectId
          ? { ...prev.activeExamSession, projectId: undefined }
          : prev.activeExamSession
      };
    });

    if (selectedProjectId === projectId) {
      setSelectedProjectId(null);
      setProjectsView('folders');
    }
    if (editingProjectId === projectId) {
      closeProjectModal();
    }
  };

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

  const assignHistoryItemToProject = useCallback((historyId: string, projectId: string | null) => {
    updateHistoryItem(historyId, (item) => {
      if (projectId) {
        return { ...item, projectId };
      }
      const nextItem: HistoryItem = { ...item };
      delete nextItem.projectId;
      return nextItem;
    });
  }, [updateHistoryItem]);

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
    setActiveMainTab(mode);
    setProjectsView('folders');
    setProjectModalOpen(false);
    setActiveHistoryId(null);
    setSolutionOpenView('start');
    setOpenHistoryDownloadMenuId(null);
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

  const handleProjectsTabOpen = () => {
    setActiveMainTab('PROJECTS');
    setProjectsView('folders');
    setActiveHistoryId(null);
    setSolutionOpenView('start');
    setOpenHistoryDownloadMenuId(null);
    setState(prev => ({ ...prev, solution: null, error: null }));
    setProjectModalOpen(false);
    if (!selectedProjectId && projects.length > 0) {
      setSelectedProjectId(projects[0].id);
    }
  };

  const openProjectDetail = (projectId: string) => {
    setSelectedProjectId(projectId);
    setProjectsView('detail');
  };

  const handleTextChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setState(prev => ({ ...prev, textInput: e.target.value }));
  };

  const handleReset = () => {
    const nextMode = state.inputMode === InputMode.IMAGE ? InputMode.TEXT : state.inputMode;

    setActiveMainTab(nextMode);
    setProjectsView('folders');
    setProjectModalOpen(false);
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
    setOpenHistoryDownloadMenuId(null);
  };

  const handleHistoryRestore = (item: HistoryItem, openView: SolutionOpenView = 'start') => {
    setOpenHistoryDownloadMenuId(null);
    setActiveHistoryId(item.id);
    setSolutionOpenView(openView);
    setActiveMainTab(item.mode);
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
        setState(prev => ({ ...prev, error: "Bitte wÃ¤hle eine gÃ¼ltige Bilddatei." }));
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
    const exportData = buildExportData(
      history,
      projects,
      state.activeProjectId ?? null,
      practiceRooms,
      state.examSessions ?? []
    );
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
        const hasProjectConflicts = (state.projects ?? []).some(existing =>
          (imported.projects ?? []).some(project => project.id === existing.id)
        );
        const hasRoomConflicts = (state.practiceRooms ?? []).some(existing =>
          imported.practiceRooms.some(room => room.id === existing.id)
        );
        const hasExamConflicts = (state.examSessions ?? []).some(existing =>
          imported.examSessions.some(session => session.id === existing.id)
        );
        const hasConflicts = hasHistoryConflicts || hasProjectConflicts || hasRoomConflicts || hasExamConflicts;

        const message = hasConflicts
          ? 'Beim Import wurden ueberschneidende Daten gefunden.\n\nOK = Daten intelligent ZUSAMMENFUEHREN (Duplikate vermeiden).\nAbbrechen = aktuelle Daten komplett durch Import ERSETZEN.'
          : 'Wie moechtest du importieren?\n\nOK = intelligent zusammenfuehren (Duplikate vermeiden).\nAbbrechen = aktuelle Daten komplett ersetzen.';

        const merge = window.confirm(message);
        const strategy: ImportStrategy = merge ? 'merge' : 'replace';

        setState(prev => {
          const {
            history: newHistory,
            projects: newProjects,
            activeProjectId: newActiveProjectId,
            practiceRooms: newPracticeRooms,
            examSessions: newExamSessions
          } = applyImportData(
            prev.history ?? [],
            prev.projects ?? [],
            prev.activeProjectId ?? null,
            prev.practiceRooms ?? [],
            prev.examSessions ?? [],
            imported,
            strategy
          );

          localStorage.setItem(HISTORY_STORAGE_KEY, JSON.stringify(newHistory));
          localStorage.setItem(PROJECTS_STORAGE_KEY, JSON.stringify(newProjects));
          localStorage.setItem(PRACTICE_ROOMS_KEY, JSON.stringify(newPracticeRooms));
          localStorage.setItem(EXAM_SESSIONS_KEY, JSON.stringify(newExamSessions));
          saveActiveProjectId(newActiveProjectId);

          let newActivePracticeRoom = prev.activePracticeRoom;
          if (newActivePracticeRoom) {
            const stillExists = newPracticeRooms.find(r => r.id === newActivePracticeRoom!.id);
            if (!stillExists) {
              newActivePracticeRoom = null;
            }
          }

          let newActiveExamSession = prev.activeExamSession;
          if (newActiveExamSession) {
            const stillExists = newExamSessions.find(session => session.id === newActiveExamSession!.id);
            if (!stillExists) {
              newActiveExamSession = null;
            }
          }

          return {
            ...prev,
            history: newHistory,
            projects: newProjects,
            activeProjectId: newActiveProjectId,
            practiceRooms: newPracticeRooms,
            examSessions: newExamSessions,
            activePracticeRoom: newActivePracticeRoom,
            activeExamSession: newActiveExamSession
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

  const canDownloadHistoryItem = useCallback((item: HistoryItem): boolean => {
    if (item.mode === InputMode.TUTOR) {
      return item.status === 'completed';
    }
    return true;
  }, []);

  const handleDownloadHistoryItemMarkdown = useCallback((item: HistoryItem) => {
    if (!canDownloadHistoryItem(item)) return;
    try {
      downloadSolutionAsMarkdown(item.solution, item.prompt || 'Mathe-Aufgabe');
    } catch (error) {
      console.error(error);
      window.alert('Markdown-Export aus dem Verlauf fehlgeschlagen.');
    }
  }, [canDownloadHistoryItem]);

  const handleDownloadHistoryItemPdf = useCallback((item: HistoryItem) => {
    if (!canDownloadHistoryItem(item)) return;
    try {
      downloadSolutionAsPdf(item.solution, item.prompt || 'Mathe-Aufgabe');
    } catch (error: any) {
      console.error(error);
      window.alert(error?.message || 'PDF-Export aus dem Verlauf fehlgeschlagen.');
    }
  }, [canDownloadHistoryItem]);

  const handleRetryTutorHistory = useCallback((item: HistoryItem) => {
    if (item.mode !== InputMode.TUTOR) return;
    if (retryingHistoryId === item.id) return;

    const currentItem = (state.history ?? []).find(entry => entry.id === item.id) ?? item;
    const topic = (currentItem.prompt || '').trim() || 'Tutor-Lektion';
    const baseSolution = currentItem.solution ?? createTutorPlaceholderSolution(topic);
    const retryStartIndex = getTutorRetryStartIndex(baseSolution);

    if (retryStartIndex < 0 && currentItem.status !== 'failed') {
      return;
    }

    setRetryingHistoryId(item.id);
    setActiveHistoryId(item.id);
    setSolutionOpenView('start');
    setActiveMainTab(InputMode.TUTOR);
    setState(prev => ({
      ...prev,
      inputMode: InputMode.TUTOR,
      textInput: topic,
      solution: baseSolution,
      error: null
    }));

    const initialProgress = computeTutorProgress(baseSolution);
    updateHistoryItem(item.id, (entry) => ({
      ...entry,
      prompt: topic,
      solution: baseSolution,
      status: 'processing',
      progress: initialProgress,
      error: undefined,
      preview: buildTutorPreview('processing', initialProgress, baseSolution)
    }));

    void resumeTutorSolution(topic, baseSolution, {
      onTutorProgress: (partial: MathSolution) => {
        const progress = computeTutorProgress(partial);
        updateHistoryItem(item.id, (entry) => ({
          ...entry,
          solution: partial,
          status: 'processing',
          progress,
          error: undefined,
          preview: buildTutorPreview('processing', progress, partial)
        }));

        if (activeSolutionHistoryIdRef.current === item.id) {
          setState(prev => ({
            ...prev,
            solution: partial,
            error: null,
            inputMode: InputMode.TUTOR
          }));
        }
      }
    })
      .then((solution) => {
        const unresolved = hasTutorRetryableSteps(solution);
        const nextStatus: HistoryStatus = unresolved ? 'failed' : 'completed';
        const nextProgress = unresolved ? computeTutorProgress(solution) : 100;
        const nextError = unresolved
          ? 'Einige Lektionen konnten noch nicht erzeugt werden. Erneut auf Retry klicken.'
          : undefined;

        updateHistoryItem(item.id, (entry) => ({
          ...entry,
          solution,
          status: nextStatus,
          progress: nextProgress,
          error: nextError,
          preview: buildTutorPreview(nextStatus, nextProgress, solution, nextError)
        }));

        if (activeSolutionHistoryIdRef.current === item.id) {
          setState(prev => ({
            ...prev,
            solution,
            error: nextError ?? null,
            inputMode: InputMode.TUTOR
          }));
        }
      })
      .catch((error: any) => {
        const message = error?.message || 'Tutor-Retry fehlgeschlagen.';
        updateHistoryItem(item.id, (entry) => ({
          ...entry,
          status: 'failed',
          error: message,
          preview: buildTutorPreview('failed', entry.progress ?? 0, entry.solution, message)
        }));

        if (activeSolutionHistoryIdRef.current === item.id) {
          setState(prev => ({
            ...prev,
            error: message,
            inputMode: InputMode.TUTOR
          }));
        }
      })
      .finally(() => {
        setRetryingHistoryId((current) => (current === item.id ? null : current));
      });
  }, [retryingHistoryId, setActiveHistoryId, state.history, updateHistoryItem]);

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
        projectId: state.activeProjectId ?? undefined,
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
          const unresolved = hasTutorRetryableSteps(solution);
          const nextStatus: HistoryStatus = unresolved ? 'failed' : 'completed';
          const nextProgress = unresolved ? computeTutorProgress(solution) : 100;
          const nextError = unresolved
            ? 'Einige Lektionen konnten nicht erzeugt werden. Mit Retry ab der Fehlerstelle fortsetzen.'
            : undefined;

          updateHistoryItem(historyId, (item) => ({
            ...item,
            solution,
            status: nextStatus,
            progress: nextProgress,
            error: nextError,
            preview: buildTutorPreview(nextStatus, nextProgress, solution, nextError)
          }));

          if (activeSolutionHistoryIdRef.current === historyId) {
            setState(prev => ({
              ...prev,
              solution,
              error: nextError ?? null,
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
        projectId: state.activeProjectId ?? undefined,
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
  }, [state.isLoading, state.inputMode, state.textInput, state.imagePreview, state.imageFile, state.activeProjectId, saveToHistory, setActiveHistoryId, updateHistoryItem]);

  // â”€â”€ Practice Mode handlers â”€â”€

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
        projectId: state.activeProjectId ?? undefined,
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
        error: err.message || "NÃ¤chste Aufgabe konnte nicht erstellt werden."
      }));
    } finally {
      setIsPracticeGenerating(false);
    }
  };

  const handleOpenRoom = (room: PracticeRoom) => {
    setActiveMainTab(InputMode.PRACTICE);
    setState(prev => ({ ...prev, activePracticeRoom: room, inputMode: InputMode.PRACTICE }));
    setPracticeView('detail');
    setCurrentPracticeTask(null);
  };

  const handleDeleteRoom = (e: React.MouseEvent, roomId: string) => {
    e.stopPropagation();
    if (window.confirm("MÃ¶chtest du diesen Lernraum wirklich lÃ¶schen?")) {
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

  // â”€â”€ Exam Mode handlers â”€â”€

  const buildExamSummary = (scorePercent: number, correctCount: number, total: number): string => {
    if (scorePercent >= 90) return `Starke Leistung: $${correctCount}$ von $${total}$ Aufgaben korrekt.`;
    if (scorePercent >= 75) return `Gute Leistung: $${correctCount}$ von $${total}$ Aufgaben korrekt.`;
    if (scorePercent >= 60) return `Solide Basis: $${correctCount}$ von $${total}$ Aufgaben korrekt.`;
    return `AusbaufÃ¤hig: $${correctCount}$ von $${total}$ Aufgaben korrekt. Wiederhole die schwachen Themen gezielt.`;
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
          `Erstelle Aufgabe ${i + 1} von ${config.taskCount} fÃ¼r eine PrÃ¼fung.`
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
        projectId: state.activeProjectId ?? undefined,
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
        error: err.message || "PrÃ¼fungsaufgaben konnten nicht erstellt werden."
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
              aiFeedback: 'Aufgabe konnte nicht vollstÃ¤ndig bewertet werden.',
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
        error: err.message || 'PrÃ¼fung konnte nicht vollstÃ¤ndig ausgewertet werden.'
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
    setActiveMainTab(InputMode.EXAM);
    setState(prev => ({ ...prev, inputMode: InputMode.EXAM, activeExamSession: session }));
    if (session.status === 'completed') {
      setExamView('result');
      return;
    }
    setExamView('session');
  };

  const isProjectsTab = activeMainTab === 'PROJECTS';
  const selectedProject = projects.find(project => project.id === selectedProjectId) ?? null;
  const selectedProjectHistory = history.filter(item => item.projectId === selectedProjectId);
  const selectedProjectSolutionHistory = selectedProjectHistory.filter(
    item => item.mode === InputMode.TEXT || item.mode === InputMode.IMAGE
  );
  const selectedProjectTutorHistory = selectedProjectHistory.filter(item => item.mode === InputMode.TUTOR);
  const selectedProjectPracticeRooms = practiceRooms.filter(room => room.projectId === selectedProjectId);
  const selectedProjectExamSessions = (state.examSessions ?? []).filter(session => session.projectId === selectedProjectId);
  const isProjectDetailView = isProjectsTab && projectsView === 'detail';
  const pageMaxWidthClass = isProjectDetailView ? PROJECT_DETAIL_MAX_WIDTH_CLASS : 'max-w-4xl';
  const projectDetailListClass = 'space-y-2 xl:max-h-[520px] xl:overflow-y-auto xl:pr-1';

  if (printExportKey) {
    return <PrintExportPage exportKey={printExportKey} />;
  }

  // â”€â”€ Render: Solution view â”€â”€
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
              <p className="text-sm text-slate-500">ZurÃ¼ck zur Ãœbersicht</p>
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

  // â”€â”€ Render: Practice session â”€â”€
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
              <p className="text-sm text-slate-500">ZurÃ¼ck zur Ãœbersicht</p>
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

  // â”€â”€ Render: Practice room detail â”€â”€
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
              <p className="text-sm text-slate-500">ZurÃ¼ck zur Ãœbersicht</p>
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

  // â”€â”€ Render: Exam session â”€â”€
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
              <p className="text-sm text-slate-500">ZurÃ¼ck zur Ãœbersicht</p>
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

  // â”€â”€ Render: Exam result â”€â”€
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
              <p className="text-sm text-slate-500">ZurÃ¼ck zur Ãœbersicht</p>
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

  // â”€â”€ Render: Main input form â”€â”€
  return (
    <div
      className={`min-h-screen bg-gradient-to-br from-indigo-50 via-white to-purple-50 flex flex-col items-center ${
        isProjectDetailView ? 'p-3 sm:p-4 md:p-6' : 'p-3 sm:p-4 md:p-8'
      }`}
    >
      
      {/* Header */}
      <header className={`w-full ${pageMaxWidthClass} mb-6 md:mb-8 flex items-start justify-between gap-3 sm:items-center`}>
        <div className="flex min-w-0 flex-1 items-center gap-3">
          <div className="bg-indigo-600 p-2.5 sm:p-3 rounded-xl shadow-lg shadow-indigo-200">
            <Calculator className="w-6 h-6 sm:w-8 sm:h-8 text-white" />
          </div>
          <div className="min-w-0">
            <h1 className="text-xl sm:text-3xl font-extrabold text-slate-800 tracking-tight leading-tight">Mathe Erklaerer</h1>
            <p className="text-xs sm:text-sm text-slate-500">Dein persÃ¶nlicher Schritt-fÃ¼r-Schritt Tutor</p>
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

      {/* Main Area */}
      <main
        className={
          isProjectDetailView
            ? `w-full ${PROJECT_DETAIL_MAX_WIDTH_CLASS} mb-8 md:mb-12`
            : 'w-full max-w-4xl bg-white rounded-2xl sm:rounded-3xl shadow-xl overflow-hidden border border-slate-100 transition-all mb-8 md:mb-12'
        }
      >
        
        {/* Input Section */}
        <div className={isProjectDetailView ? 'space-y-6' : 'p-4 sm:p-6 md:p-8 bg-white'}>
          
          {!isProjectDetailView && (
            <>
              <div className="mb-4 sm:mb-5">
                <div className="space-y-1">
                  <label className="block text-xs font-semibold uppercase tracking-wide text-slate-500">
                    Aktives Projekt
                  </label>
                  <select
                    value={state.activeProjectId ?? ''}
                    onChange={(e) => handleActiveProjectChange(e.target.value || null)}
                    className="w-full p-2.5 bg-slate-50 rounded-xl border border-slate-200 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200 focus:bg-white transition-all text-sm text-slate-700"
                  >
                    <option value="">Kein aktives Projekt</option>
                    {projects.map(project => (
                      <option key={project.id} value={project.id}>
                        {project.name}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Tabs */}
              <div className="grid grid-cols-2 sm:grid-cols-5 gap-1.5 sm:gap-2 mb-5 sm:mb-6 bg-slate-100 p-1 rounded-xl w-full">
                <button
                  onClick={() => handleModeChange(InputMode.TEXT)}
                  className={`flex items-center justify-center gap-1.5 sm:gap-2 px-2 sm:px-4 py-2.5 sm:py-3 rounded-lg text-xs sm:text-sm font-semibold transition-all duration-200 ${
                    activeMainTab === InputMode.TEXT
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
                    activeMainTab === InputMode.TUTOR
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
                    activeMainTab === InputMode.PRACTICE
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
                    activeMainTab === InputMode.EXAM
                      ? 'bg-white text-indigo-600 shadow-sm'
                      : 'text-slate-500 hover:text-slate-700 hover:bg-slate-200/50'
                  }`}
                >
                  <ClipboardCheck className="w-4 h-4" />
                  <span className="sm:hidden">Pruefung</span>
                  <span className="hidden sm:inline">{'Pr\u00fcfungsmodus'}</span>
                </button>
                <button
                  onClick={handleProjectsTabOpen}
                  className={`flex items-center justify-center gap-1.5 sm:gap-2 px-2 sm:px-4 py-2.5 sm:py-3 rounded-lg text-xs sm:text-sm font-semibold transition-all duration-200 ${
                    isProjectsTab
                      ? 'bg-white text-indigo-600 shadow-sm'
                      : 'text-slate-500 hover:text-slate-700 hover:bg-slate-200/50'
                  }`}
                >
                  <Folder className="w-4 h-4" />
                  <span className="sm:hidden">Projekte</span>
                  <span className="hidden sm:inline">Projekte</span>
                </button>
              </div>
            </>
          )}

          {isProjectsTab && (
            <div className={isProjectDetailView ? 'space-y-6' : 'space-y-5'}>
              {projectsView === 'folders' ? (
                <div className="space-y-4">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <h3 className="text-base font-bold text-slate-800">Projektordner</h3>
                      <p className="text-xs text-slate-500">
                        Waehle einen Ordner aus, um alle Inhalte des Projekts im Detail zu sehen.
                      </p>
                    </div>
                    <button
                      onClick={startCreateProject}
                      className="inline-flex items-center gap-1.5 rounded-lg bg-indigo-600 px-3 py-2 text-xs font-semibold text-white hover:bg-indigo-700 transition-colors"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      Neues Projekt
                    </button>
                  </div>

                  {projects.length === 0 ? (
                    <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-6 text-center">
                      <Folder className="mx-auto mb-2 h-8 w-8 text-slate-400" />
                      <p className="text-sm font-semibold text-slate-700">Noch keine Projektordner vorhanden.</p>
                      <p className="mt-1 text-xs text-slate-500">Erstelle ein Projekt und sammle passende Inhalte aus allen vier Modi.</p>
                      <button
                        onClick={startCreateProject}
                        className="mt-4 inline-flex items-center gap-1.5 rounded-lg bg-indigo-600 px-3 py-2 text-xs font-semibold text-white hover:bg-indigo-700 transition-colors"
                      >
                        <Plus className="h-3.5 w-3.5" />
                        Projekt anlegen
                      </button>
                    </div>
                  ) : (
                    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                      {projects.map(project => {
                        const projectHistoryEntries = history.filter(item => item.projectId === project.id);
                        const projectSolutionsCount = projectHistoryEntries.filter(
                          item => item.mode === InputMode.TEXT || item.mode === InputMode.IMAGE
                        ).length;
                        const projectTutorCount = projectHistoryEntries.filter(item => item.mode === InputMode.TUTOR).length;
                        const projectPracticeCount = practiceRooms.filter(room => room.projectId === project.id).length;
                        const projectExamCount = (state.examSessions ?? []).filter(session => session.projectId === project.id).length;
                        const projectTotalCount = projectSolutionsCount + projectTutorCount + projectPracticeCount + projectExamCount;
                        const projectColor = normalizeProjectColor(project.color);
                        const projectSurfaceLight = adjustHexColor(projectColor, 0.12);
                        const projectSurfaceDark = adjustHexColor(projectColor, -0.12);
                        const projectTabColor = adjustHexColor(projectColor, 0.3);

                        return (
                          <button
                            key={project.id}
                            onClick={() => openProjectDetail(project.id)}
                            className="group text-left"
                          >
                            <div
                              className="relative h-full rounded-2xl border p-4 shadow-sm transition-all group-hover:-translate-y-0.5 group-hover:shadow-md"
                              style={{
                                borderColor: withHexAlpha(projectSurfaceDark, 0.6),
                                background: `linear-gradient(180deg, ${projectSurfaceLight} 0%, ${projectSurfaceDark} 100%)`
                              }}
                            >
                              <div
                                className="absolute -top-2 left-4 h-4 w-20 rounded-t-lg border border-b-0"
                                style={{
                                  borderColor: withHexAlpha(projectSurfaceDark, 0.75),
                                  backgroundColor: projectTabColor
                                }}
                              />
                              <div className="flex items-start gap-3">
                                <div
                                  className="mt-1 rounded-xl border p-2"
                                  style={{
                                    borderColor: withHexAlpha('#ffffff', 0.5),
                                    backgroundColor: withHexAlpha('#ffffff', 0.18)
                                  }}
                                >
                                  <Folder className="h-5 w-5" style={{ color: '#ffffff' }} />
                                </div>
                                <div className="min-w-0">
                                  <p className="truncate text-sm font-bold text-white">{project.name}</p>
                                  <p className="mt-0.5 text-xs text-white/85 line-clamp-2">
                                    {project.description || 'Ohne Beschreibung'}
                                  </p>
                                </div>
                              </div>
                              <div className="mt-4 grid grid-cols-2 gap-2 text-[11px] text-white">
                                <div className="rounded-lg bg-white/20 px-2 py-1">
                                  <span className="font-semibold">{projectTotalCount}</span> gesamt
                                </div>
                                <div className="rounded-lg bg-white/20 px-2 py-1">
                                  <span className="font-semibold">{projectSolutionsCount}</span> Loesungen
                                </div>
                                <div className="rounded-lg bg-white/20 px-2 py-1">
                                  <span className="font-semibold">{projectTutorCount}</span> Tutor
                                </div>
                                <div className="rounded-lg bg-white/20 px-2 py-1">
                                  <span className="font-semibold">{projectPracticeCount + projectExamCount}</span> Ueben+Pruefung
                                </div>
                              </div>
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>
              ) : (
                <div className="space-y-6">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <button
                      onClick={() => setProjectsView('folders')}
                      className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-100 transition-colors"
                    >
                      <ChevronRight className="h-3.5 w-3.5 rotate-180" />
                      Zurueck zu den Ordnern
                    </button>
                  </div>

                  {!selectedProject ? (
                    <p className="rounded-xl border border-dashed border-slate-200 bg-white p-4 text-sm text-slate-500">
                      Dieses Projekt ist nicht mehr verfuegbar. Gehe zurueck zur Ordneransicht.
                    </p>
                  ) : (
                    <div className="space-y-5">
                      <section className="rounded-2xl border border-slate-200 bg-white/95 p-4 shadow-sm sm:p-5">
                        <div className="flex flex-wrap items-start justify-between gap-3">
                          <div>
                            <div className="flex items-center gap-2">
                              <span className="inline-block h-3 w-3 rounded-full bg-slate-300" />
                              <h3 className="text-lg font-bold text-slate-800">{selectedProject.name}</h3>
                              {state.activeProjectId === selectedProject.id && (
                                <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-emerald-700">
                                  aktiv
                                </span>
                              )}
                            </div>
                            {selectedProject.description && (
                              <p className="mt-1 text-sm text-slate-500">{selectedProject.description}</p>
                            )}
                          </div>
                          <div className="flex flex-wrap gap-2">
                            <button
                              onClick={() => handleActiveProjectChange(selectedProject.id)}
                              className={`${PROJECT_HEADER_ACTION_BUTTON_CLASS} ${
                                state.activeProjectId === selectedProject.id
                                  ? 'bg-emerald-100 text-emerald-700'
                                  : 'bg-indigo-100 text-indigo-700 hover:bg-indigo-200'
                              }`}
                            >
                              {state.activeProjectId === selectedProject.id ? 'Aktives Projekt' : 'Als aktiv setzen'}
                            </button>
                            <button
                              onClick={() => startEditProject(selectedProject)}
                              className={`${PROJECT_HEADER_ACTION_BUTTON_CLASS} border border-slate-200 text-slate-700 hover:bg-slate-100`}
                            >
                              <Pencil className="h-3.5 w-3.5" />
                              Bearbeiten
                            </button>
                            <button
                              onClick={() => handleDeleteProject(selectedProject.id)}
                              className={`${PROJECT_HEADER_ACTION_BUTTON_CLASS} border border-red-200 text-red-600 hover:bg-red-50`}
                            >
                              Loeschen
                            </button>
                          </div>
                        </div>
                      </section>

                      <div className="grid gap-4 [grid-template-columns:repeat(auto-fit,minmax(min(100%,420px),1fr))]">
                        <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
                          <div className="mb-3 flex items-center justify-between gap-2">
                            <div className="flex items-center gap-2">
                              <Type className="h-4 w-4 text-blue-500" />
                              <h4 className="text-sm font-semibold text-slate-700">Aufgabe loesen (Text/Foto)</h4>
                            </div>
                            <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-slate-600">
                              {selectedProjectSolutionHistory.length}
                            </span>
                          </div>
                          {selectedProjectSolutionHistory.length === 0 ? (
                            <p className="rounded-lg border border-dashed border-slate-200 bg-slate-50 p-3 text-xs text-slate-500">
                              Keine Eintraege.
                            </p>
                          ) : (
                            <div className={projectDetailListClass}>
                              {selectedProjectSolutionHistory.map(item => (
                                <div
                                  key={item.id}
                                  onClick={() => handleHistoryRestore(item)}
                                  className="group cursor-pointer rounded-xl border border-slate-200 bg-white p-3 hover:bg-slate-50 transition-colors"
                                >
                                  <div className="flex items-start justify-between gap-3">
                                    <div className="min-w-0 flex-1">
                                      <div className="mb-1 flex items-center gap-2">
                                        <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wider ${
                                          item.mode === InputMode.IMAGE ? 'bg-purple-100 text-purple-700' : 'bg-blue-100 text-blue-700'
                                        }`}>
                                          {item.mode === InputMode.IMAGE ? 'Foto' : 'Text'}
                                        </span>
                                        <span className="text-xs text-slate-400">
                                          {new Date(item.timestamp).toLocaleDateString()} • {new Date(item.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                        </span>
                                      </div>
                                      <div className="line-clamp-1 text-sm font-semibold text-slate-800">
                                        <MathRenderer content={item.prompt} />
                                      </div>
                                      <div className="mt-1 text-sm text-slate-500 line-clamp-2">
                                        <span className="mr-1 font-medium text-slate-400">Ergebnis:</span>
                                        <MathRenderer content={item.preview} />
                                      </div>
                                    </div>
                                    <div className="flex flex-col items-end gap-1" onClick={(e) => e.stopPropagation()}>
                                      {canDownloadHistoryItem(item) && (
                                        <div className="relative" data-history-download-menu>
                                          <button
                                            onClick={() => setOpenHistoryDownloadMenuId(prev => (prev === item.id ? null : item.id))}
                                            className={`${DETAIL_ACTION_BUTTON_BASE_CLASS} bg-indigo-50 text-indigo-700 hover:bg-indigo-100`}
                                          >
                                            <Download className="h-3.5 w-3.5" />
                                            Download
                                            <ChevronDown className={`h-3.5 w-3.5 transition-transform ${openHistoryDownloadMenuId === item.id ? 'rotate-180' : ''}`} />
                                          </button>
                                          {openHistoryDownloadMenuId === item.id && (
                                            <div className="absolute right-0 z-20 mt-1 w-44 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-lg">
                                              <button
                                                onClick={() => {
                                                  setOpenHistoryDownloadMenuId(null);
                                                  handleDownloadHistoryItemMarkdown(item);
                                                }}
                                                className="w-full px-3 py-2 text-left text-xs font-semibold text-slate-700 hover:bg-slate-50"
                                              >
                                                Als Markdown
                                              </button>
                                              <button
                                                onClick={() => {
                                                  setOpenHistoryDownloadMenuId(null);
                                                  handleDownloadHistoryItemPdf(item);
                                                }}
                                                className="w-full border-t border-slate-100 px-3 py-2 text-left text-xs font-semibold text-slate-700 hover:bg-slate-50"
                                              >
                                                Als PDF
                                              </button>
                                            </div>
                                          )}
                                        </div>
                                      )}
                                      <button
                                        onClick={() => assignHistoryItemToProject(item.id, null)}
                                        className={`${DETAIL_ACTION_BUTTON_BASE_CLASS} border border-slate-200 text-slate-600 hover:bg-slate-100`}
                                      >
                                        Entfernen
                                      </button>
                                    </div>
                                  </div>
                                </div>
                              ))}
                            </div>
                          )}
                        </section>

                        <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
                          <div className="mb-3 flex items-center justify-between gap-2">
                            <div className="flex items-center gap-2">
                              <GraduationCap className="h-4 w-4 text-emerald-500" />
                              <h4 className="text-sm font-semibold text-slate-700">Tutor-Lektionen</h4>
                            </div>
                            <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-slate-600">
                              {selectedProjectTutorHistory.length}
                            </span>
                          </div>
                          {selectedProjectTutorHistory.length === 0 ? (
                            <p className="rounded-lg border border-dashed border-slate-200 bg-slate-50 p-3 text-xs text-slate-500">
                              Keine Eintraege.
                            </p>
                          ) : (
                            <div className={projectDetailListClass}>
                              {selectedProjectTutorHistory.map(item => (
                                <div
                                  key={item.id}
                                  onClick={() => handleHistoryRestore(item)}
                                  className="group cursor-pointer rounded-xl border border-slate-200 bg-white p-3 hover:bg-slate-50 transition-colors"
                                >
                                  <div className="flex items-start justify-between gap-3">
                                    <div className="min-w-0 flex-1">
                                      <div className="mb-1 flex items-center gap-2">
                                        <span className="text-[10px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wider bg-emerald-100 text-emerald-700">
                                          Tutor
                                        </span>
                                        {item.status === 'processing' && (
                                          <span className="text-[10px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wider bg-amber-100 text-amber-700">
                                            {clampPercent(item.progress ?? 0)}%
                                          </span>
                                        )}
                                        {item.status === 'failed' && (
                                          <span className="text-[10px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wider bg-red-100 text-red-700">
                                            Fehler
                                          </span>
                                        )}
                                        <span className="text-xs text-slate-400">
                                          {new Date(item.timestamp).toLocaleDateString()} • {new Date(item.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                        </span>
                                      </div>
                                      <p className="line-clamp-1 text-sm font-semibold text-slate-800">{item.prompt}</p>
                                      <p className="mt-1 line-clamp-2 text-sm text-slate-500">{item.preview}</p>
                                    </div>
                                    <div className="flex flex-col items-end gap-1" onClick={(e) => e.stopPropagation()}>
                                      {item.status !== 'processing' && (item.status === 'failed' || hasTutorRetryableSteps(item.solution)) && (
                                        <button
                                          onClick={() => handleRetryTutorHistory(item)}
                                          disabled={retryingHistoryId === item.id}
                                          className={`${DETAIL_ACTION_BUTTON_BASE_CLASS} bg-amber-50 text-amber-700 hover:bg-amber-100 disabled:opacity-60`}
                                        >
                                          {retryingHistoryId === item.id ? 'Retry...' : 'Retry'}
                                        </button>
                                      )}
                                      {item.status === 'completed' && (
                                        <button
                                          onClick={() => handleHistoryRestore(item, 'summary')}
                                          className={`${DETAIL_ACTION_BUTTON_BASE_CLASS} bg-indigo-50 text-indigo-700 hover:bg-indigo-100`}
                                        >
                                          Uebersicht
                                        </button>
                                      )}
                                      {canDownloadHistoryItem(item) && (
                                        <div className="relative" data-history-download-menu>
                                          <button
                                            onClick={() => setOpenHistoryDownloadMenuId(prev => (prev === item.id ? null : item.id))}
                                            className={`${DETAIL_ACTION_BUTTON_BASE_CLASS} bg-indigo-50 text-indigo-700 hover:bg-indigo-100`}
                                          >
                                            <Download className="h-3.5 w-3.5" />
                                            Download
                                            <ChevronDown className={`h-3.5 w-3.5 transition-transform ${openHistoryDownloadMenuId === item.id ? 'rotate-180' : ''}`} />
                                          </button>
                                          {openHistoryDownloadMenuId === item.id && (
                                            <div className="absolute right-0 z-20 mt-1 w-44 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-lg">
                                              <button
                                                onClick={() => {
                                                  setOpenHistoryDownloadMenuId(null);
                                                  handleDownloadHistoryItemMarkdown(item);
                                                }}
                                                className="w-full px-3 py-2 text-left text-xs font-semibold text-slate-700 hover:bg-slate-50"
                                              >
                                                Als Markdown
                                              </button>
                                              <button
                                                onClick={() => {
                                                  setOpenHistoryDownloadMenuId(null);
                                                  handleDownloadHistoryItemPdf(item);
                                                }}
                                                className="w-full border-t border-slate-100 px-3 py-2 text-left text-xs font-semibold text-slate-700 hover:bg-slate-50"
                                              >
                                                Als PDF
                                              </button>
                                            </div>
                                          )}
                                        </div>
                                      )}
                                      <button
                                        onClick={() => assignHistoryItemToProject(item.id, null)}
                                        className={`${DETAIL_ACTION_BUTTON_BASE_CLASS} border border-slate-200 text-slate-600 hover:bg-slate-100`}
                                      >
                                        Entfernen
                                      </button>
                                    </div>
                                  </div>
                                </div>
                              ))}
                            </div>
                          )}
                        </section>

                        <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
                          <div className="mb-3 flex items-center justify-between gap-2">
                            <div className="flex items-center gap-2">
                              <BookOpen className="h-4 w-4 text-amber-500" />
                              <h4 className="text-sm font-semibold text-slate-700">Aufgaben ueben (Lernraeume)</h4>
                            </div>
                            <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-slate-600">
                              {selectedProjectPracticeRooms.length}
                            </span>
                          </div>
                          {selectedProjectPracticeRooms.length === 0 ? (
                            <p className="rounded-lg border border-dashed border-slate-200 bg-slate-50 p-3 text-xs text-slate-500">
                              Keine Eintraege.
                            </p>
                          ) : (
                            <div className={projectDetailListClass}>
                              {selectedProjectPracticeRooms.map(room => {
                                const solvedTasks = room.generatedTasks.filter(task => task.isCorrect === true).length;
                                return (
                                  <div
                                    key={room.id}
                                    onClick={() => handleOpenRoom(room)}
                                    className="group cursor-pointer rounded-xl border border-slate-200 bg-white p-3 hover:bg-slate-50 transition-colors"
                                  >
                                    <div className="flex items-start justify-between gap-3">
                                      <div className="min-w-0 flex-1">
                                        <p className="line-clamp-1 text-sm font-semibold text-slate-800">{room.topic}</p>
                                        <p className="mt-1 text-xs text-slate-500">
                                          Schwierigkeit: {room.difficulty} • {room.generatedTasks.length} Aufgaben • {solvedTasks} korrekt
                                        </p>
                                        <p className="mt-1 text-xs text-slate-400">
                                          {new Date(room.createdAt).toLocaleDateString()} • {new Date(room.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                        </p>
                                      </div>
                                      <button
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          assignPracticeRoomToProject(room.id, null);
                                        }}
                                        className={`${DETAIL_ACTION_BUTTON_BASE_CLASS} border border-slate-200 text-slate-600 hover:bg-slate-100`}
                                      >
                                        Entfernen
                                      </button>
                                    </div>
                                  </div>
                                );
                              })}
                            </div>
                          )}
                        </section>

                        <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
                          <div className="mb-3 flex items-center justify-between gap-2">
                            <div className="flex items-center gap-2">
                              <ClipboardCheck className="h-4 w-4 text-rose-500" />
                              <h4 className="text-sm font-semibold text-slate-700">Pruefungsmodus</h4>
                            </div>
                            <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-slate-600">
                              {selectedProjectExamSessions.length}
                            </span>
                          </div>
                          {selectedProjectExamSessions.length === 0 ? (
                            <p className="rounded-lg border border-dashed border-slate-200 bg-slate-50 p-3 text-xs text-slate-500">
                              Keine Eintraege.
                            </p>
                          ) : (
                            <div className={projectDetailListClass}>
                              {selectedProjectExamSessions.map(session => (
                                <div
                                  key={session.id}
                                  onClick={() => handleOpenExamSession(session)}
                                  className="group cursor-pointer rounded-xl border border-slate-200 bg-white p-3 hover:bg-slate-50 transition-colors"
                                >
                                  <div className="flex items-start justify-between gap-3">
                                    <div className="min-w-0 flex-1">
                                      <div className="mb-1 flex items-center gap-2">
                                        {session.status === 'completed' ? (
                                          <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-emerald-700">
                                            {session.scorePercent ?? 0}%
                                          </span>
                                        ) : (
                                          <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-amber-700">
                                            Offen
                                          </span>
                                        )}
                                        <span className="text-xs text-slate-400">
                                          {new Date(session.createdAt).toLocaleDateString()} • {new Date(session.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                        </span>
                                      </div>
                                      <p className="line-clamp-1 text-sm font-semibold text-slate-800">{session.topic}</p>
                                      <p className="mt-1 text-xs text-slate-500">
                                        {session.taskCount} Aufgaben • {session.durationMinutes} Min • {session.difficulty}
                                      </p>
                                    </div>
                                    <button
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        assignExamSessionToProject(session.id, null);
                                      }}
                                      className={`${DETAIL_ACTION_BUTTON_BASE_CLASS} border border-slate-200 text-slate-600 hover:bg-slate-100`}
                                    >
                                      Entfernen
                                    </button>
                                  </div>
                                </div>
                              ))}
                            </div>
                          )}
                        </section>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {projectModalOpen && (
                <div
                  className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/55 p-4"
                  onClick={closeProjectModal}
                >
                  <div
                    className="w-full max-w-lg rounded-2xl border border-slate-200 bg-white p-4 shadow-2xl sm:p-5"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <div className="mb-3 flex items-start justify-between gap-3">
                      <div>
                        <h3 className="text-base font-bold text-slate-800">
                          {editingProjectId ? 'Projekt bearbeiten' : 'Neues Projekt'}
                        </h3>
                        <p className="text-xs text-slate-500">
                          Name, Farbe und Beschreibung festlegen.
                        </p>
                      </div>
                      <button
                        onClick={closeProjectModal}
                        className="rounded-lg border border-slate-200 p-1.5 text-slate-500 hover:bg-slate-100 transition-colors"
                        title="Schliessen"
                      >
                        <X className="h-4 w-4" />
                      </button>
                    </div>

                    <div className="grid gap-3 sm:grid-cols-[1fr_auto]">
                      <input
                        value={projectForm.name}
                        onChange={(e) => setProjectForm(prev => ({ ...prev, name: e.target.value }))}
                        placeholder="Projektname"
                        className="w-full rounded-xl border border-slate-200 bg-white p-2.5 text-sm text-slate-700 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200"
                      />
                      <div className="flex items-center gap-2">
                        <label className="text-xs font-semibold uppercase tracking-wide text-slate-500">Farbe</label>
                        <input
                          type="color"
                          value={projectForm.color}
                          onChange={(e) => setProjectForm(prev => ({ ...prev, color: e.target.value }))}
                          className="h-9 w-12 cursor-pointer rounded border border-slate-200 bg-white p-1"
                        />
                      </div>
                    </div>
                    <textarea
                      value={projectForm.description}
                      onChange={(e) => setProjectForm(prev => ({ ...prev, description: e.target.value }))}
                      placeholder="Kurzbeschreibung (optional)"
                      className="mt-3 h-24 w-full rounded-xl border border-slate-200 bg-white p-2.5 text-sm text-slate-700 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200 resize-none"
                    />

                    <div className="mt-4 flex justify-end gap-2">
                      <button
                        onClick={closeProjectModal}
                        className="rounded-lg border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 transition-colors"
                      >
                        Abbrechen
                      </button>
                      <button
                        onClick={saveProjectForm}
                        className="rounded-lg bg-indigo-600 px-3 py-2 text-xs font-semibold text-white hover:bg-indigo-700 transition-colors"
                      >
                        {editingProjectId ? 'Projekt speichern' : 'Projekt anlegen'}
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Aufgabe (Text + optional Foto) */}
          {!isProjectsTab && state.inputMode === InputMode.TEXT && (
            <div className="space-y-4">
              <textarea
                value={state.textInput}
                onChange={handleTextChange}
                onPaste={handlePaste}
                placeholder="Gib hier deine Matheaufgabe ein (z.B. 'LÃ¶se die Gleichung x^2 - 4 = 0') oder lade ein Foto der Aufgabe hoch â€¦ Tipp: Bild mit Strg+V einfÃ¼gen!"
                className="w-full h-36 sm:h-32 p-4 bg-slate-50 rounded-2xl border border-slate-200 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200 focus:bg-white transition-all resize-none text-slate-700 text-base sm:text-lg placeholder:text-slate-400"
              />
              {!state.imagePreview ? (
                <div
                  onClick={() => fileInputRef.current?.click()}
                  className="w-full h-32 border-2 border-dashed border-slate-300 rounded-2xl flex flex-col items-center justify-center bg-slate-50 hover:bg-indigo-50 hover:border-indigo-400 transition-all cursor-pointer group"
                >
                  <ImageIcon className="w-6 h-6 text-indigo-500 mb-2 group-hover:scale-110 transition-transform" />
                  <p className="text-slate-600 text-sm font-medium">Foto anhÃ¤ngen (optional)</p>
                  <p className="text-xs text-slate-400 mt-0.5">Klicken oder Strg+V Â· JPG, PNG, WEBP</p>
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
          {!isProjectsTab && state.inputMode === InputMode.TUTOR && (
            <div className="space-y-4">
              <textarea
                value={state.textInput}
                onChange={handleTextChange}
                placeholder="Welches Thema soll ich dir beibringen? Beschreibe gerne dein Level (z.B. 'Noch nie gehÃ¶rt', 'Grundlagen bekannt', 'bitte ab Klasse 8 Niveau')."
                className="w-full h-44 sm:h-40 p-4 bg-slate-50 rounded-2xl border border-slate-200 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200 focus:bg-white transition-all resize-none text-slate-700 text-base sm:text-lg placeholder:text-slate-400"
              />
            </div>
          )}

          {/* Practice Input Mode */}
          {!isProjectsTab && state.inputMode === InputMode.PRACTICE && (
            <PracticeSetup
              onStart={handlePracticeStart}
              isLoading={isPracticeGenerating}
            />
          )}

          {!isProjectsTab && state.inputMode === InputMode.EXAM && (
            <ExamSetup
              onStart={handleExamStart}
              isLoading={isExamGenerating}
            />
          )}

          {/* Error Message */}
          {!isProjectsTab && state.error && state.inputMode !== InputMode.PRACTICE && state.inputMode !== InputMode.EXAM && (
            <div className="mt-4 p-3 bg-red-50 border border-red-100 rounded-lg flex items-center space-x-2 text-red-600 text-sm">
              <X className="w-4 h-4" />
              <span>{state.error}</span>
            </div>
          )}

          {/* Submit Button (only for TEXT and TUTOR) */}
          {!isProjectsTab && state.inputMode !== InputMode.PRACTICE && state.inputMode !== InputMode.EXAM && (
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
                    <span>{state.inputMode === InputMode.TUTOR ? 'Erstelle Tutor-Lektion...' : 'LÃ¶se Aufgabe...'}</span>
                  </>
                ) : (
                  <>
                    <Send className="w-5 h-5" />
                    <span>{state.inputMode === InputMode.TUTOR ? 'Tutor starten' : 'Aufgabe LÃ¶sen'}</span>
                  </>
                )}
              </button>
            </div>
          )}

          {/* Practice error (shown inside PracticeSetup area) */}
          {!isProjectsTab && state.error && (state.inputMode === InputMode.PRACTICE || state.inputMode === InputMode.EXAM) && (
            <div className="mt-4 p-3 bg-red-50 border border-red-100 rounded-lg flex items-center space-x-2 text-red-600 text-sm">
              <X className="w-4 h-4" />
              <span>{state.error}</span>
            </div>
          )}
        </div>
        
        {/* Loading State Visualization */}
        {!isProjectsTab && state.isLoading && state.inputMode === InputMode.TEXT && (
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
      {!isProjectsTab && state.inputMode === InputMode.PRACTICE && practiceRooms.length > 0 && !isPracticeGenerating && (
        <section className="w-full max-w-4xl animate-in slide-in-from-bottom-8 fade-in duration-500 mb-8">
          <div className="flex items-center justify-between mb-4 px-1 sm:px-2 gap-2">
            <h3 className="text-xl font-bold text-slate-700 flex items-center gap-2">
              <BookOpen className="w-5 h-5 text-amber-500" />
              Deine LernrÃ¤ume
            </h3>
          </div>
          <div className="grid gap-3 sm:gap-4 md:grid-cols-1">
            {practiceRooms.map(room => (
              <div key={room.id} className="space-y-2">
                <PracticeRoomCard
                  room={room}
                  onClick={() => handleOpenRoom(room)}
                  onDelete={(e) => handleDeleteRoom(e, room.id)}
                />
                <div className="flex items-center justify-end gap-2 px-2">
                  <label className="text-xs font-semibold text-slate-500">Projekt</label>
                  <select
                    value={room.projectId ?? ''}
                    onChange={(e) => assignPracticeRoomToProject(room.id, e.target.value || null)}
                    className="rounded-lg border border-slate-200 bg-white px-2 py-1 text-xs text-slate-700 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200"
                  >
                    <option value="">Kein Projekt</option>
                    {projects.map(project => (
                      <option key={project.id} value={project.id}>
                        {project.name}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {!isProjectsTab && state.inputMode === InputMode.EXAM && state.examSessions.length > 0 && !isExamGenerating && (
        <section className="w-full max-w-4xl animate-in slide-in-from-bottom-8 fade-in duration-500 mb-8">
          <div className="flex items-center justify-between mb-4 px-1 sm:px-2 gap-2">
            <h3 className="text-xl font-bold text-slate-700 flex items-center gap-2">
              <ClipboardCheck className="w-5 h-5 text-rose-500" />
              Letzte PrÃ¼fungen
            </h3>
          </div>
          <div className="grid gap-3 sm:gap-4 md:grid-cols-1">
            {state.examSessions.slice(0, 8).map(session => (
              <div key={session.id} className="space-y-2">
                <button
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
                <div className="flex items-center justify-end gap-2 px-2">
                  <label className="text-xs font-semibold text-slate-500">Projekt</label>
                  <select
                    value={session.projectId ?? ''}
                    onChange={(e) => assignExamSessionToProject(session.id, e.target.value || null)}
                    className="rounded-lg border border-slate-200 bg-white px-2 py-1 text-xs text-slate-700 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200"
                  >
                    <option value="">Kein Projekt</option>
                    {projects.map(project => (
                      <option key={project.id} value={project.id}>
                        {project.name}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* History Section */}
      {!isProjectsTab && state.inputMode !== InputMode.PRACTICE && state.inputMode !== InputMode.EXAM && (() => {
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
               Verlauf lÃ¶schen
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
                        {new Date(item.timestamp).toLocaleDateString()} â€¢ {new Date(item.timestamp).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}
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
                     <div
                       className="flex items-center gap-1"
                       onClick={(e) => e.stopPropagation()}
                     >
                       <span className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">Projekt</span>
                       <select
                         value={item.projectId ?? ''}
                         onChange={(e) => assignHistoryItemToProject(item.id, e.target.value || null)}
                         className="rounded-lg border border-slate-200 bg-white px-2 py-1 text-[11px] font-semibold text-slate-600 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200"
                       >
                         <option value="">Kein</option>
                         {projects.map(project => (
                           <option key={project.id} value={project.id}>
                             {project.name}
                           </option>
                         ))}
                       </select>
                     </div>
                     {item.mode === InputMode.TUTOR && item.status !== 'processing' && (item.status === 'failed' || hasTutorRetryableSteps(item.solution)) && (
                       <button
                         onClick={(e) => {
                           e.stopPropagation();
                           handleRetryTutorHistory(item);
                         }}
                         disabled={retryingHistoryId === item.id}
                         className="px-3 py-1.5 text-xs font-semibold text-amber-700 bg-amber-50 hover:bg-amber-100 rounded-full transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
                         title="Ab fehlgeschlagener Lektion fortsetzen"
                       >
                         {retryingHistoryId === item.id ? 'Retry laeuft...' : 'Retry'}
                       </button>
                     )}
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
                     {canDownloadHistoryItem(item) && (
                       <div className="relative" data-history-download-menu>
                         <button
                           onClick={(e) => {
                             e.stopPropagation();
                             setOpenHistoryDownloadMenuId(prev => (prev === item.id ? null : item.id));
                           }}
                           className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-indigo-600 bg-indigo-50 hover:bg-indigo-100 rounded-full transition-colors"
                           title="Export herunterladen"
                         >
                           <Download className="w-3.5 h-3.5" />
                           Download
                           <ChevronDown className={`w-3.5 h-3.5 transition-transform ${openHistoryDownloadMenuId === item.id ? 'rotate-180' : ''}`} />
                         </button>
                         {openHistoryDownloadMenuId === item.id && (
                           <div className="absolute right-0 mt-1 w-44 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-lg z-20">
                             <button
                               onClick={(e) => {
                                 e.stopPropagation();
                                 setOpenHistoryDownloadMenuId(null);
                                 handleDownloadHistoryItemMarkdown(item);
                               }}
                               className="w-full px-3 py-2 text-left text-xs font-semibold text-slate-700 hover:bg-slate-50"
                             >
                               Als Markdown
                             </button>
                             <button
                               onClick={(e) => {
                                 e.stopPropagation();
                                 setOpenHistoryDownloadMenuId(null);
                                 handleDownloadHistoryItemPdf(item);
                               }}
                               className="w-full px-3 py-2 text-left text-xs font-semibold text-slate-700 hover:bg-slate-50 border-t border-slate-100"
                             >
                               Als PDF
                             </button>
                           </div>
                         )}
                       </div>
                     )}
                     <button 
                       onClick={(e) => deleteHistoryItem(e, item.id)}
                       className="p-2 text-slate-300 hover:text-red-500 hover:bg-red-50 rounded-full transition-colors opacity-100 sm:opacity-0 sm:group-hover:opacity-100"
                      title="Eintrag lÃ¶schen"
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

