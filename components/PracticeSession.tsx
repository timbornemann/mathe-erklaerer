import React, { useState, useRef, useCallback } from 'react';
import { 
  CheckCircle2, XCircle, Eye, ArrowRight, Loader2, ImageIcon, X, 
  Send, ArrowLeft, RefreshCw, ChevronDown, ChevronUp
} from 'lucide-react';
import MathRenderer from './MathRenderer';
import SolutionViewer from './SolutionViewer';
import { PracticeRoom, PracticeTask, MathSolution } from '../types';
import { checkPracticeSolution, solvePracticeTask } from '../services/gemini';

type SessionPhase = 
  | 'generating'
  | 'task_display'
  | 'checking'
  | 'result_correct'
  | 'result_wrong'
  | 'loading_solution'
  | 'showing_solution'
  | 'next_prompt';

interface PracticeSessionProps {
  room: PracticeRoom;
  currentTask: PracticeTask;
  onTaskUpdated: (task: PracticeTask) => void;
  onNextTask: (additionalPrompt?: string) => void;
  onBack: () => void;
  isGenerating: boolean;
}

const PracticeSession: React.FC<PracticeSessionProps> = ({
  room,
  currentTask,
  onTaskUpdated,
  onNextTask,
  onBack,
  isGenerating
}) => {
  const [phase, setPhase] = useState<SessionPhase>(isGenerating ? 'generating' : 'task_display');
  const [solutionText, setSolutionText] = useState('');
  const [solutionImage, setSolutionImage] = useState<string | null>(null);
  const [solutionImageFile, setSolutionImageFile] = useState<File | null>(null);
  const [feedback, setFeedback] = useState('');
  const [isCorrect, setIsCorrect] = useState<boolean | null>(null);
  const [fullSolution, setFullSolution] = useState<MathSolution | null>(currentTask.fullSolution || null);
  const [additionalPrompt, setAdditionalPrompt] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [showHistory, setShowHistory] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  React.useEffect(() => {
    if (!isGenerating && phase === 'generating') {
      setPhase('task_display');
    }
  }, [isGenerating, phase]);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file && file.type.startsWith('image/')) {
      const reader = new FileReader();
      reader.onloadend = () => {
        setSolutionImage(reader.result as string);
        setSolutionImageFile(file);
      };
      reader.readAsDataURL(file);
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
            setSolutionImage(reader.result as string);
            setSolutionImageFile(file);
          };
          reader.readAsDataURL(file);
          return;
        }
      }
    }
  }, []);

  const removeImage = () => {
    setSolutionImage(null);
    setSolutionImageFile(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleCheckSolution = async () => {
    if (!solutionText.trim() && !solutionImage) {
      setError('Bitte gib eine Lösung ein oder lade ein Bild hoch.');
      return;
    }

    setPhase('checking');
    setError(null);

    try {
      const result = await checkPracticeSolution(
        currentTask.taskText,
        solutionText || undefined,
        solutionImage || undefined,
        solutionImageFile?.type
      );

      setIsCorrect(result.isCorrect);
      setFeedback(result.feedback);

      const updatedTask: PracticeTask = {
        ...currentTask,
        userSolution: solutionText || undefined,
        userSolutionImage: solutionImage || undefined,
        isCorrect: result.isCorrect,
        aiFeedback: result.feedback
      };
      onTaskUpdated(updatedTask);

      setPhase(result.isCorrect ? 'result_correct' : 'result_wrong');
    } catch (err: any) {
      setError(err.message || 'Fehler beim Überprüfen.');
      setPhase('task_display');
    }
  };

  const handleShowSolution = async (skipCheck?: boolean) => {
    const prevPhase = phase;
    setPhase('loading_solution');
    setError(null);

    if (skipCheck) {
      setIsCorrect(false);
      const skippedTask: PracticeTask = {
        ...currentTask,
        isCorrect: false,
        aiFeedback: 'Lösung ohne eigenen Versuch angezeigt.'
      };
      onTaskUpdated(skippedTask);
    }

    try {
      const solution = await solvePracticeTask(currentTask.taskText);
      setFullSolution(solution);

      const updatedTask: PracticeTask = {
        ...currentTask,
        fullSolution: solution,
        userSolution: solutionText || undefined,
        userSolutionImage: solutionImage || undefined,
        isCorrect: skipCheck ? false : (isCorrect ?? false),
        aiFeedback: skipCheck ? 'Lösung ohne eigenen Versuch angezeigt.' : feedback
      };
      onTaskUpdated(updatedTask);

      setPhase('showing_solution');
    } catch (err: any) {
      setError(err.message || 'Fehler beim Erstellen der Lösung.');
      setPhase(skipCheck ? 'task_display' : (prevPhase === 'result_wrong' || isCorrect === false ? 'result_wrong' : 'result_correct'));
    }
  };

  const handleNextTask = () => {
    setPhase('next_prompt');
  };

  const handleGenerateNext = () => {
    const prompt = additionalPrompt.trim() || undefined;
    setSolutionText('');
    setSolutionImage(null);
    setSolutionImageFile(null);
    setFeedback('');
    setIsCorrect(null);
    setFullSolution(null);
    setAdditionalPrompt('');
    setError(null);
    setPhase('generating');
    onNextTask(prompt);
  };

  const completedTasks = room.generatedTasks.filter(t => t.isCorrect !== undefined);
  const correctCount = room.generatedTasks.filter(t => t.isCorrect === true).length;
  const taskNumber = room.generatedTasks.findIndex(t => t.id === currentTask.id) + 1;

  if (phase === 'generating') {
    return (
      <div className="w-full max-w-4xl">
        <div className="bg-white rounded-2xl sm:rounded-3xl shadow-xl border border-slate-100 p-8 sm:p-12 text-center">
          <div className="inline-block relative w-20 h-20 mb-6">
            <div className="absolute top-0 left-0 w-full h-full border-4 border-indigo-100 rounded-full animate-pulse" />
            <div className="absolute top-0 left-0 w-full h-full border-t-4 border-indigo-600 rounded-full animate-spin" />
          </div>
          <p className="text-indigo-900 font-medium animate-pulse">
            Die KI erstellt eine Übungsaufgabe für dich …
          </p>
        </div>
      </div>
    );
  }

  if (phase === 'loading_solution') {
    return (
      <div className="w-full max-w-4xl space-y-4">
        <div className="flex items-center justify-between px-1">
          <button
            onClick={onBack}
            className="flex items-center gap-1.5 text-sm text-slate-500 hover:text-indigo-600 transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
            Zurück
          </button>
        </div>

        <div className="bg-white rounded-2xl sm:rounded-3xl shadow-xl border border-slate-100 overflow-hidden">
          <div className="bg-gradient-to-r from-indigo-500 to-purple-500 px-5 sm:px-7 py-4 text-white">
            <p className="text-xs uppercase tracking-wider text-white/70 font-medium">Lösung wird erstellt</p>
            <p className="text-sm text-white/80 mt-0.5">{room.topic} · {room.difficulty}</p>
          </div>

          <div className="p-5 sm:p-7 space-y-6">
            <div className="flex items-center gap-3 mb-2">
              <Loader2 className="w-5 h-5 text-indigo-500 animate-spin" />
              <p className="text-indigo-900 font-medium">Die KI erstellt die Schritt-für-Schritt Lösung …</p>
            </div>

            {[1, 2, 3].map(i => (
              <div key={i} className="animate-pulse space-y-3">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-full bg-indigo-100 flex-shrink-0" />
                  <div className="h-5 bg-slate-200 rounded-lg w-48" />
                </div>
                <div className="ml-11 space-y-2">
                  <div className="h-3.5 bg-slate-100 rounded w-full" />
                  <div className="h-3.5 bg-slate-100 rounded w-5/6" />
                  <div className="h-3.5 bg-slate-100 rounded w-2/3" />
                </div>
                <div className="ml-11 h-10 bg-indigo-50 rounded-xl w-3/4" />
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  if (phase === 'showing_solution' && fullSolution) {
    return (
      <div className="w-full max-w-4xl">
        <SolutionViewer
          solution={fullSolution}
          onReset={() => handleNextTask()}
          initialPrompt={currentTask.taskText}
        />
      </div>
    );
  }

  return (
    <div className="w-full max-w-4xl space-y-4">
      {/* Stats bar */}
      <div className="flex items-center justify-between px-1">
        <button
          onClick={onBack}
          className="flex items-center gap-1.5 text-sm text-slate-500 hover:text-indigo-600 transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          Zurück
        </button>
        <div className="flex items-center gap-3 text-sm text-slate-500">
          <span>Aufgabe <strong className="text-slate-700">{taskNumber}</strong></span>
          {completedTasks.length > 0 && (
            <span className="px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 text-xs font-medium">
              {correctCount}/{completedTasks.length} richtig
            </span>
          )}
        </div>
      </div>

      {/* Task card */}
      <div className="bg-white rounded-2xl sm:rounded-3xl shadow-xl border border-slate-100 overflow-hidden">
        <div className="bg-gradient-to-r from-indigo-500 to-purple-500 px-5 sm:px-7 py-4 text-white">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs uppercase tracking-wider text-white/70 font-medium">Übungsaufgabe</p>
              <p className="text-sm text-white/80 mt-0.5">{room.topic} · {room.difficulty}</p>
            </div>
            {completedTasks.length > 0 && (
              <button
                onClick={() => setShowHistory(!showHistory)}
                className="flex items-center gap-1 text-xs text-white/70 hover:text-white transition-colors"
              >
                {showHistory ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                Verlauf
              </button>
            )}
          </div>
        </div>

        {/* Task history collapsible */}
        {showHistory && completedTasks.length > 0 && (
          <div className="border-b border-slate-100 bg-slate-50 px-5 sm:px-7 py-3 max-h-48 overflow-y-auto">
            <div className="space-y-2">
              {room.generatedTasks.filter(t => t.id !== currentTask.id && t.isCorrect !== undefined).map((t, i) => (
                <div key={t.id} className="flex items-start gap-2 text-sm">
                  {t.isCorrect ? (
                    <CheckCircle2 className="w-4 h-4 text-emerald-500 mt-0.5 flex-shrink-0" />
                  ) : (
                    <XCircle className="w-4 h-4 text-red-400 mt-0.5 flex-shrink-0" />
                  )}
                  <span className="text-slate-600 line-clamp-2">
                    <MathRenderer content={t.taskText} />
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="p-5 sm:p-7">
          {/* The task */}
          <div className="prose prose-slate max-w-none text-base sm:text-lg leading-relaxed mb-6">
            <MathRenderer content={currentTask.taskText} />
          </div>

          {/* Solution input phase */}
          {(phase === 'task_display' || phase === 'checking') && (
            <div className="space-y-4 border-t border-slate-100 pt-5">
              <label className="block text-sm font-semibold text-slate-700">
                Deine Lösung
              </label>
              <textarea
                value={solutionText}
                onChange={e => setSolutionText(e.target.value)}
                onPaste={handlePaste}
                placeholder="Gib hier deine Lösung ein … oder lade ein Bild hoch (Strg+V)"
                className="w-full h-32 p-4 bg-slate-50 rounded-2xl border border-slate-200 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200 focus:bg-white transition-all resize-none text-slate-700 text-base placeholder:text-slate-400"
                disabled={phase === 'checking'}
              />

              {!solutionImage ? (
                <div
                  onClick={() => fileInputRef.current?.click()}
                  className="w-full h-24 border-2 border-dashed border-slate-300 rounded-2xl flex flex-col items-center justify-center bg-slate-50 hover:bg-indigo-50 hover:border-indigo-400 transition-all cursor-pointer group"
                >
                  <ImageIcon className="w-5 h-5 text-indigo-500 mb-1.5 group-hover:scale-110 transition-transform" />
                  <p className="text-slate-600 text-sm font-medium">Foto der Lösung hochladen</p>
                  <p className="text-xs text-slate-400 mt-0.5">Klicken oder Strg+V</p>
                </div>
              ) : (
                <div className="relative w-full rounded-2xl overflow-hidden border border-slate-200 bg-slate-900 group">
                  <img
                    src={solutionImage}
                    alt="Lösung"
                    className="w-full h-40 object-contain opacity-90"
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

              {error && (
                <div className="p-3 bg-red-50 border border-red-100 rounded-lg flex items-center space-x-2 text-red-600 text-sm">
                  <X className="w-4 h-4 flex-shrink-0" />
                  <span>{error}</span>
                </div>
              )}

              <div className="flex flex-col sm:flex-row gap-2 justify-end">
                <button
                  onClick={() => handleShowSolution(true)}
                  disabled={phase === 'checking'}
                  className="flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl text-sm font-semibold border border-slate-200 text-slate-600 hover:bg-slate-50 disabled:opacity-50 transition-colors"
                >
                  <Eye className="w-4 h-4" />
                  Lösung anzeigen
                </button>
                <button
                  onClick={handleCheckSolution}
                  disabled={phase === 'checking' || (!solutionText.trim() && !solutionImage)}
                  className="w-full sm:w-auto justify-center bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed text-white px-6 py-3 rounded-xl font-bold text-base shadow-lg shadow-indigo-200 flex items-center space-x-2 transition-all active:scale-95"
                >
                  {phase === 'checking' ? (
                    <>
                      <Loader2 className="w-5 h-5 animate-spin" />
                      <span>Wird geprüft …</span>
                    </>
                  ) : (
                    <>
                      <CheckCircle2 className="w-5 h-5" />
                      <span>Lösung prüfen</span>
                    </>
                  )}
                </button>
              </div>
            </div>
          )}

          {/* Correct result */}
          {phase === 'result_correct' && (
            <div className="space-y-4 border-t border-slate-100 pt-5">
              <div className="p-4 bg-emerald-50 border border-emerald-200 rounded-2xl">
                <div className="flex items-start gap-3">
                  <CheckCircle2 className="w-6 h-6 text-emerald-600 mt-0.5 flex-shrink-0" />
                  <div>
                    <p className="font-semibold text-emerald-800 mb-1">Richtig!</p>
                    <div className="text-emerald-700 text-sm">
                      <MathRenderer content={feedback} />
                    </div>
                  </div>
                </div>
              </div>
              <div className="flex flex-col sm:flex-row gap-2 justify-end">
                <button
                  onClick={() => handleShowSolution()}
                  className="flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl text-sm font-semibold border border-slate-200 text-slate-600 hover:bg-slate-50 transition-colors"
                >
                  <Eye className="w-4 h-4" />
                  Lösungsweg anzeigen
                </button>
                <button
                  onClick={handleNextTask}
                  className="flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl text-sm font-bold bg-indigo-600 hover:bg-indigo-700 text-white shadow-lg shadow-indigo-200 transition-all active:scale-95"
                >
                  <ArrowRight className="w-4 h-4" />
                  Nächste Aufgabe
                </button>
              </div>
            </div>
          )}

          {/* Wrong result */}
          {phase === 'result_wrong' && (
            <div className="space-y-4 border-t border-slate-100 pt-5">
              <div className="p-4 bg-red-50 border border-red-200 rounded-2xl">
                <div className="flex items-start gap-3">
                  <XCircle className="w-6 h-6 text-red-500 mt-0.5 flex-shrink-0" />
                  <div>
                    <p className="font-semibold text-red-800 mb-1">Leider nicht richtig</p>
                    <div className="text-red-700 text-sm">
                      <MathRenderer content={feedback} />
                    </div>
                  </div>
                </div>
              </div>

              {error && (
                <div className="p-3 bg-red-50 border border-red-100 rounded-lg flex items-center space-x-2 text-red-600 text-sm">
                  <X className="w-4 h-4 flex-shrink-0" />
                  <span>{error}</span>
                </div>
              )}

              <div className="flex flex-col sm:flex-row gap-2 justify-end">
                <button
                  onClick={() => {
                    setPhase('task_display');
                    setError(null);
                  }}
                  className="flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl text-sm font-semibold border border-slate-200 text-slate-600 hover:bg-slate-50 transition-colors"
                >
                  <RefreshCw className="w-4 h-4" />
                  Nochmal versuchen
                </button>
                <button
                  onClick={handleShowSolution}
                  className="flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl text-sm font-bold bg-indigo-600 hover:bg-indigo-700 text-white shadow-lg shadow-indigo-200 transition-all active:scale-95"
                >
                  <Eye className="w-4 h-4" />
                  Lösung anzeigen
                </button>
              </div>
            </div>
          )}

          {/* Next task prompt */}
          {phase === 'next_prompt' && (
            <div className="space-y-4 border-t border-slate-100 pt-5">
              <label className="block text-sm font-semibold text-slate-700">
                Anweisungen für die nächste Aufgabe <span className="font-normal text-slate-400">(optional)</span>
              </label>
              <textarea
                value={additionalPrompt}
                onChange={e => setAdditionalPrompt(e.target.value)}
                placeholder="z. B. Schwieriger machen, mehr Textaufgaben, anderer Aufgabentyp …"
                className="w-full h-24 p-4 bg-slate-50 rounded-2xl border border-slate-200 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200 focus:bg-white transition-all resize-none text-slate-700 text-base placeholder:text-slate-400"
              />
              <div className="flex justify-end">
                <button
                  onClick={handleGenerateNext}
                  className="w-full sm:w-auto justify-center bg-indigo-600 hover:bg-indigo-700 text-white px-6 py-3 rounded-xl font-bold text-base shadow-lg shadow-indigo-200 flex items-center space-x-2 transition-all active:scale-95"
                >
                  <Send className="w-5 h-5" />
                  <span>Nächste Aufgabe generieren</span>
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default PracticeSession;
