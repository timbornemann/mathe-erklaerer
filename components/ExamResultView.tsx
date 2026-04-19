import React, { useState } from 'react';
import { CheckCircle2, ChevronDown, ChevronUp, Download, Eye, FileText, XCircle } from 'lucide-react';
import { ExamSession } from '../types';
import MathRenderer from './MathRenderer';

interface ExamResultViewProps {
  session: ExamSession;
  onBackToSetup: () => void;
  onDownloadMarkdown: () => void;
  onDownloadPdf: () => void;
}

const gradeText = (score: number) => {
  if (score >= 90) return 'Sehr gut';
  if (score >= 75) return 'Gut';
  if (score >= 60) return 'Befriedigend';
  if (score >= 45) return 'Ausreichend';
  return 'Verbesserungsbedarf';
};

const ExamResultView: React.FC<ExamResultViewProps> = ({
  session,
  onBackToSetup,
  onDownloadMarkdown,
  onDownloadPdf
}) => {
  const [openSolutionIds, setOpenSolutionIds] = useState<Record<string, boolean>>({});
  const score = session.scorePercent ?? 0;
  const correct = session.correctCount ?? 0;
  const wrong = session.wrongCount ?? session.tasks.length - correct;

  const toggleSolution = (taskId: string) => {
    setOpenSolutionIds(prev => ({ ...prev, [taskId]: !prev[taskId] }));
  };

  return (
    <div className="w-full max-w-4xl space-y-4">
      <div className="bg-white rounded-2xl sm:rounded-3xl shadow-xl border border-slate-100 overflow-hidden">
        <div className="bg-gradient-to-r from-indigo-500 to-purple-500 px-5 sm:px-7 py-5 text-white">
          <p className="text-xs uppercase tracking-wider text-white/70 font-medium">Prüfungsergebnis</p>
          <h2 className="text-xl sm:text-2xl font-bold mt-1">{session.topic}</h2>
          <p className="text-sm text-white/80 mt-0.5">{session.difficulty}</p>
        </div>

        <div className="p-5 sm:p-7 space-y-4">
          <div className="grid sm:grid-cols-4 gap-3">
            <div className="rounded-xl border border-indigo-100 bg-indigo-50 p-3">
              <p className="text-xs text-indigo-600 font-medium">Score</p>
              <p className="text-2xl font-bold text-indigo-900">{score}%</p>
            </div>
            <div className="rounded-xl border border-emerald-100 bg-emerald-50 p-3">
              <p className="text-xs text-emerald-600 font-medium">Richtig</p>
              <p className="text-2xl font-bold text-emerald-800">{correct}</p>
            </div>
            <div className="rounded-xl border border-red-100 bg-red-50 p-3">
              <p className="text-xs text-red-600 font-medium">Falsch</p>
              <p className="text-2xl font-bold text-red-700">{wrong}</p>
            </div>
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
              <p className="text-xs text-slate-500 font-medium">Bewertung</p>
              <p className="text-xl font-bold text-slate-800">{gradeText(score)}</p>
            </div>
          </div>

          {session.feedbackSummary && (
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm text-slate-700">
              <MathRenderer content={session.feedbackSummary} />
            </div>
          )}

          <div className="flex flex-wrap gap-2">
            <button
              onClick={onDownloadMarkdown}
              className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700 hover:border-indigo-200 hover:text-indigo-700 hover:bg-indigo-50 transition-colors"
            >
              <FileText className="w-4 h-4" />
              Pruefung als Markdown
            </button>
            <button
              onClick={onDownloadPdf}
              className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700 hover:border-indigo-200 hover:text-indigo-700 hover:bg-indigo-50 transition-colors"
            >
              <Download className="w-4 h-4" />
              Pruefung als PDF
            </button>
          </div>
        </div>
      </div>

      <div className="space-y-3">
        {session.tasks.map(task => {
          const isOpen = !!openSolutionIds[task.id];
          return (
            <div key={task.id} className="bg-white rounded-2xl border border-slate-100 shadow-sm p-4 sm:p-5">
              <div className="flex items-start justify-between gap-2 mb-2">
                <div className="text-sm font-semibold text-slate-700">Aufgabe {task.order}</div>
                {task.isCorrect ? (
                  <span className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-700 bg-emerald-50 px-2 py-1 rounded-full">
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    Richtig
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1 text-xs font-semibold text-red-700 bg-red-50 px-2 py-1 rounded-full">
                    <XCircle className="w-3.5 h-3.5" />
                    Falsch
                  </span>
                )}
              </div>

              <div className="text-slate-700 text-sm mb-3">
                <MathRenderer content={task.taskText} />
              </div>

              {task.aiFeedback && (
                <div className="text-sm rounded-lg bg-slate-50 border border-slate-200 p-3 mb-3">
                  <span className="text-slate-500 font-medium">Feedback: </span>
                  <MathRenderer content={task.aiFeedback} />
                </div>
              )}

              {task.fullSolution && (
                <div className="border-t border-slate-100 pt-3">
                  <button
                    onClick={() => toggleSolution(task.id)}
                    className="inline-flex items-center gap-1.5 text-sm font-medium text-indigo-600 hover:text-indigo-700"
                  >
                    <Eye className="w-4 h-4" />
                    Lösung anzeigen
                    {isOpen ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                  </button>
                  {isOpen && (
                    <div className="mt-3 space-y-2 text-sm">
                      {task.fullSolution.steps.map((step, index) => (
                        <div key={`${task.id}-step-${index}`} className="rounded-lg border border-slate-100 bg-slate-50 p-3">
                          <p className="font-semibold text-slate-700 mb-1">{step.title}</p>
                          <MathRenderer content={step.explanation} />
                        </div>
                      ))}
                      <div className="rounded-lg border border-indigo-100 bg-indigo-50 p-3">
                        <p className="font-semibold text-indigo-900 mb-1">Ergebnis</p>
                        <MathRenderer content={task.fullSolution.finalAnswer} />
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      <div className="flex justify-end">
        <button
          onClick={onBackToSetup}
          className="bg-indigo-600 hover:bg-indigo-700 text-white px-6 py-3 rounded-xl font-semibold shadow-lg shadow-indigo-200 transition-all active:scale-95"
        >
          Neue Prüfung starten
        </button>
      </div>
    </div>
  );
};

export default ExamResultView;
