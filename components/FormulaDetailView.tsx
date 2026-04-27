import React, { useEffect, useMemo, useState } from 'react';
import {
  ArrowLeft,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  List,
  Loader2,
  Pencil,
  RotateCcw,
  Save,
  Trash2,
  X
} from 'lucide-react';
import MathRenderer from './MathRenderer';
import { FormulaEntry, FormulaLesson, FormulaLessonCard, Project } from '../types';

interface FormulaDetailViewProps {
  formula: FormulaEntry;
  projects?: Project[];
  onBack: () => void;
  onGeneratePremium?: () => void;
  onMarkUsed?: () => void;
  onDelete?: () => void;
  onRetryFormula?: () => void;
  onUpdateFormula?: (formulaId: string, updates: Partial<FormulaEntry>) => void;
}

const isEscapedAt = (text: string, index: number): boolean => {
  let backslashes = 0;
  for (let i = index - 1; i >= 0 && text[i] === '\\'; i -= 1) {
    backslashes += 1;
  }
  return backslashes % 2 === 1;
};

const repairLatexBraces = (input: string): string => {
  const text = input.trim();
  if (!text) return text;

  let openBraces = 0;
  let repaired = '';

  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i];
    const escaped = isEscapedAt(text, i);
    if (ch === '{' && !escaped) {
      openBraces += 1;
      repaired += ch;
      continue;
    }
    if (ch === '}' && !escaped) {
      if (openBraces > 0) {
        openBraces -= 1;
        repaired += ch;
      }
      continue;
    }
    repaired += ch;
  }

  if (openBraces > 0) repaired += '}'.repeat(openBraces);
  return repaired;
};

const toDisplayMath = (formula: string): string => `$$ ${repairLatexBraces(formula)} $$`;

const buildFallbackLearningPath = (formula: FormulaEntry): FormulaLesson[] => [
  {
    title: 'Grundlagen',
    goal: formula.summary || 'Diese Formel wird aktuell als kompakte Basisansicht dargestellt.',
    takeaway: formula.summary || 'Generiere den Lernpfad neu, um alle Lektionen zu erhalten.',
    cards: [
      {
        title: 'Ueberblick',
        explanation:
          formula.summary ||
          'Zu dieser Formel ist noch kein vollstaendiger Lernpfad vorhanden. Starte die Generierung fuer eine detaillierte Lektionen-Ansicht.',
        formulas: [formula.formula]
      }
    ]
  }
];

type LearningUnit = {
  lessonIndex: number;
  cardIndex: number;
  lesson: FormulaLesson;
  card: FormulaLessonCard;
};

const statusLabel = (status: FormulaEntry['status']): string =>
  status === 'pending' ? 'Wird erstellt' : status === 'failed' ? 'Fehlgeschlagen' : 'Bereit';

const statusBadgeClass = (status: FormulaEntry['status']): string =>
  status === 'pending'
    ? 'border-amber-200 bg-amber-50 text-amber-700'
    : status === 'failed'
    ? 'border-red-200 bg-red-50 text-red-700'
    : 'border-emerald-200 bg-emerald-50 text-emerald-700';

const FormulaDetailView: React.FC<FormulaDetailViewProps> = ({
  formula,
  projects = [],
  onBack,
  onGeneratePremium: _onGeneratePremium,
  onMarkUsed,
  onDelete,
  onRetryFormula,
  onUpdateFormula
}) => {
  const [currentUnitIndex, setCurrentUnitIndex] = useState(0);
  const [isTocOpenMobile, setIsTocOpenMobile] = useState(false);
  const [isEditOpen, setIsEditOpen] = useState(false);
  const [editTitle, setEditTitle] = useState('');
  const [editSummary, setEditSummary] = useState('');
  const [editTags, setEditTags] = useState('');
  const [editProjectIds, setEditProjectIds] = useState<string[]>([]);

  const learningPath = useMemo<FormulaLesson[]>(() => {
    const sanitized = formula.learningPath
      .map((lesson) => ({
        ...lesson,
        cards: lesson.cards.filter((card) => card.title.trim() || card.explanation.trim() || card.formulas.length > 0)
      }))
      .filter((lesson) => lesson.title.trim() || lesson.goal.trim() || lesson.cards.length > 0 || lesson.takeaway.trim())
      .map((lesson) => ({
        ...lesson,
        title: lesson.title.trim() || 'Lektion',
        cards:
          lesson.cards.length > 0
            ? lesson.cards
            : [{ title: 'Kernidee', explanation: lesson.goal || lesson.takeaway, formulas: [] }]
      }));

    return sanitized.length > 0 ? sanitized : buildFallbackLearningPath(formula);
  }, [formula]);

  const units = useMemo<LearningUnit[]>(() => {
    const next: LearningUnit[] = [];
    learningPath.forEach((lesson, lessonIndex) => {
      lesson.cards.forEach((card, cardIndex) => {
        next.push({ lessonIndex, cardIndex, lesson, card });
      });
    });
    return next;
  }, [learningPath]);

  const currentUnit = units[currentUnitIndex] ?? units[0] ?? null;
  const totalUnits = units.length;
  const progress = totalUnits > 0 ? ((currentUnitIndex + 1) / totalUnits) * 100 : 0;
  const isFirst = currentUnitIndex <= 0;
  const isLast = currentUnitIndex >= totalUnits - 1;

  useEffect(() => {
    setCurrentUnitIndex(0);
    setIsTocOpenMobile(false);
    setIsEditOpen(false);
  }, [formula.id]);

  useEffect(() => {
    if (currentUnitIndex < totalUnits) return;
    setCurrentUnitIndex(Math.max(0, totalUnits - 1));
  }, [currentUnitIndex, totalUnits]);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      if (/^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName) || target.isContentEditable) return;

      if (e.key === 'ArrowRight' && !isLast) {
        e.preventDefault();
        setCurrentUnitIndex((idx) => idx + 1);
      }
      if (e.key === 'ArrowLeft' && !isFirst) {
        e.preventDefault();
        setCurrentUnitIndex((idx) => idx - 1);
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [isFirst, isLast]);

  const navigateToUnit = (lessonIndex: number, cardIndex: number, closeAfterNavigate = false) => {
    const targetIndex = units.findIndex((unit) => unit.lessonIndex === lessonIndex && unit.cardIndex === cardIndex);
    if (targetIndex < 0) return;
    setCurrentUnitIndex(targetIndex);
    if (closeAfterNavigate) setIsTocOpenMobile(false);
  };

  const openEditModal = () => {
    setEditTitle(formula.title);
    setEditSummary(formula.summary);
    setEditTags(formula.tags.join(', '));
    setEditProjectIds(formula.projectIds);
    setIsEditOpen(true);
  };

  const closeEditModal = () => {
    setIsEditOpen(false);
  };

  const toggleEditProject = (projectId: string) => {
    setEditProjectIds((prev) => (prev.includes(projectId) ? prev.filter((id) => id !== projectId) : [...prev, projectId]));
  };

  const saveEdits = () => {
    if (!onUpdateFormula) return;
    const tags = editTags
      .split(/[,\n;]/)
      .map((tag) => tag.trim())
      .filter(Boolean);
    onUpdateFormula(formula.id, {
      title: editTitle.trim() || 'Neue Formel',
      summary: editSummary.trim(),
      tags,
      projectIds: editProjectIds
    });
    closeEditModal();
  };

  const renderTocEntries = (closeAfterNavigate = false) => (
    <>
      {learningPath.map((lesson, lessonIndex) => {
        const lessonUnits = units.filter((unit) => unit.lessonIndex === lessonIndex);
        const hasActiveCard = lessonUnits.some((unit) => units[currentUnitIndex] === unit);
        const isCompleted = lessonUnits.every((unit) => units.indexOf(unit) < currentUnitIndex);

        return (
          <div key={`lesson-${lessonIndex}`} className="mb-2">
            <button
              onClick={() => navigateToUnit(lessonIndex, 0, closeAfterNavigate)}
              className={`w-full rounded-xl border px-3 py-2.5 text-left transition-colors ${
                hasActiveCard ? 'border-indigo-200 bg-indigo-50' : 'border-slate-200 bg-white hover:bg-slate-50'
              }`}
            >
              <div className="flex items-start gap-2.5">
                <span
                  className={`mt-0.5 inline-flex h-6 w-6 items-center justify-center rounded-full text-[11px] font-bold ${
                    hasActiveCard ? 'bg-indigo-600 text-white' : 'bg-slate-200 text-slate-700'
                  }`}
                >
                  {lessonIndex + 1}
                </span>
                <div className="min-w-0 flex-1">
                  <p className={`truncate text-sm font-semibold ${hasActiveCard ? 'text-indigo-700' : 'text-slate-800'}`}>
                    {lesson.title}
                  </p>
                  <p className="text-[11px] text-slate-500">{lesson.cards.length} Karten</p>
                </div>
                {isCompleted ? <CheckCircle2 className="h-4 w-4 text-emerald-500" /> : null}
              </div>
            </button>

            <div className="ml-9 mt-1.5 space-y-1">
              {lesson.cards.map((card, cardIndex) => {
                const targetIndex = units.findIndex((unit) => unit.lessonIndex === lessonIndex && unit.cardIndex === cardIndex);
                const isActive = targetIndex === currentUnitIndex;
                return (
                  <button
                    key={`lesson-${lessonIndex}-card-${cardIndex}`}
                    onClick={() => navigateToUnit(lessonIndex, cardIndex, closeAfterNavigate)}
                    className={`w-full rounded-lg px-2.5 py-1.5 text-left text-xs transition-colors ${
                      isActive ? 'bg-indigo-100 text-indigo-700' : 'text-slate-600 hover:bg-slate-100'
                    }`}
                  >
                    {cardIndex + 1}. {card.title || `Karte ${cardIndex + 1}`}
                  </button>
                );
              })}
            </div>
          </div>
        );
      })}
    </>
  );

  if (!currentUnit) {
    return (
      <div className="rounded-2xl border border-slate-200 bg-white p-6 text-sm text-slate-500 shadow-sm">
        Keine Lerninhalte verfuegbar.
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {isTocOpenMobile && (
        <div className="fixed inset-0 z-50 xl:hidden">
          <button
            className="absolute inset-0 bg-slate-900/35"
            onClick={() => setIsTocOpenMobile(false)}
            aria-label="Inhaltsverzeichnis schliessen"
          />
          <div className="absolute left-0 top-0 flex h-full w-[88vw] max-w-sm flex-col border-r border-slate-200 bg-white shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
              <div>
                <p className="text-sm font-bold text-slate-800">Inhaltsverzeichnis</p>
                <p className="text-xs text-slate-500">{learningPath.length} Lektionen</p>
              </div>
              <button
                onClick={() => setIsTocOpenMobile(false)}
                className="rounded-lg p-2 text-slate-500 hover:bg-slate-100"
                aria-label="Schliessen"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto p-2">{renderTocEntries(true)}</div>
          </div>
        </div>
      )}

      <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-100 p-4 sm:p-5">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <button
                  onClick={onBack}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-100"
                >
                  <ArrowLeft className="h-3.5 w-3.5" />
                  Zurueck
                </button>
                <span className={`inline-flex rounded-full border px-2 py-0.5 text-[11px] font-semibold ${statusBadgeClass(formula.status)}`}>
                  {statusLabel(formula.status)}
                </span>
                <span className="rounded-full bg-indigo-100 px-2 py-0.5 text-[11px] font-semibold text-indigo-700">
                  Karte {currentUnitIndex + 1} / {Math.max(1, totalUnits)}
                </span>
                <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-semibold text-slate-700">
                  {learningPath.length} Lektionen
                </span>
              </div>
              <h2 className="mt-2 text-xl font-bold text-slate-800 sm:text-2xl">{formula.title}</h2>
              {formula.summary && (
                <div className="mt-2 max-w-4xl text-sm text-slate-600">
                  <MathRenderer content={formula.summary} />
                </div>
              )}
            </div>

            <div className="flex flex-wrap items-center justify-end gap-2">
              <button
                onClick={() => setIsTocOpenMobile(true)}
                className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 xl:hidden"
              >
                <List className="h-4 w-4 text-indigo-600" />
                Inhaltsverzeichnis
              </button>
              {onMarkUsed && (
                <button
                  onClick={onMarkUsed}
                  className="rounded-xl border border-indigo-200 bg-indigo-50 px-3 py-2 text-xs font-semibold text-indigo-700 hover:bg-indigo-100"
                >
                  Formel verwendet
                </button>
              )}
              {onUpdateFormula && (
                <button
                  onClick={openEditModal}
                  className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                >
                  <Pencil className="h-3.5 w-3.5" />
                  Bearbeiten
                </button>
              )}
              {formula.status === 'failed' && onRetryFormula && (
                <button
                  onClick={onRetryFormula}
                  className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-xs font-semibold text-red-700 hover:bg-red-100"
                >
                  Erneut generieren
                </button>
              )}
            </div>
          </div>

          <div className="mt-4 overflow-x-auto rounded-2xl border border-indigo-100 bg-indigo-50/70 p-4 text-center">
            <MathRenderer content={toDisplayMath(formula.formula)} />
          </div>

          {formula.status === 'pending' && (
            <p className="mt-3 inline-flex items-center gap-2 text-xs font-semibold text-amber-700">
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
              Die KI erstellt den Lernpfad mit Lektionen und Unterkarten.
            </p>
          )}

          <div className="mt-4 space-y-2">
            <div className="flex items-center justify-between gap-2 text-xs font-semibold text-slate-600">
              <p>Fortschritt im Lernpfad</p>
              <p>
                {currentUnitIndex + 1} / {Math.max(1, totalUnits)}
              </p>
            </div>
            <div className="h-2.5 w-full overflow-hidden rounded-full bg-slate-200">
              <div className="h-2.5 rounded-full bg-indigo-600 transition-all duration-500 ease-out" style={{ width: `${progress}%` }} />
            </div>
          </div>
        </div>

        <div className="grid xl:grid-cols-[280px_minmax(0,1fr)]">
          <aside className="hidden border-r border-slate-100 bg-slate-50/60 xl:block">
            <div className="sticky top-24 p-3">
              <p className="px-1 pb-2 text-sm font-semibold text-slate-700">Lernpfad</p>
              <div className="max-h-[72vh] space-y-1.5 overflow-y-auto pr-1">{renderTocEntries()}</div>
            </div>
          </aside>

          <section className="min-w-0">
            <div className="border-b border-indigo-100 bg-indigo-50 px-4 py-4 sm:px-6">
              <p className="text-xs font-semibold uppercase tracking-wide text-indigo-500">
                Lektion {currentUnit.lessonIndex + 1}
              </p>
              <h3 className="mt-1 text-lg font-bold text-indigo-700">{currentUnit.lesson.title}</h3>
              {currentUnit.lesson.goal && <p className="mt-2 text-sm text-indigo-800">{currentUnit.lesson.goal}</p>}
            </div>

            <div className="space-y-5 bg-white p-4 sm:p-6">
              <div className="flex items-center gap-3">
                <span className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-indigo-600 text-sm font-bold text-white shadow-sm">
                  {currentUnit.cardIndex + 1}
                </span>
                <h4 className="text-base font-bold text-slate-800 sm:text-lg">
                  {currentUnit.card.title || `Karte ${currentUnit.cardIndex + 1}`}
                </h4>
              </div>

              <div className="text-base leading-relaxed text-slate-700">
                <MathRenderer content={currentUnit.card.explanation} />
              </div>

              {currentUnit.card.formulas.length > 0 && (
                <div className="space-y-3 overflow-x-auto rounded-2xl border border-indigo-100 bg-indigo-50/70 p-4">
                  <p className="text-[11px] font-bold uppercase tracking-widest text-indigo-500">Formeln in dieser Karte</p>
                  {currentUnit.card.formulas.map((entry, index) => (
                    <div
                      key={`card-formula-${currentUnitIndex}-${index}`}
                      className="rounded-xl border border-white bg-white p-3 text-center shadow-sm"
                    >
                      <MathRenderer content={toDisplayMath(entry)} />
                    </div>
                  ))}
                </div>
              )}

              {(currentUnit.cardIndex === currentUnit.lesson.cards.length - 1 || isLast) && currentUnit.lesson.takeaway && (
                <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800">
                  <span className="font-semibold">Takeaway:</span> {currentUnit.lesson.takeaway}
                </div>
              )}
            </div>

            <div className="flex items-center justify-between gap-3 border-t border-slate-100 bg-white p-3 sm:p-4">
              <button
                onClick={() => setCurrentUnitIndex((index) => Math.max(0, index - 1))}
                disabled={isFirst}
                className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-semibold transition-colors ${
                  isFirst ? 'cursor-not-allowed text-slate-300' : 'text-slate-600 hover:bg-slate-50 hover:text-indigo-600'
                }`}
              >
                <ChevronLeft className="h-4 w-4" />
                Zurueck
              </button>

              <button
                onClick={() => setCurrentUnitIndex((index) => Math.min(totalUnits - 1, index + 1))}
                disabled={isLast}
                className={`inline-flex items-center gap-1.5 rounded-lg px-4 py-2 text-sm font-bold transition-colors ${
                  isLast ? 'cursor-not-allowed bg-slate-100 text-slate-400' : 'bg-indigo-600 text-white hover:bg-indigo-700'
                }`}
              >
                Naechste Karte
                <ChevronRight className="h-4 w-4" />
              </button>
            </div>
          </section>
        </div>
      </section>

      {isEditOpen && (
        <div className="fixed inset-0 z-50 flex items-end justify-center p-0 sm:items-center sm:p-6">
          <button
            className="absolute inset-0 bg-slate-900/45"
            onClick={closeEditModal}
            aria-label="Bearbeiten schliessen"
          />

          <section className="relative z-10 w-full max-h-[92vh] overflow-y-auto rounded-t-2xl border border-slate-200 bg-white shadow-2xl sm:max-w-2xl sm:rounded-2xl">
            <div className="sticky top-0 z-10 flex items-center justify-between border-b border-slate-100 bg-white/95 px-4 py-3 backdrop-blur">
              <h3 className="text-base font-bold text-slate-800">Formel bearbeiten</h3>
              <button
                onClick={closeEditModal}
                className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2 py-1 text-xs font-semibold text-slate-600 hover:bg-slate-50"
              >
                <X className="h-3.5 w-3.5" />
                Schliessen
              </button>
            </div>

            <div className="space-y-4 p-4 sm:p-5">
              <div>
                <label className="mb-1 block text-xs font-semibold text-slate-600">Titel</label>
                <input
                  value={editTitle}
                  onChange={(e) => setEditTitle(e.target.value)}
                  className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm focus:border-indigo-500 focus:ring-1 focus:ring-indigo-200"
                  placeholder="Titel der Formel"
                />
              </div>

              <div>
                <label className="mb-1 block text-xs font-semibold text-slate-600">Beschreibung (Markdown + LaTeX)</label>
                <textarea
                  value={editSummary}
                  onChange={(e) => setEditSummary(e.target.value)}
                  rows={4}
                  className="w-full resize-y rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm focus:border-indigo-500 focus:ring-1 focus:ring-indigo-200"
                  placeholder="Kurzbeschreibung mit $LaTeX$"
                />
              </div>

              <div>
                <label className="mb-1 block text-xs font-semibold text-slate-600">Tags</label>
                <input
                  value={editTags}
                  onChange={(e) => setEditTags(e.target.value)}
                  className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm focus:border-indigo-500 focus:ring-1 focus:ring-indigo-200"
                  placeholder="z. B. Kombinatorik, Wahrscheinlichkeit"
                />
                <p className="mt-1 text-[11px] text-slate-500">Trenne Tags mit Komma, Semikolon oder Zeilenumbruch.</p>
              </div>

              <div>
                <p className="mb-2 text-xs font-semibold text-slate-600">Thema / Projekte</p>
                {projects.length === 0 ? (
                  <p className="rounded-lg border border-dashed border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-500">
                    Keine Projekte vorhanden.
                  </p>
                ) : (
                  <div className="grid gap-2 sm:grid-cols-2">
                    {projects.map((project) => {
                      const checked = editProjectIds.includes(project.id);
                      return (
                        <label
                          key={project.id}
                          className={`flex cursor-pointer items-center justify-between rounded-lg border px-3 py-2 text-xs ${
                            checked ? 'border-indigo-200 bg-indigo-50 text-indigo-700' : 'border-slate-200 bg-white text-slate-600'
                          }`}
                        >
                          <span className="truncate pr-2">{project.name}</span>
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={() => toggleEditProject(project.id)}
                          />
                        </label>
                      );
                    })}
                  </div>
                )}
              </div>

              <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
                {onDelete ? (
                  <button
                    onClick={() => {
                      onDelete();
                      closeEditModal();
                    }}
                    className="inline-flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs font-semibold text-red-700 hover:bg-red-100"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                    Formel loeschen
                  </button>
                ) : (
                  <span />
                )}
                <div className="flex gap-2">
                  <button
                    onClick={closeEditModal}
                    className="rounded-lg border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-50"
                  >
                    Abbrechen
                  </button>
                  <button
                    onClick={saveEdits}
                    className="inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-3 py-2 text-xs font-semibold text-white hover:bg-indigo-700"
                  >
                    <Save className="h-3.5 w-3.5" />
                    Speichern
                  </button>
                </div>
              </div>
            </div>
          </section>
        </div>
      )}

      {isLast && (
        <section className="rounded-2xl border border-emerald-200 bg-emerald-50 p-5 text-center">
          <p className="mb-1 text-base font-bold text-emerald-800">Alle Karten durchgearbeitet!</p>
          <p className="mb-3 text-sm text-emerald-700">
            Du hast alle {totalUnits} Karten zu <span className="font-semibold">{formula.title}</span> abgeschlossen.
          </p>
          <button
            onClick={() => setCurrentUnitIndex(0)}
            className="inline-flex items-center gap-2 rounded-xl border border-emerald-300 bg-white px-4 py-2 text-sm font-semibold text-emerald-700 hover:bg-emerald-100"
          >
            <RotateCcw className="h-4 w-4" />
            Von vorne starten
          </button>
        </section>
      )}
    </div>
  );
};

export default FormulaDetailView;
