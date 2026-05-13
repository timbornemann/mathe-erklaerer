import React, { useMemo, useState } from 'react';
import {
  ArrowLeft,
  Play,
  BookOpen,
  ClipboardList,
  Plus,
  X,
  Save,
  CheckCircle2,
  XCircle,
  Eye,
  Loader2,
  RotateCcw
} from 'lucide-react';
import MathRenderer from './MathRenderer';
import { ChatMessage, ChatSessionPersistPayload, FormulaEntry, PracticeRoom, PracticeTask, MathSolution } from '../types';
import SolutionViewer from './SolutionViewer';
import { solvePracticeTask } from '../services/gemini';

type DetailTab = 'continue' | 'examples' | 'history';

interface PracticeRoomDetailProps {
  room: PracticeRoom;
  onContinue: (additionalPrompt?: string, taskCount?: number) => void;
  onResumeTask: (task: PracticeTask) => void;
  onUpdateExamples: (examples: string[]) => void;
  onTaskUpdated: (task: PracticeTask) => void;
  onBack: () => void;
  isLoading: boolean;
  formulas?: FormulaEntry[];
  onAddFormulaFromSolution?: (formula: string, sourceLabel: string, contextText?: string) => Promise<void> | void;
  onExtractFormulasFromChatMessage?: (message: string, sourceLabel: string) => Promise<{ added: number; extracted: number }> | void;
  onAddFormulaManual?: (formula: string, contextText?: string) => Promise<void> | void;
  onAskFormulaPrompt?: (prompt: string) => Promise<void> | void;
  onIncrementFormulaUsage?: (formulaId: string) => void;
  onRetryFormulaGeneration?: (formulaId: string) => void;
  loadPersistedChatMessages?: (sessionKey: string) => ChatMessage[] | null;
  onPersistChatSession?: (payload: ChatSessionPersistPayload) => void;
}

const PracticeRoomDetail: React.FC<PracticeRoomDetailProps> = ({
  room,
  onContinue,
  onResumeTask,
  onUpdateExamples,
  onTaskUpdated,
  onBack,
  isLoading,
  formulas = [],
  onAddFormulaFromSolution,
  onExtractFormulasFromChatMessage,
  onAddFormulaManual,
  onAskFormulaPrompt,
  onIncrementFormulaUsage,
  onRetryFormulaGeneration,
  loadPersistedChatMessages,
  onPersistChatSession
}) => {
  const [activeTab, setActiveTab] = useState<DetailTab>('continue');
  const [additionalPrompt, setAdditionalPrompt] = useState('');
  const [continueTaskCount, setContinueTaskCount] = useState(3);
  const [editedExamples, setEditedExamples] = useState<string[]>([...room.exampleTasks]);
  const [viewingSolution, setViewingSolution] = useState<MathSolution | null>(null);
  const [viewingTaskText, setViewingTaskText] = useState('');
  const [generatingSolutionForId, setGeneratingSolutionForId] = useState<string | null>(null);

  const correctCount = room.generatedTasks.filter((task) => task.isCorrect === true).length;
  const attemptedCount = room.generatedTasks.filter((task) => task.isCorrect !== undefined).length;
  const roomIsGenerating = room.status === 'configuring';

  const progressPercent = useMemo(() => {
    if (typeof room.generationProgress === 'number') {
      return Math.max(0, Math.min(100, Math.round(room.generationProgress)));
    }
    if (!room.pendingTaskCount || room.pendingTaskCount <= 0) return 0;
    const ratio = room.generatedTasks.length / room.pendingTaskCount;
    return Math.max(0, Math.min(100, Math.round(ratio * 100)));
  }, [room.generationProgress, room.pendingTaskCount, room.generatedTasks.length]);

  const tabs: { id: DetailTab; label: string; icon: React.ReactNode }[] = [
    { id: 'continue', label: 'Weiter ueben', icon: <Play className="w-4 h-4" /> },
    { id: 'examples', label: 'Beispielaufgaben', icon: <BookOpen className="w-4 h-4" /> },
    { id: 'history', label: 'Bisherige Aufgaben', icon: <ClipboardList className="w-4 h-4" /> }
  ];

  const addExample = () => setEditedExamples((prev) => [...prev, '']);
  const removeExample = (index: number) => setEditedExamples((prev) => prev.filter((_, i) => i !== index));
  const updateExample = (index: number, value: string) =>
    setEditedExamples((prev) => prev.map((task, i) => (i === index ? value : task)));

  const saveExamples = () => {
    const filtered = editedExamples.filter((task) => task.trim() !== '');
    onUpdateExamples(filtered);
    setEditedExamples(filtered.length ? filtered : ['']);
  };

  const handleGenerateSolutionForTask = async (task: PracticeTask) => {
    setGeneratingSolutionForId(task.id);
    try {
      const solution = await solvePracticeTask(task.taskText);
      const updatedTask: PracticeTask = { ...task, fullSolution: solution };
      onTaskUpdated(updatedTask);
      setViewingSolution(solution);
      setViewingTaskText(task.taskText);
    } catch (error: any) {
      console.error('Failed to generate solution:', error);
    } finally {
      setGeneratingSolutionForId(null);
    }
  };

  if (viewingSolution) {
    return (
      <div className="w-full max-w-4xl">
        <SolutionViewer
          solution={viewingSolution}
          onReset={() => {
            setViewingSolution(null);
            setViewingTaskText('');
          }}
          initialPrompt={viewingTaskText}
          formulas={formulas}
          onAddFormulaFromSolution={onAddFormulaFromSolution}
          onExtractFormulasFromChatMessage={onExtractFormulasFromChatMessage}
          onAddFormulaManual={onAddFormulaManual}
          onAskFormulaPrompt={onAskFormulaPrompt}
          onIncrementFormulaUsage={onIncrementFormulaUsage}
          onRetryFormulaGeneration={onRetryFormulaGeneration}
          loadPersistedChatMessages={loadPersistedChatMessages}
          onPersistChatSession={onPersistChatSession}
          chatSessionOriginMode="PRACTICE"
          chatSessionOriginLabel={`Ueben: ${room.topic}`}
          chatSessionSourceId={room.id}
          chatSessionProjectId={room.projectId}
        />
      </div>
    );
  }

  return (
    <div className="w-full max-w-4xl space-y-4">
      <button
        onClick={onBack}
        className="flex items-center gap-1.5 text-sm text-slate-500 hover:text-indigo-600 transition-colors"
      >
        <ArrowLeft className="w-4 h-4" />
        Zurueck
      </button>

      <div className="bg-white rounded-2xl sm:rounded-3xl shadow-xl border border-slate-100 overflow-hidden">
        <div className="bg-gradient-to-r from-amber-500 to-orange-500 px-5 sm:px-7 py-5 text-white">
          <p className="text-xs uppercase tracking-wider text-white/70 font-medium">Lernraum</p>
          <h2 className="text-xl font-bold mt-1">{room.topic}</h2>
          <div className="flex items-center gap-4 mt-2 text-sm text-white/80">
            <span>{room.difficulty}</span>
            {attemptedCount > 0 && <span>{correctCount}/{attemptedCount} richtig</span>}
            <span>{room.generatedTasks.length} Aufgabe{room.generatedTasks.length !== 1 ? 'n' : ''}</span>
            {roomIsGenerating && <span className="font-semibold">in Vorbereitung ({progressPercent}%)</span>}
          </div>
        </div>

        <div className="flex border-b border-slate-100">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex-1 flex items-center justify-center gap-2 px-4 py-3 text-sm font-semibold transition-all border-b-2 ${
                activeTab === tab.id
                  ? 'border-indigo-600 text-indigo-600'
                  : 'border-transparent text-slate-400 hover:text-slate-600'
              }`}
            >
              {tab.icon}
              <span className="hidden sm:inline">{tab.label}</span>
            </button>
          ))}
        </div>

        <div className="p-5 sm:p-7">
          {activeTab === 'continue' && (
            <div className="space-y-4">
              <p className="text-sm text-slate-600">
                Erstelle neue Uebungsaufgaben basierend auf dem bisherigen Lernstand.
                Du kannst optional zusaetzliche Anweisungen geben.
              </p>

              {roomIsGenerating && (
                <div className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-700">
                  Aufgaben werden bereits im Hintergrund erstellt ({progressPercent}%).
                </div>
              )}

              {room.status === 'failed' && room.generationError && (
                <div className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
                  Letzte Generierung fehlgeschlagen: {room.generationError}
                </div>
              )}

              <textarea
                value={additionalPrompt}
                onChange={(event) => setAdditionalPrompt(event.target.value)}
                placeholder="z. B. schwieriger machen, mehr Textaufgaben, Fokus auf einen Teilbereich ..."
                className="w-full h-28 p-4 bg-slate-50 rounded-2xl border border-slate-200 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200 focus:bg-white transition-all resize-none text-slate-700 text-base placeholder:text-slate-400"
              />

              <div className="grid gap-3 sm:grid-cols-3">
                <div className="sm:col-span-2">
                  <label className="block text-sm font-semibold text-slate-700 mb-1.5">Anzahl neuer Aufgaben</label>
                  <select
                    value={continueTaskCount}
                    onChange={(event) => setContinueTaskCount(Number(event.target.value))}
                    className="w-full p-3 bg-slate-50 rounded-xl border border-slate-200 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200 focus:bg-white transition-all text-slate-700 text-base"
                    disabled={roomIsGenerating || isLoading}
                  >
                    {Array.from({ length: 10 }, (_, index) => index + 1).map((count) => (
                      <option key={count} value={count}>
                        {count}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="flex justify-end">
                <button
                  onClick={() => onContinue(additionalPrompt.trim() || undefined, continueTaskCount)}
                  disabled={roomIsGenerating || isLoading}
                  className="w-full sm:w-auto justify-center bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white px-6 py-3 rounded-xl font-bold text-base shadow-lg shadow-indigo-200 flex items-center space-x-2 transition-all active:scale-95"
                >
                  <Play className="w-5 h-5" />
                  <span>{continueTaskCount > 1 ? 'Aufgabenpaket starten' : 'Neue Aufgabe starten'}</span>
                </button>
              </div>
            </div>
          )}

          {activeTab === 'examples' && (
            <div className="space-y-4">
              <p className="text-sm text-slate-600">
                Verwalte die Beispielaufgaben, an denen sich die KI beim Erstellen neuer Aufgaben orientiert.
              </p>
              <div className="space-y-2">
                {editedExamples.map((task, index) => (
                  <div key={index} className="flex items-start gap-2">
                    <span className="mt-3 text-xs font-mono text-slate-400 w-5 text-right flex-shrink-0">
                      {index + 1}.
                    </span>
                    <textarea
                      value={task}
                      onChange={(event) => updateExample(index, event.target.value)}
                      placeholder="z. B. Loese x^2 + 5x + 6 = 0"
                      rows={2}
                      className="flex-1 p-3 bg-slate-50 rounded-xl border border-slate-200 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200 focus:bg-white transition-all resize-none text-slate-700 text-sm placeholder:text-slate-400"
                    />
                    {editedExamples.length > 1 && (
                      <button
                        onClick={() => removeExample(index)}
                        className="mt-2 p-1.5 text-slate-300 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors"
                        title="Beispiel entfernen"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                ))}
              </div>
              <div className="flex items-center justify-between">
                <button
                  onClick={addExample}
                  className="flex items-center gap-1.5 text-sm font-medium text-indigo-600 hover:text-indigo-700 px-3 py-2 rounded-lg hover:bg-indigo-50 transition-colors"
                >
                  <Plus className="w-4 h-4" />
                  Beispiel hinzufuegen
                </button>
                <button
                  onClick={saveExamples}
                  className="flex items-center gap-1.5 text-sm font-semibold text-white bg-indigo-600 hover:bg-indigo-700 px-4 py-2 rounded-lg shadow transition-all active:scale-95"
                >
                  <Save className="w-4 h-4" />
                  Speichern
                </button>
              </div>
            </div>
          )}

          {activeTab === 'history' && (
            <div className="space-y-3">
              {room.generatedTasks.length === 0 ? (
                <p className="text-sm text-slate-400 text-center py-8">
                  {roomIsGenerating
                    ? 'Aufgaben werden gerade erstellt.'
                    : room.status === 'failed'
                    ? 'Generierung fehlgeschlagen. Starte im Tab "Weiter ueben" einen neuen Versuch.'
                    : 'Noch keine Aufgaben erstellt.'}
                </p>
              ) : (
                room.generatedTasks.map((task, index) => (
                  <div
                    key={task.id}
                    className="p-4 rounded-xl border border-slate-100 bg-slate-50/50 hover:bg-white transition-colors"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <span className="text-xs font-medium text-slate-400">#{index + 1}</span>
                          {task.isCorrect === true && (
                            <span className="flex items-center gap-1 text-xs text-emerald-600">
                              <CheckCircle2 className="w-3.5 h-3.5" /> Richtig
                            </span>
                          )}
                          {task.isCorrect === false && (
                            <span className="flex items-center gap-1 text-xs text-red-500">
                              <XCircle className="w-3.5 h-3.5" /> Falsch
                            </span>
                          )}
                          {task.isCorrect === undefined && (
                            <span className="text-xs text-amber-500 font-medium">Offen</span>
                          )}
                        </div>
                        <div className="text-sm text-slate-700 line-clamp-3">
                          <MathRenderer content={task.taskText} />
                        </div>
                      </div>
                      <div className="flex flex-col gap-1 flex-shrink-0">
                        {task.isCorrect === undefined && (
                          <button
                            onClick={() => onResumeTask(task)}
                            className="flex items-center gap-1 text-xs text-indigo-500 hover:text-indigo-700 px-2 py-1 rounded-lg hover:bg-indigo-50 transition-colors"
                          >
                            <RotateCcw className="w-3.5 h-3.5" />
                            Fortsetzen
                          </button>
                        )}
                        {task.fullSolution ? (
                          <button
                            onClick={() => {
                              setViewingSolution(task.fullSolution!);
                              setViewingTaskText(task.taskText);
                            }}
                            className="flex items-center gap-1 text-xs text-indigo-500 hover:text-indigo-700 px-2 py-1 rounded-lg hover:bg-indigo-50 transition-colors"
                          >
                            <Eye className="w-3.5 h-3.5" />
                            Loesung
                          </button>
                        ) : (
                          <button
                            onClick={() => handleGenerateSolutionForTask(task)}
                            disabled={generatingSolutionForId === task.id}
                            className="flex items-center gap-1 text-xs text-indigo-500 hover:text-indigo-700 px-2 py-1 rounded-lg hover:bg-indigo-50 transition-colors disabled:opacity-50"
                          >
                            {generatingSolutionForId === task.id ? (
                              <Loader2 className="w-3.5 h-3.5 animate-spin" />
                            ) : (
                              <Eye className="w-3.5 h-3.5" />
                            )}
                            Loesung erstellen
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default PracticeRoomDetail;
