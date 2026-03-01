import React, { useState, useRef, useCallback, useEffect } from 'react';
import { solveMathProblem } from './services/gemini';
import { generatePracticeTask } from './services/gemini';
import SolutionViewer from './components/SolutionViewer';
import MathRenderer from './components/MathRenderer';
import PracticeSetup from './components/PracticeSetup';
import PracticeSession from './components/PracticeSession';
import PracticeRoomCard from './components/PracticeRoomCard';
import PracticeRoomDetail from './components/PracticeRoomDetail';
import { MathState, InputMode, HistoryItem, MathSolution, PracticeRoom, PracticeTask } from './types';
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
  BookOpen
} from 'lucide-react';
import ApiKeyManager from './components/ApiKeyManager';

const PRACTICE_ROOMS_KEY = 'mathPracticeRooms';

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
    activePracticeRoom: null
  });

  const [practiceView, setPracticeView] = useState<PracticeView>('setup');
  const [currentPracticeTask, setCurrentPracticeTask] = useState<PracticeTask | null>(null);
  const [isPracticeGenerating, setIsPracticeGenerating] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);

  const history = state.history ?? [];
  const practiceRooms = state.practiceRooms ?? [];

  useEffect(() => {
    const updates: Partial<MathState> = {};

    const savedHistory = localStorage.getItem('mathGeniusHistory');
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

    if (Object.keys(updates).length) {
      setState(prev => ({ ...prev, ...updates }));
    }
  }, []);

  const savePracticeRooms = useCallback((rooms: PracticeRoom[]) => {
    localStorage.setItem(PRACTICE_ROOMS_KEY, JSON.stringify(rooms));
  }, []);

  const updateRoom = useCallback((updatedRoom: PracticeRoom) => {
    setState(prev => {
      const rooms = prev.practiceRooms.map(r => r.id === updatedRoom.id ? updatedRoom : r);
      savePracticeRooms(rooms);
      return { ...prev, practiceRooms: rooms, activePracticeRoom: updatedRoom };
    });
  }, [savePracticeRooms]);

  const saveToHistory = (newItem: HistoryItem) => {
    setState(prev => {
      const updatedHistory = [newItem, ...prev.history].slice(0, 50);
      localStorage.setItem('mathGeniusHistory', JSON.stringify(updatedHistory));
      return { ...prev, history: updatedHistory };
    });
  };

  const clearHistory = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (window.confirm("Möchtest du den gesamten Verlauf wirklich löschen?")) {
      localStorage.removeItem('mathGeniusHistory');
      setState(prev => ({ ...prev, history: [] }));
    }
  };

  const deleteHistoryItem = (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    setState(prev => {
      const updatedHistory = prev.history.filter(item => item.id !== id);
      localStorage.setItem('mathGeniusHistory', JSON.stringify(updatedHistory));
      return { ...prev, history: updatedHistory };
    });
  };

  const handleModeChange = (mode: InputMode) => {
    setState(prev => ({
      ...prev,
      inputMode: mode,
      error: null,
      ...(mode === InputMode.TUTOR ? { imageFile: null, imagePreview: null } : {}),
      ...(mode === InputMode.PRACTICE ? { activePracticeRoom: null } : {})
    }));
    if (mode === InputMode.PRACTICE) {
      setPracticeView('setup');
      setCurrentPracticeTask(null);
    }
  };

  const handleTextChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setState(prev => ({ ...prev, textInput: e.target.value }));
  };

  const handleReset = () => {
    setState(prev => ({
      ...prev,
      isLoading: false,
      inputMode: InputMode.TEXT,
      textInput: '',
      imageFile: null,
      imagePreview: null,
      solution: null,
      error: null,
      activePracticeRoom: null
    }));
    setPracticeView('setup');
    setCurrentPracticeTask(null);
  };

  const handleHistoryRestore = (item: HistoryItem) => {
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

  const handleSubmit = useCallback(async () => {
    if (state.isLoading) return;

    if (state.inputMode === InputMode.TUTOR && !state.textInput.trim()) {
      setState(prev => ({
        ...prev,
        error: "Bitte beschreibe ein Thema oder Sachgebiet für den Tutor-Modus."
      }));
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

    const isTutor = state.inputMode === InputMode.TUTOR;
    const options = isTutor
      ? {
          onTutorProgress: (partial: MathSolution) => {
            setState(prev => ({ ...prev, solution: partial, isLoading: false }));
          }
        }
      : undefined;

    try {
      const solution = await solveMathProblem(
        state.textInput,
        state.imagePreview || undefined,
        state.imageFile?.type,
        state.inputMode,
        options
      );

      const savedMode = state.inputMode === InputMode.TEXT && state.imageFile ? InputMode.IMAGE : state.inputMode;
      const historyItem: HistoryItem = {
        id: generateId(),
        timestamp: Date.now(),
        mode: savedMode,
        prompt: state.textInput || (state.imageFile ? "Foto-Analyse" : state.inputMode === InputMode.TUTOR ? "Tutor-Modus" : "Aufgabe"),
        preview: solution.finalAnswer || solution.steps[0]?.title || "Gelöste Aufgabe",
        solution: solution
      };

      saveToHistory(historyItem);

      setState(prev => ({ ...prev, solution, isLoading: false }));
    } catch (err: any) {
      setState(prev => ({
        ...prev,
        isLoading: false,
        error: err.message || "Es ist ein Fehler aufgetreten. Bitte versuche es erneut."
      }));
    }
  }, [state.inputMode, state.textInput, state.imagePreview, state.imageFile, state.isLoading]);

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

  // ── Render: Solution view ──
  if (state.solution && state.inputMode !== InputMode.PRACTICE) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-indigo-50 via-white to-purple-50 flex flex-col items-center p-3 sm:p-4 md:p-8">
        <header className="w-full max-w-4xl mb-6 md:mb-8 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center space-x-3 cursor-pointer group" onClick={handleReset}>
            <div className="bg-indigo-600 p-2.5 sm:p-3 rounded-xl shadow-lg shadow-indigo-200 group-hover:bg-indigo-700 transition-colors">
              <Calculator className="w-6 h-6 sm:w-8 sm:h-8 text-white" />
            </div>
            <div>
              <h1 className="text-2xl sm:text-3xl font-extrabold text-slate-800 tracking-tight">Mathe Erklaerer</h1>
              <p className="text-sm text-slate-500">Zurück zur Übersicht</p>
            </div>
          </div>
          <ApiKeyManager />
        </header>

        <SolutionViewer 
          solution={state.solution} 
          onReset={handleReset} 
          initialPrompt={state.textInput || (state.inputMode === InputMode.IMAGE ? "Foto-Analyse" : "Dein Mathe-Problem")}
        />
      </div>
    );
  }

  // ── Render: Practice session ──
  if (state.inputMode === InputMode.PRACTICE && practiceView === 'session' && state.activePracticeRoom && currentPracticeTask) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-indigo-50 via-white to-purple-50 flex flex-col items-center p-3 sm:p-4 md:p-8">
        <header className="w-full max-w-4xl mb-6 md:mb-8 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center space-x-3 cursor-pointer group" onClick={handleReset}>
            <div className="bg-indigo-600 p-2.5 sm:p-3 rounded-xl shadow-lg shadow-indigo-200 group-hover:bg-indigo-700 transition-colors">
              <Calculator className="w-6 h-6 sm:w-8 sm:h-8 text-white" />
            </div>
            <div>
              <h1 className="text-2xl sm:text-3xl font-extrabold text-slate-800 tracking-tight">Mathe Erklaerer</h1>
              <p className="text-sm text-slate-500">Zurück zur Übersicht</p>
            </div>
          </div>
          <ApiKeyManager />
        </header>

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
        <header className="w-full max-w-4xl mb-6 md:mb-8 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center space-x-3 cursor-pointer group" onClick={handleReset}>
            <div className="bg-indigo-600 p-2.5 sm:p-3 rounded-xl shadow-lg shadow-indigo-200 group-hover:bg-indigo-700 transition-colors">
              <Calculator className="w-6 h-6 sm:w-8 sm:h-8 text-white" />
            </div>
            <div>
              <h1 className="text-2xl sm:text-3xl font-extrabold text-slate-800 tracking-tight">Mathe Erklaerer</h1>
              <p className="text-sm text-slate-500">Zurück zur Übersicht</p>
            </div>
          </div>
          <ApiKeyManager />
        </header>

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

  // ── Render: Main input form ──
  return (
    <div className="min-h-screen bg-gradient-to-br from-indigo-50 via-white to-purple-50 flex flex-col items-center p-3 sm:p-4 md:p-8">
      
      {/* Header */}
      <header className="w-full max-w-4xl mb-6 md:mb-8 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center space-x-3">
          <div className="bg-indigo-600 p-2.5 sm:p-3 rounded-xl shadow-lg shadow-indigo-200">
            <Calculator className="w-6 h-6 sm:w-8 sm:h-8 text-white" />
          </div>
          <div>
            <h1 className="text-2xl sm:text-3xl font-extrabold text-slate-800 tracking-tight">Mathe Erklaerer</h1>
            <p className="text-xs sm:text-sm text-slate-500">Dein persönlicher Schritt-für-Schritt Tutor</p>
          </div>
        </div>
        <ApiKeyManager />
      </header>

      {/* Main Card */}
      <main className="w-full max-w-4xl bg-white rounded-2xl sm:rounded-3xl shadow-xl overflow-hidden border border-slate-100 transition-all mb-8 md:mb-12">
        
        {/* Input Section */}
        <div className="p-4 sm:p-6 md:p-8 bg-white">
          
          {/* Tabs */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 mb-6 bg-slate-100 p-1 rounded-xl w-full">
            <button
              onClick={() => handleModeChange(InputMode.TEXT)}
              className={`flex items-center justify-center space-x-2 px-3 sm:px-4 py-3 rounded-lg text-sm font-semibold transition-all duration-200 ${
                state.inputMode === InputMode.TEXT
                  ? 'bg-white text-indigo-600 shadow-sm'
                  : 'text-slate-500 hover:text-slate-700 hover:bg-slate-200/50'
              }`}
            >
              <Type className="w-4 h-4" />
              <span>Aufgabe Lösen</span>
            </button>
            <button
              onClick={() => handleModeChange(InputMode.TUTOR)}
              className={`flex items-center justify-center space-x-2 px-3 sm:px-4 py-3 rounded-lg text-sm font-semibold transition-all duration-200 ${
                state.inputMode === InputMode.TUTOR
                  ? 'bg-white text-indigo-600 shadow-sm'
                  : 'text-slate-500 hover:text-slate-700 hover:bg-slate-200/50'
              }`}
            >
              <GraduationCap className="w-4 h-4" />
              <span>Tutor-Modus</span>
            </button>
            <button
              onClick={() => handleModeChange(InputMode.PRACTICE)}
              className={`flex items-center justify-center space-x-2 px-3 sm:px-4 py-3 rounded-lg text-sm font-semibold transition-all duration-200 ${
                state.inputMode === InputMode.PRACTICE
                  ? 'bg-white text-indigo-600 shadow-sm'
                  : 'text-slate-500 hover:text-slate-700 hover:bg-slate-200/50'
              }`}
            >
              <Dumbbell className="w-4 h-4" />
              <span>Aufgaben üben</span>
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
              <div className="rounded-2xl border border-indigo-100 bg-indigo-50/60 p-4 text-sm leading-relaxed text-indigo-900">
                Beschreibe das Thema, das du wirklich von Grund auf lernen möchtest (z.&nbsp;B. <strong>Bruchrechnung</strong>, <strong>lineare Funktionen</strong> oder <strong>quadratische Gleichungen</strong>). 
                Du bekommst dann eine vollständige Lernstrecke mit verständlichen Erklärungen, vorgerechneten Beispielen und Übungsaufgaben mit Musterlösung.
              </div>
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

          {/* Error Message */}
          {state.error && state.inputMode !== InputMode.PRACTICE && (
            <div className="mt-4 p-3 bg-red-50 border border-red-100 rounded-lg flex items-center space-x-2 text-red-600 text-sm">
              <X className="w-4 h-4" />
              <span>{state.error}</span>
            </div>
          )}

          {/* Submit Button (only for TEXT and TUTOR) */}
          {state.inputMode !== InputMode.PRACTICE && (
            <div className="mt-6 flex justify-end">
              <button
                onClick={handleSubmit}
                disabled={state.isLoading || (state.inputMode === InputMode.TUTOR && !state.textInput.trim()) || (state.inputMode === InputMode.TEXT && !state.textInput.trim() && !state.imageFile)}
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
          {state.error && state.inputMode === InputMode.PRACTICE && (
            <div className="mt-4 p-3 bg-red-50 border border-red-100 rounded-lg flex items-center space-x-2 text-red-600 text-sm">
              <X className="w-4 h-4" />
              <span>{state.error}</span>
            </div>
          )}
        </div>
        
        {/* Loading State Visualization */}
        {state.isLoading && state.inputMode !== InputMode.PRACTICE && (
          <div className="p-8 sm:p-12 text-center bg-slate-50/50 border-t border-slate-100">
             <div className="inline-block relative w-20 h-20">
               <div className="absolute top-0 left-0 w-full h-full border-4 border-indigo-100 rounded-full animate-pulse"></div>
               <div className="absolute top-0 left-0 w-full h-full border-t-4 border-indigo-600 rounded-full animate-spin"></div>
             </div>
             <p className="mt-6 text-indigo-900 font-medium animate-pulse">
               {state.inputMode === InputMode.TUTOR
                ? 'Die KI erstellt deine Lernsequenz mit Erklärungen und Übungen...'
                : 'Die KI analysiert deine Aufgabe und berechnet die Schritte...'}
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

      {/* History Section */}
      {state.inputMode !== InputMode.PRACTICE && history.length > 0 && !state.isLoading && (
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
             {history.map((item) => (
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
      )}
      
      <footer className="mt-8 md:mt-12 text-slate-400 text-xs sm:text-sm text-center px-4">
        Powered by Google Gemini 3
      </footer>
    </div>
  );
};

export default App;
