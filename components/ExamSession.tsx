import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowLeft, ArrowRight, Clock3, Download, FileText, FileWarning, ImageIcon, Loader2, Send, X } from 'lucide-react';
import { ExamSession as ExamSessionType, ExamTask } from '../types';
import MathRenderer from './MathRenderer';

interface ExamSessionProps {
  session: ExamSessionType;
  isSubmitting: boolean;
  onTaskUpdated: (task: ExamTask) => void;
  onSubmit: (reason: 'manual' | 'timeout') => void;
  onBack: () => void;
  onDownloadMarkdown: () => void;
  onDownloadPdf: () => void;
}

const formatClock = (seconds: number) => {
  const safe = Math.max(0, seconds);
  const mins = Math.floor(safe / 60);
  const secs = safe % 60;
  return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
};

const ExamSession: React.FC<ExamSessionProps> = ({
  session,
  isSubmitting,
  onTaskUpdated,
  onSubmit,
  onBack,
  onDownloadMarkdown,
  onDownloadPdf
}) => {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [remainingSeconds, setRemainingSeconds] = useState(() =>
    Math.max(0, Math.floor((session.endsAt - Date.now()) / 1000))
  );
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const timeoutSubmissionStarted = useRef(false);

  const currentTask = session.tasks[currentIndex];
  const answeredCount = useMemo(
    () => session.tasks.filter(task => (task.userSolution ?? '').trim() || task.userSolutionImage).length,
    [session.tasks]
  );

  useEffect(() => {
    const update = () => {
      setRemainingSeconds(Math.max(0, Math.floor((session.endsAt - Date.now()) / 1000)));
    };
    update();
    const id = window.setInterval(update, 1000);
    return () => window.clearInterval(id);
  }, [session.endsAt]);

  useEffect(() => {
    if (remainingSeconds > 0 || isSubmitting || timeoutSubmissionStarted.current || session.status !== 'running') {
      return;
    }
    timeoutSubmissionStarted.current = true;
    onSubmit('timeout');
  }, [isSubmitting, onSubmit, remainingSeconds, session.status]);

  const handleUpdateCurrentTask = (changes: Partial<ExamTask>) => {
    if (!currentTask) return;
    onTaskUpdated({ ...currentTask, ...changes });
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      setError('Bitte eine gültige Bilddatei auswählen.');
      return;
    }

    const reader = new FileReader();
    reader.onloadend = () => {
      handleUpdateCurrentTask({
        userSolutionImage: reader.result as string
      });
      setError(null);
    };
    reader.readAsDataURL(file);
  };

  const handlePaste = (e: React.ClipboardEvent) => {
    const items = e.clipboardData.items;
    for (let i = 0; i < items.length; i++) {
      if (items[i].type.includes('image')) {
        e.preventDefault();
        const file = items[i].getAsFile();
        if (!file) return;
        const reader = new FileReader();
        reader.onloadend = () => {
          handleUpdateCurrentTask({
            userSolutionImage: reader.result as string
          });
          setError(null);
        };
        reader.readAsDataURL(file);
        return;
      }
    }
  };

  const removeImage = () => {
    handleUpdateCurrentTask({ userSolutionImage: undefined });
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleManualSubmit = () => {
    if (isSubmitting) return;
    const confirmSubmit = window.confirm('Prüfung jetzt abgeben? Danach sind keine Änderungen mehr möglich.');
    if (!confirmSubmit) return;
    onSubmit('manual');
  };

  const warning = remainingSeconds <= Math.max(60, session.durationMinutes * 12);

  if (!currentTask) {
    return (
      <div className="w-full max-w-4xl bg-white rounded-2xl sm:rounded-3xl shadow-xl border border-slate-100 p-8">
        <p className="text-slate-600">Keine Prüfungsaufgaben verfügbar.</p>
      </div>
    );
  }

  return (
    <div className="w-full max-w-4xl space-y-4">
      <div className="flex flex-col gap-2 px-1 sm:flex-row sm:items-center sm:justify-between">
        <button
          onClick={onBack}
          className="flex items-center gap-1.5 text-sm text-slate-500 hover:text-indigo-600 transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          Zurück
        </button>
        <div className="flex flex-wrap items-center gap-2 sm:justify-end">
          <button
            onClick={onDownloadMarkdown}
            className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:border-indigo-200 hover:bg-indigo-50 hover:text-indigo-700 transition-colors"
          >
            <FileText className="w-3.5 h-3.5" />
            Markdown
          </button>
          <button
            onClick={onDownloadPdf}
            className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:border-indigo-200 hover:bg-indigo-50 hover:text-indigo-700 transition-colors"
          >
            <Download className="w-3.5 h-3.5" />
            PDF
          </button>
          <div className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-semibold ${warning ? 'bg-red-50 text-red-700' : 'bg-indigo-50 text-indigo-700'}`}>
            <Clock3 className="w-4 h-4" />
            {formatClock(remainingSeconds)}
          </div>
        </div>
      </div>

      <div className="bg-white rounded-2xl sm:rounded-3xl shadow-xl border border-slate-100 overflow-hidden">
        <div className="bg-gradient-to-r from-indigo-500 to-purple-500 px-5 sm:px-7 py-4 text-white">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-xs uppercase tracking-wider text-white/70 font-medium">Prüfung läuft</p>
              <p className="text-sm text-white/80 mt-0.5">{session.topic} · {session.difficulty}</p>
            </div>
            <div className="text-right text-xs text-white/80">
              <div>{answeredCount}/{session.taskCount} beantwortet</div>
              <div>Aufgabe {currentIndex + 1}/{session.taskCount}</div>
            </div>
          </div>
        </div>

        <div className="px-5 sm:px-7 pt-4">
          <div className="w-full h-2 bg-slate-100 rounded-full overflow-hidden">
            <div
              className="h-full bg-indigo-500 rounded-full transition-all"
              style={{ width: `${(answeredCount / session.taskCount) * 100}%` }}
            />
          </div>
        </div>

        <div className="p-5 sm:p-7 space-y-5">
          <div className="prose prose-slate max-w-none text-base sm:text-lg leading-relaxed">
            <MathRenderer content={currentTask.taskText} />
          </div>

          <div className="space-y-3 border-t border-slate-100 pt-4">
            <label className="block text-sm font-semibold text-slate-700">Deine Lösung</label>
            <textarea
              value={currentTask.userSolution ?? ''}
              onChange={e => handleUpdateCurrentTask({ userSolution: e.target.value })}
              onPaste={handlePaste}
              placeholder="Rechenweg/Lösung hier eingeben ... oder Bild einfügen (Strg+V)"
              className="w-full h-32 p-4 bg-slate-50 rounded-2xl border border-slate-200 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200 focus:bg-white transition-all resize-none text-slate-700 text-base placeholder:text-slate-400"
              disabled={isSubmitting}
            />

            {!currentTask.userSolutionImage ? (
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
                <img src={currentTask.userSolutionImage} alt="Lösung" className="w-full h-40 object-contain opacity-90" />
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
                <FileWarning className="w-4 h-4 flex-shrink-0" />
                <span>{error}</span>
              </div>
            )}
          </div>

          <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-2 border-t border-slate-100 pt-4">
            <div className="flex gap-2">
              <button
                onClick={() => setCurrentIndex(prev => Math.max(0, prev - 1))}
                disabled={currentIndex === 0 || isSubmitting}
                className="px-4 py-2.5 rounded-xl text-sm font-semibold border border-slate-200 text-slate-600 hover:bg-slate-50 disabled:opacity-50"
              >
                <span className="inline-flex items-center gap-1">
                  <ArrowLeft className="w-4 h-4" />
                  Zurück
                </span>
              </button>
              <button
                onClick={() => setCurrentIndex(prev => Math.min(session.tasks.length - 1, prev + 1))}
                disabled={currentIndex === session.tasks.length - 1 || isSubmitting}
                className="px-4 py-2.5 rounded-xl text-sm font-semibold border border-slate-200 text-slate-600 hover:bg-slate-50 disabled:opacity-50"
              >
                <span className="inline-flex items-center gap-1">
                  Weiter
                  <ArrowRight className="w-4 h-4" />
                </span>
              </button>
            </div>

            <button
              onClick={handleManualSubmit}
              disabled={isSubmitting}
              className="w-full sm:w-auto justify-center bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed text-white px-6 py-3 rounded-xl font-bold text-base shadow-lg shadow-indigo-200 flex items-center space-x-2 transition-all active:scale-95"
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="w-5 h-5 animate-spin" />
                  <span>Wird abgegeben ...</span>
                </>
              ) : (
                <>
                  <Send className="w-5 h-5" />
                  <span>Abgeben</span>
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ExamSession;
