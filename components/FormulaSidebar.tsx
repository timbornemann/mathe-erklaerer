import React, { useEffect, useMemo, useState } from 'react';
import { BookOpenText, ChevronLeft, ChevronRight, Loader2, Plus, Save, Search, Sparkles, X } from 'lucide-react';
import { FormulaEntry, FormulaLesson, FormulaLessonCard } from '../types';
import MathRenderer from './MathRenderer';
import { buildFormulaSearchText } from '../services/formulaCollection';

type AddTabMode = 'manual' | 'prompt';
type FormulaSortMode = 'newest' | 'most-used' | 'title';

type DetailUnit = {
  lessonIndex: number;
  cardIndex: number;
  lesson: FormulaLesson;
  card: FormulaLessonCard;
};

interface FormulaSidebarProps {
  formulas: FormulaEntry[];
  isOpen: boolean;
  onToggle: () => void;
  onMarkUsed: (formulaId: string) => void;
  onRetryFormula: (formulaId: string) => void;
  onAddFormulaLatex?: (formula: string, contextText?: string) => Promise<void> | void;
  onAskFormulaPrompt?: (prompt: string) => Promise<void> | void;
  readOnly?: boolean;
  title?: string;
  side?: 'left' | 'right';
  rightOffsetPx?: number;
  floatingButtonRightOffsetPx?: number;
}

const statusBadgeClass = (status: FormulaEntry['status']): string => {
  if (status === 'ready') return 'bg-emerald-50 text-emerald-700 border-emerald-200';
  if (status === 'failed') return 'bg-red-50 text-red-700 border-red-200';
  return 'bg-amber-50 text-amber-700 border-amber-200';
};

const statusLabel = (status: FormulaEntry['status']): string => {
  if (status === 'ready') return 'Bereit';
  if (status === 'failed') return 'Fehlgeschlagen';
  return 'Wird erstellt';
};

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
    title: 'Ueberblick',
    goal: formula.summary || 'Diese Formel hat aktuell noch keinen vollstaendigen Lernpfad.',
    takeaway: formula.summary || 'Lernpfad wird noch erstellt.',
    cards: [
      {
        title: 'Kernidee',
        explanation:
          formula.summary ||
          'Sobald die Generierung abgeschlossen ist, erscheinen hier mehrere Lektionen mit Unterkarten.',
        formulas: [formula.formula]
      }
    ]
  }
];

const FormulaSidebar: React.FC<FormulaSidebarProps> = ({
  formulas,
  isOpen,
  onToggle,
  onMarkUsed,
  onRetryFormula,
  onAddFormulaLatex,
  onAskFormulaPrompt,
  readOnly = false,
  title = 'Formelsammlung',
  side = 'left',
  rightOffsetPx = 0,
  floatingButtonRightOffsetPx = 0
}) => {
  const [search, setSearch] = useState('');
  const [tagFilter, setTagFilter] = useState('');
  const [sortMode, setSortMode] = useState<FormulaSortMode>('newest');

  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [addTab, setAddTab] = useState<AddTabMode>('manual');
  const [newFormulaLatex, setNewFormulaLatex] = useState('');
  const [newFormulaContext, setNewFormulaContext] = useState('');
  const [newFormulaPrompt, setNewFormulaPrompt] = useState('');
  const [inlineMessage, setInlineMessage] = useState<string | null>(null);

  const [detailFormulaId, setDetailFormulaId] = useState<string | null>(null);
  const [detailUnitIndex, setDetailUnitIndex] = useState(0);

  const availableTags = useMemo(() => {
    const tags = new Set<string>();
    formulas.forEach((entry) => entry.tags.forEach((tag) => tags.add(tag)));
    return Array.from(tags).sort((a, b) => a.localeCompare(b, 'de'));
  }, [formulas]);

  const filteredFormulas = useMemo(() => {
    const query = search.trim().toLowerCase();
    let next = formulas.filter((entry) => {
      if (query && !buildFormulaSearchText(entry).includes(query)) return false;
      if (tagFilter && !entry.tags.includes(tagFilter)) return false;
      return true;
    });

    if (sortMode === 'most-used') {
      next = [...next].sort((a, b) => b.usageCount - a.usageCount || b.updatedAt - a.updatedAt);
    } else if (sortMode === 'title') {
      next = [...next].sort((a, b) => a.title.localeCompare(b.title, 'de'));
    } else {
      next = [...next].sort((a, b) => b.updatedAt - a.updatedAt);
    }

    return next;
  }, [formulas, search, sortMode, tagFilter]);

  const detailFormula = useMemo(
    () => (detailFormulaId ? formulas.find((entry) => entry.id === detailFormulaId) ?? null : null),
    [detailFormulaId, formulas]
  );

  const detailLearningPath = useMemo(() => {
    if (!detailFormula) return [];
    return detailFormula.learningPath.length > 0 ? detailFormula.learningPath : buildFallbackLearningPath(detailFormula);
  }, [detailFormula]);

  const detailUnits = useMemo<DetailUnit[]>(() => {
    const units: DetailUnit[] = [];
    detailLearningPath.forEach((lesson, lessonIndex) => {
      const cards = lesson.cards.length > 0
        ? lesson.cards
        : [{ title: 'Kernidee', explanation: lesson.goal || lesson.takeaway, formulas: [] }];
      cards.forEach((card, cardIndex) => {
        units.push({ lessonIndex, cardIndex, lesson, card });
      });
    });
    return units;
  }, [detailLearningPath]);

  const currentDetailUnit = detailUnits[detailUnitIndex] ?? detailUnits[0] ?? null;
  const detailProgress = detailUnits.length > 0 ? ((detailUnitIndex + 1) / detailUnits.length) * 100 : 0;
  const isDetailFirst = detailUnitIndex <= 0;
  const isDetailLast = detailUnitIndex >= detailUnits.length - 1;

  useEffect(() => {
    if (!detailFormulaId) return;
    if (!detailFormula) {
      setDetailFormulaId(null);
      setDetailUnitIndex(0);
      return;
    }
    if (detailUnitIndex < detailUnits.length) return;
    setDetailUnitIndex(Math.max(0, detailUnits.length - 1));
  }, [detailFormula, detailFormulaId, detailUnitIndex, detailUnits.length]);

  useEffect(() => {
    if (!detailFormula || !currentDetailUnit) return;

    const onModalKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (target && (/^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName) || target.isContentEditable)) {
        return;
      }

      if (event.key === 'ArrowRight') {
        event.preventDefault();
        event.stopImmediatePropagation();
        if (!isDetailLast) {
          setDetailUnitIndex((index) => Math.min(index + 1, detailUnits.length - 1));
        }
        return;
      }

      if (event.key === 'ArrowLeft') {
        event.preventDefault();
        event.stopImmediatePropagation();
        if (!isDetailFirst) {
          setDetailUnitIndex((index) => Math.max(index - 1, 0));
        }
        return;
      }

      if (event.key === 'Escape') {
        event.preventDefault();
        event.stopImmediatePropagation();
        setDetailFormulaId(null);
        setDetailUnitIndex(0);
      }
    };

    window.addEventListener('keydown', onModalKeyDown, true);
    return () => window.removeEventListener('keydown', onModalKeyDown, true);
  }, [currentDetailUnit, detailFormula, detailUnits.length, isDetailFirst, isDetailLast]);

  const openDetailModal = (formulaId: string) => {
    setDetailFormulaId(formulaId);
    setDetailUnitIndex(0);
  };

  const closeDetailModal = () => {
    setDetailFormulaId(null);
    setDetailUnitIndex(0);
  };

  const navigateDetail = (nextIndex: number) => {
    if (nextIndex < 0 || nextIndex >= detailUnits.length) return;
    setDetailUnitIndex(nextIndex);
  };

  const handleAddLatex = () => {
    if (readOnly || !onAddFormulaLatex) return;
    const formula = newFormulaLatex.trim();
    const context = newFormulaContext.trim() || undefined;
    if (!formula) return;

    setNewFormulaLatex('');
    setNewFormulaContext('');
    setIsAddModalOpen(false);
    setInlineMessage('Formel wird erstellt und in die Liste uebernommen.');

    void Promise.resolve(onAddFormulaLatex(formula, context))
      .then(() => setInlineMessage('Formel hinzugefuegt. Lernpfad wird erstellt.'))
      .catch((error: any) => setInlineMessage(error?.message || 'Formel konnte nicht hinzugefuegt werden.'));
  };

  const handleAskPrompt = () => {
    if (readOnly || !onAskFormulaPrompt) return;
    const prompt = newFormulaPrompt.trim();
    if (!prompt) return;

    setNewFormulaPrompt('');
    setIsAddModalOpen(false);
    setInlineMessage('Formel wird erstellt und in die Liste uebernommen.');

    void Promise.resolve(onAskFormulaPrompt(prompt))
      .then(() => setInlineMessage('Formelkarte wurde erstellt.'))
      .catch((error: any) => setInlineMessage(error?.message || 'Formel konnte nicht erstellt werden.'));
  };

  const isRightSide = side === 'right';
  const panelStyle = isRightSide
    ? ({
        ['--formula-sidebar-offset' as any]: `${Math.max(0, rightOffsetPx)}px`,
        ['--formula-fab-offset' as any]: `${Math.max(0, floatingButtonRightOffsetPx)}px`
      } as React.CSSProperties)
    : undefined;

  if (!isOpen) {
    return (
      <button
        style={panelStyle}
        onClick={onToggle}
        className={`fixed z-[51] bg-emerald-600 hover:bg-emerald-700 text-white p-3.5 sm:p-4 rounded-full shadow-xl transition-all hover:scale-110 active:scale-95 group ${
          isRightSide
            ? 'bottom-20 sm:bottom-20 md:bottom-6 right-4 md:right-[calc(var(--formula-fab-offset)+1rem)]'
            : 'bottom-4 sm:bottom-6 left-4 sm:left-6'
        }`}
        title="Formelsammlung oeffnen"
      >
        <BookOpenText className="w-6 h-6" />
        <span
          className={`absolute top-1/2 -translate-y-1/2 bg-slate-800 text-white text-xs px-2 py-1 rounded opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap pointer-events-none ${
            isRightSide ? 'right-full mr-3' : 'left-full ml-3'
          }`}
        >
          Formelsammlung
        </span>
      </button>
    );
  }

  return (
    <>
      <div
        style={panelStyle}
        className={`fixed top-0 h-full w-full md:w-[430px] bg-white shadow-2xl z-40 flex flex-col pb-[env(safe-area-inset-bottom)] ${
          isRightSide
            ? 'right-0 md:right-[var(--formula-sidebar-offset)] border-l border-slate-200'
            : 'left-0 border-r border-slate-200'
        }`}
      >
        <div className="p-3 sm:p-4 bg-white border-b border-slate-200 flex justify-between items-center shadow-sm">
          <div className="flex items-center gap-2">
            <BookOpenText className="w-5 h-5 text-emerald-600" />
            <div>
              <h3 className="font-bold text-slate-800">{title}</h3>
              <p className="text-xs text-slate-500">{filteredFormulas.length} Formeln sichtbar</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {!readOnly && (onAddFormulaLatex || onAskFormulaPrompt) && (
              <button
                onClick={() => setIsAddModalOpen(true)}
                className="inline-flex items-center gap-1 rounded-lg border border-emerald-200 bg-emerald-50 px-2 py-1 text-xs font-semibold text-emerald-700 hover:bg-emerald-100"
              >
                <Plus className="w-3.5 h-3.5" />
                Neue Formel
              </button>
            )}
            <button onClick={onToggle} className="p-2 hover:bg-slate-100 rounded-full transition-colors">
              <X className="w-5 h-5 text-slate-500" />
            </button>
          </div>
        </div>

        <div className="p-3 sm:p-4 border-b border-slate-200 bg-slate-50 space-y-2.5">
          <div className="relative">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Formeln durchsuchen..."
              className="w-full pl-9 pr-3 py-2.5 rounded-xl border border-slate-200 bg-white text-sm focus:border-indigo-500 focus:ring-1 focus:ring-indigo-200"
            />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <select
              value={tagFilter}
              onChange={(e) => setTagFilter(e.target.value)}
              className="rounded-xl border border-slate-200 bg-white px-2.5 py-2 text-xs text-slate-700 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-200"
            >
              <option value="">Alle Tags</option>
              {availableTags.map((tag) => (
                <option key={tag} value={tag}>
                  {tag}
                </option>
              ))}
            </select>
            <select
              value={sortMode}
              onChange={(e) => setSortMode(e.target.value as FormulaSortMode)}
              className="rounded-xl border border-slate-200 bg-white px-2.5 py-2 text-xs text-slate-700 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-200"
            >
              <option value="newest">Neueste</option>
              <option value="most-used">Meist genutzt</option>
              <option value="title">Titel A-Z</option>
            </select>
          </div>
          {inlineMessage && (
            <button
              onClick={() => setInlineMessage(null)}
              className="inline-flex w-full items-center justify-between gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-left text-xs text-slate-600 hover:bg-slate-50"
            >
              <span>{inlineMessage}</span>
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>

        <div className="flex-1 overflow-y-auto p-3 sm:p-4 space-y-2.5">
          {filteredFormulas.length === 0 ? (
            <p className="text-sm text-slate-500 bg-slate-50 border border-slate-200 rounded-xl p-3">
              Keine Formeln gefunden.
            </p>
          ) : (
            filteredFormulas.map((formula) => (
              <article key={formula.id} className="rounded-xl border border-slate-200 bg-white p-3">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-sm font-semibold text-slate-800 truncate">{formula.title}</p>
                  <span className={`text-[10px] px-2 py-0.5 rounded-full border font-semibold ${statusBadgeClass(formula.status)}`}>
                    {statusLabel(formula.status)}
                  </span>
                </div>

                <div className="mt-2 text-xs text-slate-700 overflow-x-auto">
                  <MathRenderer content={toDisplayMath(formula.formula)} />
                </div>

                {formula.status === 'pending' && (
                  <div className="mt-2 rounded-lg border border-amber-200 bg-amber-50 p-2">
                    <p className="text-[11px] font-semibold text-amber-700">Lernpfad wird erstellt...</p>
                    <div className="mt-1.5 space-y-1">
                      <div className="h-2 w-full animate-pulse rounded bg-amber-100" />
                      <div className="h-2 w-5/6 animate-pulse rounded bg-amber-100" />
                    </div>
                  </div>
                )}

                {formula.status !== 'pending' && formula.summary && (
                  <div className="mt-2 line-clamp-2 text-xs text-slate-600">
                    <MathRenderer content={formula.summary} />
                  </div>
                )}

                <div className="mt-2 flex flex-wrap gap-1">
                  {formula.tags.slice(0, 3).map((tag) => (
                    <span key={tag} className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] text-slate-600">
                      {tag}
                    </span>
                  ))}
                </div>

                <div className="mt-3 flex flex-wrap gap-1.5">
                  <button
                    onClick={() => openDetailModal(formula.id)}
                    className="rounded-lg border border-indigo-200 bg-indigo-50 px-2.5 py-1 text-[11px] font-semibold text-indigo-700 hover:bg-indigo-100"
                  >
                    Details
                  </button>
                  <button
                    onClick={() => onMarkUsed(formula.id)}
                    className="rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-[11px] font-semibold text-slate-700 hover:bg-slate-50"
                  >
                    Genutzt
                  </button>
                  {!readOnly && formula.status === 'failed' && (
                    <button
                      onClick={() => onRetryFormula(formula.id)}
                      className="inline-flex items-center gap-1 rounded-lg border border-red-200 bg-red-50 px-2.5 py-1 text-[11px] font-semibold text-red-700 hover:bg-red-100"
                    >
                      <Sparkles className="h-3 w-3" />
                      Retry
                    </button>
                  )}
                </div>
              </article>
            ))
          )}
        </div>
      </div>

      {isAddModalOpen && (
        <div className="fixed inset-0 z-[70] flex items-end justify-center p-0 sm:items-center sm:p-6">
          <button
            className="absolute inset-0 bg-slate-900/45"
            onClick={() => setIsAddModalOpen(false)}
            aria-label="Modal schliessen"
          />

          <section className="relative z-10 w-full max-h-[92vh] overflow-y-auto rounded-t-2xl border border-slate-200 bg-white shadow-2xl sm:max-w-2xl sm:rounded-2xl">
            <div className="sticky top-0 z-10 flex items-center justify-between border-b border-slate-100 bg-white/95 px-4 py-3 backdrop-blur">
              <h3 className="text-base font-bold text-slate-800">Neue Formel</h3>
              <button
                onClick={() => setIsAddModalOpen(false)}
                className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2 py-1 text-xs font-semibold text-slate-600 hover:bg-slate-50"
              >
                <X className="h-3.5 w-3.5" />
                Schliessen
              </button>
            </div>

            <div className="space-y-3 p-4 sm:p-5">
              <div className="inline-flex rounded-xl border border-slate-200 bg-slate-50 p-1 text-xs font-semibold">
                <button
                  onClick={() => setAddTab('manual')}
                  className={`rounded-lg px-3 py-1.5 ${addTab === 'manual' ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500'}`}
                >
                  Manuell
                </button>
                <button
                  onClick={() => setAddTab('prompt')}
                  className={`rounded-lg px-3 py-1.5 ${addTab === 'prompt' ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500'}`}
                >
                  KI-Frage
                </button>
              </div>

              {addTab === 'manual' ? (
                <div className="space-y-3">
                  <textarea
                    value={newFormulaLatex}
                    onChange={(e) => setNewFormulaLatex(e.target.value)}
                    rows={2}
                    placeholder="Formel (LaTeX) eingeben..."
                    className="w-full resize-none rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm focus:border-indigo-500 focus:ring-1 focus:ring-indigo-200"
                  />
                  <textarea
                    value={newFormulaContext}
                    onChange={(e) => setNewFormulaContext(e.target.value)}
                    rows={3}
                    placeholder="Optionaler Kontext (Quelle, Thema, Klassenstufe, Tiefe)..."
                    className="w-full resize-none rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm focus:border-indigo-500 focus:ring-1 focus:ring-indigo-200"
                  />
                  <button
                    onClick={handleAddLatex}
                    disabled={!newFormulaLatex.trim()}
                    className="inline-flex items-center gap-2 rounded-xl bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-50"
                  >
                    <Save className="h-4 w-4" />
                    Formel speichern
                  </button>
                </div>
              ) : (
                <div className="space-y-3">
                  <textarea
                    value={newFormulaPrompt}
                    onChange={(e) => setNewFormulaPrompt(e.target.value)}
                    rows={4}
                    placeholder="Frage nach einer Formel (z. B. Wie funktioniert die Mitternachtsformel?)"
                    className="w-full resize-none rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm focus:border-indigo-500 focus:ring-1 focus:ring-indigo-200"
                  />
                  <button
                    onClick={handleAskPrompt}
                    disabled={!newFormulaPrompt.trim()}
                    className="inline-flex items-center gap-2 rounded-xl border border-indigo-200 bg-indigo-50 px-4 py-2.5 text-sm font-semibold text-indigo-700 hover:bg-indigo-100 disabled:opacity-50"
                  >
                    <Search className="h-4 w-4" />
                    Formel per KI erstellen
                  </button>
                </div>
              )}
            </div>
          </section>
        </div>
      )}

      {detailFormula && currentDetailUnit && (
        <div className="fixed inset-0 z-[70] flex items-end justify-center p-0 sm:items-center sm:p-5">
          <button
            className="absolute inset-0 bg-slate-900/45"
            onClick={closeDetailModal}
            aria-label="Details schliessen"
          />

          <section className="relative z-10 w-full max-h-[94vh] overflow-hidden rounded-t-2xl border border-slate-200 bg-white shadow-2xl sm:max-w-6xl sm:rounded-2xl">
            <div className="sticky top-0 z-10 border-b border-slate-100 bg-white/95 px-4 py-3 backdrop-blur">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Formel-Details</p>
                  <h3 className="truncate text-base font-bold text-slate-800">{detailFormula.title}</h3>
                  <p className="text-xs text-slate-500">
                    Karte {detailUnitIndex + 1} / {detailUnits.length}
                  </p>
                </div>
                <button
                  onClick={closeDetailModal}
                  className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2 py-1 text-xs font-semibold text-slate-600 hover:bg-slate-50"
                >
                  <X className="h-3.5 w-3.5" />
                  Schliessen
                </button>
              </div>
              <div className="mt-3 overflow-x-auto rounded-xl border border-indigo-100 bg-indigo-50/70 p-3 text-center">
                <MathRenderer content={toDisplayMath(detailFormula.formula)} />
              </div>
            </div>

            <div className="grid h-[min(74vh,700px)] md:grid-cols-[280px_minmax(0,1fr)]">
              <aside className="hidden border-r border-slate-100 bg-slate-50/70 md:block">
                <div className="h-full overflow-y-auto p-3">
                  <p className="pb-2 text-sm font-semibold text-slate-700">Lernlektionen</p>
                  <div className="space-y-2">
                    {detailLearningPath.map((lesson, lessonIndex) => (
                      <div key={`lesson-${lessonIndex}`} className="rounded-xl border border-slate-200 bg-white p-2">
                        <p className="text-xs font-bold text-slate-700">
                          {lessonIndex + 1}. {lesson.title || `Lektion ${lessonIndex + 1}`}
                        </p>
                        <div className="mt-1 space-y-1">
                          {lesson.cards.map((card, cardIndex) => {
                            const target = detailUnits.findIndex(
                              (unit) => unit.lessonIndex === lessonIndex && unit.cardIndex === cardIndex
                            );
                            const active = target === detailUnitIndex;
                            return (
                              <button
                                key={`lesson-${lessonIndex}-card-${cardIndex}`}
                                onClick={() => navigateDetail(target)}
                                className={`w-full rounded-lg px-2 py-1.5 text-left text-[11px] transition-colors ${
                                  active ? 'bg-indigo-100 text-indigo-700' : 'text-slate-600 hover:bg-slate-100'
                                }`}
                              >
                                {cardIndex + 1}. {card.title || `Karte ${cardIndex + 1}`}
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </aside>

              <section className="min-w-0 flex flex-col">
                <div className="border-b border-slate-100 px-4 py-3 sm:px-5">
                  <div className="flex items-center justify-between gap-2 text-xs font-semibold text-slate-600">
                    <p>
                      Lektion {currentDetailUnit.lessonIndex + 1}: {currentDetailUnit.lesson.title}
                    </p>
                    <p>
                      {detailUnitIndex + 1} / {detailUnits.length}
                    </p>
                  </div>
                  <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-slate-200">
                    <div className="h-2 rounded-full bg-indigo-600 transition-all duration-300" style={{ width: `${detailProgress}%` }} />
                  </div>
                </div>

                <div className="flex-1 overflow-y-auto px-4 py-4 sm:px-6 sm:py-5">
                  <p className="text-xs font-semibold uppercase tracking-wide text-indigo-500">
                    Karte {currentDetailUnit.cardIndex + 1}
                  </p>
                  <h4 className="mt-1 text-lg font-bold text-slate-800">
                    {currentDetailUnit.card.title || `Karte ${currentDetailUnit.cardIndex + 1}`}
                  </h4>
                  <div className="mt-3 text-sm text-slate-700 leading-relaxed">
                    <MathRenderer content={currentDetailUnit.card.explanation} />
                  </div>

                  {currentDetailUnit.card.formulas.length > 0 && (
                    <div className="mt-4 space-y-2 rounded-xl border border-indigo-100 bg-indigo-50/50 p-3">
                      {currentDetailUnit.card.formulas.map((formula, index) => (
                        <div key={`${currentDetailUnit.lessonIndex}-${currentDetailUnit.cardIndex}-${index}`} className="overflow-x-auto">
                          <MathRenderer content={toDisplayMath(formula)} />
                        </div>
                      ))}
                    </div>
                  )}

                  {currentDetailUnit.lesson.takeaway && (
                    <div className="mt-4 rounded-xl border border-emerald-100 bg-emerald-50 px-3 py-2.5 text-xs text-emerald-800">
                      <span className="font-semibold">Takeaway:</span> {currentDetailUnit.lesson.takeaway}
                    </div>
                  )}
                </div>

                <div className="border-t border-slate-100 px-4 py-3 sm:px-5 flex items-center justify-between gap-2">
                  <button
                    onClick={() => navigateDetail(detailUnitIndex - 1)}
                    disabled={isDetailFirst}
                    className={`inline-flex items-center gap-1 rounded-lg px-3 py-2 text-xs font-semibold ${
                      isDetailFirst ? 'text-slate-300' : 'border border-slate-200 text-slate-700 hover:bg-slate-50'
                    }`}
                  >
                    <ChevronLeft className="h-4 w-4" />
                    Zurueck
                  </button>
                  <button
                    onClick={() => navigateDetail(detailUnitIndex + 1)}
                    disabled={isDetailLast}
                    className={`inline-flex items-center gap-1 rounded-lg px-3 py-2 text-xs font-semibold ${
                      isDetailLast ? 'text-slate-300' : 'border border-indigo-200 bg-indigo-50 text-indigo-700 hover:bg-indigo-100'
                    }`}
                  >
                    Weiter
                    <ChevronRight className="h-4 w-4" />
                  </button>
                </div>
              </section>
            </div>
          </section>
        </div>
      )}
    </>
  );
};

export default FormulaSidebar;
