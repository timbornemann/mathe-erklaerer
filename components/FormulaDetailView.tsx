import React, { useEffect, useMemo, useState } from 'react';
import { ArrowLeft, CheckCircle2, ChevronLeft, ChevronRight, List, Loader2, Sparkles, Trash2, X } from 'lucide-react';
import MathRenderer from './MathRenderer';
import { FormulaDetailCard, FormulaEntry } from '../types';

interface FormulaDetailViewProps {
  formula: FormulaEntry;
  onBack: () => void;
  onGeneratePremium?: () => void;
  onMarkUsed?: () => void;
  onDelete?: () => void;
  onRetryFormula?: () => void;
}

const repairLatexBraces = (input: string): string => {
  const text = input.trim();
  if (!text) return text;
  let openBraces = 0;
  let repaired = '';
  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i];
    let backslashes = 0;
    for (let j = i - 1; j >= 0 && text[j] === '\\'; j -= 1) backslashes += 1;
    const escaped = backslashes % 2 === 1;

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

const splitParagraphs = (text: string): string[] =>
  text
    .split(/\n{2,}/)
    .map((part) => part.trim())
    .filter((part) => part.length > 0);

const chunkArray = <T,>(items: T[], chunkSize: number): T[][] => {
  if (chunkSize <= 0) return [items];
  const chunks: T[][] = [];
  for (let i = 0; i < items.length; i += chunkSize) {
    chunks.push(items.slice(i, i + chunkSize));
  }
  return chunks;
};

const buildFallbackCards = (formula: FormulaEntry): FormulaDetailCard[] => {
  const cards: FormulaDetailCard[] = [];

  const introParts = [formula.shortExplanation.trim(), formula.purpose.trim()].filter((part) => part.length > 0);
  if (introParts.length > 0) {
    cards.push({
      title: 'Ueberblick',
      explanation: introParts.join('\n\n'),
      formulas: [formula.formula]
    });
  }

  const stepParagraphs = splitParagraphs(formula.stepByStepExplanation);
  if (stepParagraphs.length > 0) {
    chunkArray(stepParagraphs, 2).forEach((chunk, index) => {
      cards.push({
        title: `Schritt-fuer-Schritt ${index + 1}`,
        explanation: chunk.join('\n\n'),
        formulas: index === 0 ? [formula.formula] : []
      });
    });
  }

  if (formula.examples.length > 0) {
    cards.push({
      title: 'Beispiele',
      explanation: formula.examples.map((example, index) => `${index + 1}. ${example}`).join('\n'),
      formulas: [formula.formula]
    });
  }

  if (formula.tags.length > 0) {
    cards.push({
      title: 'Merkhilfe',
      explanation: `Wichtige Begriffe: ${formula.tags.join(', ')}`,
      formulas: []
    });
  }

  if (cards.length === 0) {
    cards.push({
      title: 'Grundidee',
      explanation:
        'Zu dieser Formel sind noch keine detaillierten Lernkarten vorhanden. Erzeuge Premium-Karten, um eine vollstaendige Schritt-fuer-Schritt-Ansicht zu erhalten.',
      formulas: [formula.formula]
    });
  }

  return cards.slice(0, 6);
};

const toDisplayMath = (formula: string): string => `$$ ${repairLatexBraces(formula)} $$`;

const FormulaDetailView: React.FC<FormulaDetailViewProps> = ({
  formula,
  onBack,
  onGeneratePremium,
  onMarkUsed,
  onDelete,
  onRetryFormula
}) => {
  const [currentCardIndex, setCurrentCardIndex] = useState(0);
  const [isTocOpen, setIsTocOpen] = useState(false);

  const hasPremiumCards = (formula.detailCards?.length ?? 0) > 0;
  const cards = useMemo<FormulaDetailCard[]>(
    () => (hasPremiumCards ? (formula.detailCards ?? []) : buildFallbackCards(formula)),
    [formula, hasPremiumCards]
  );
  const totalCards = cards.length;
  const currentCard = cards[currentCardIndex] ?? cards[0] ?? null;
  const progress = totalCards > 0 ? ((currentCardIndex + 1) / totalCards) * 100 : 0;
  const canGeneratePremium = typeof onGeneratePremium === 'function' && formula.status !== 'pending';
  const statusLabel = formula.status === 'pending' ? 'Wird erstellt' : formula.status === 'failed' ? 'Fehlgeschlagen' : 'Bereit';
  const statusBadgeClass =
    formula.status === 'pending'
      ? 'border-amber-200 bg-amber-50 text-amber-700'
      : formula.status === 'failed'
      ? 'border-red-200 bg-red-50 text-red-700'
      : 'border-emerald-200 bg-emerald-50 text-emerald-700';
  const sourceSummary = formula.sourceRefs.map((source) => `${source.type} (${source.label})`).join(', ') || 'Keine';

  const isFirst = currentCardIndex === 0;
  const isLast = currentCardIndex === totalCards - 1;

  useEffect(() => {
    setCurrentCardIndex(0);
    setIsTocOpen(false);
  }, [formula.id]);

  useEffect(() => {
    if (currentCardIndex < totalCards) return;
    setCurrentCardIndex(Math.max(0, totalCards - 1));
  }, [currentCardIndex, totalCards]);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      if (/^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName) || target.isContentEditable) return;

      if (e.key === 'ArrowRight' && !isLast) {
        e.preventDefault();
        setCurrentCardIndex((idx) => idx + 1);
      }
      if (e.key === 'ArrowLeft' && !isFirst) {
        e.preventDefault();
        setCurrentCardIndex((idx) => idx - 1);
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [isFirst, isLast]);

  useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, [currentCardIndex]);

  const navigateToCard = (index: number, closeMobileToc = false) => {
    const boundedIndex = Math.max(0, Math.min(index, totalCards - 1));
    setCurrentCardIndex(boundedIndex);
    if (closeMobileToc) setIsTocOpen(false);
  };

  const renderTocEntries = (closeAfterNavigate = false) => (
    <>
      {cards.map((card, index) => {
        const isActive = index === currentCardIndex;
        const isCompleted = index < currentCardIndex;
        return (
          <button
            key={`${index}-${card.title}`}
            onClick={() => navigateToCard(index, closeAfterNavigate)}
            className={`mb-1.5 w-full rounded-xl border px-3 py-2.5 text-left transition-colors ${
              isActive
                ? 'border-indigo-200 bg-indigo-50'
                : 'border-slate-200 bg-white hover:bg-slate-50'
            }`}
          >
            <div className="flex items-start gap-2.5">
              <span
                className={`mt-0.5 inline-flex h-6 w-6 items-center justify-center rounded-full text-[11px] font-bold ${
                  isActive ? 'bg-indigo-600 text-white' : 'bg-slate-200 text-slate-700'
                }`}
              >
                {index + 1}
              </span>
              <div className="min-w-0 flex-1">
                <p className={`truncate text-sm font-semibold ${isActive ? 'text-indigo-700' : 'text-slate-800'}`}>
                  {card.title || `Karte ${index + 1}`}
                </p>
                <p className="text-[11px] text-slate-500">Lernschritt {index + 1}</p>
              </div>
              {isCompleted ? <CheckCircle2 className="h-4 w-4 text-emerald-500" /> : null}
            </div>
          </button>
        );
      })}
    </>
  );

  return (
    <div className="w-full relative">
      {isTocOpen && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <button
            className="absolute inset-0 bg-slate-900/35"
            onClick={() => setIsTocOpen(false)}
            aria-label="Inhaltsverzeichnis schliessen"
          />
          <div className="absolute left-0 top-0 h-full w-[88vw] max-w-sm bg-white shadow-2xl border-r border-slate-200 flex flex-col">
            <div className="border-b border-slate-100 px-4 py-3 flex items-center justify-between">
              <div>
                <p className="text-sm font-bold text-slate-800">Inhaltsverzeichnis</p>
                <p className="text-xs text-slate-500">{totalCards} Lernkarten</p>
              </div>
              <button
                onClick={() => setIsTocOpen(false)}
                className="p-2 rounded-lg hover:bg-slate-100 text-slate-500"
                aria-label="Schliessen"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto p-2">{renderTocEntries(true)}</div>
          </div>
        </div>
      )}

      <aside className="hidden lg:block fixed left-0 top-0 z-30 h-full w-[320px] border-r border-slate-200 bg-white/95 backdrop-blur-sm">
        <div className="h-full flex flex-col pt-20">
          <div className="border-b border-slate-100 px-4 py-3">
            <p className="text-sm font-bold text-slate-800">Inhaltsverzeichnis</p>
            <p className="text-xs text-slate-500">{totalCards} Lernkarten</p>
          </div>
          <div className="flex-1 overflow-y-auto p-2 pb-6">{renderTocEntries()}</div>
        </div>
      </aside>

      <div className="lg:pl-[320px] w-full">
        <div className="w-full min-w-0 max-w-[1320px] mx-auto px-0 sm:px-2 md:px-0">
          <div className="mb-4 lg:hidden">
            <button
              onClick={() => setIsTocOpen(true)}
              className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 shadow-sm"
            >
              <List className="w-4 h-4 text-indigo-600" />
              Inhaltsverzeichnis
            </button>
          </div>

          <div className="mb-4 sm:mb-6 w-full bg-slate-200 rounded-full h-2.5 overflow-hidden">
            <div
              className="bg-indigo-600 h-2.5 rounded-full transition-all duration-500 ease-out"
              style={{ width: `${progress}%` }}
            />
          </div>

          <div className="bg-white rounded-2xl md:rounded-3xl shadow-xl overflow-hidden border border-slate-100 min-h-[420px] flex flex-col">
            <div className="bg-slate-50/80 p-3 sm:p-4 md:p-6 border-b border-slate-100 flex flex-col sm:flex-row justify-between sm:items-center gap-3 sm:gap-4">
              <div className="flex items-center gap-2 md:gap-3 flex-shrink-0 flex-wrap">
                <button
                  onClick={onBack}
                  className="flex items-center gap-2 px-3 py-1.5 bg-white border border-slate-200 rounded-lg text-slate-600 hover:text-indigo-600 hover:border-indigo-200 transition-all text-xs font-bold shadow-sm"
                >
                  <ArrowLeft className="w-3.5 h-3.5" />
                  Zurueck
                </button>
                <span className="bg-indigo-100 text-indigo-700 px-3 py-1.5 rounded-full text-[11px] sm:text-xs font-bold tracking-wide uppercase">
                  Karte {Math.max(1, currentCardIndex + 1)} / {Math.max(1, totalCards)}
                </span>
                <span
                  className={`px-3 py-1.5 rounded-full text-[11px] sm:text-xs font-bold tracking-wide uppercase ${
                    hasPremiumCards ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700'
                  }`}
                >
                  {hasPremiumCards ? 'Premium-Ansicht' : 'Basis-Ansicht'}
                </span>
              </div>
              <h2 className="text-base sm:text-lg md:text-xl font-bold text-slate-800 text-left sm:text-right w-full">
                {formula.title}
              </h2>
            </div>

            {!hasPremiumCards && (
              <div className="mx-4 sm:mx-6 md:mx-8 mt-4 rounded-2xl border border-amber-200 bg-amber-50/80 p-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-sm font-bold text-amber-800">Premium-Lernkarten fehlen noch</p>
                    {formula.status === 'pending' ? (
                      <p className="mt-1 inline-flex items-center gap-2 text-xs font-semibold text-amber-700">
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        Die KI erstellt gerade den detailreichen Karten-Flow.
                      </p>
                    ) : formula.status === 'failed' ? (
                      <p className="mt-1 text-xs text-amber-700">
                        Die letzte Generierung ist fehlgeschlagen. Starte die Premium-Generierung erneut.
                      </p>
                    ) : (
                      <p className="mt-1 text-xs text-amber-700">
                        Aktuell siehst du eine kompakte Basisansicht aus den vorhandenen Inhalten.
                      </p>
                    )}
                  </div>
                </div>
              </div>
            )}

            <div className="p-4 sm:p-6 md:p-8 flex-1 flex flex-col">
              <div className="mb-5 rounded-2xl border border-indigo-100 bg-gradient-to-br from-indigo-50 via-white to-violet-50 p-4 sm:p-5 shadow-sm">
                <div className="overflow-x-auto text-center">
                  <MathRenderer content={toDisplayMath(formula.formula)} />
                </div>
                {formula.shortExplanation && (
                  <p className="mt-3 text-sm text-slate-600 text-center">{formula.shortExplanation}</p>
                )}
              </div>

              <div className="mb-5 flex flex-wrap gap-2">
                {onMarkUsed && (
                  <button
                    onClick={onMarkUsed}
                    className="inline-flex items-center gap-2 rounded-xl border border-indigo-200 bg-indigo-50 px-3 py-2 text-xs font-semibold text-indigo-700 hover:bg-indigo-100"
                  >
                    Formel verwendet
                  </button>
                )}
                {formula.status === 'failed' && onRetryFormula && (
                  <button
                    onClick={onRetryFormula}
                    className="inline-flex items-center gap-2 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-xs font-semibold text-red-700 hover:bg-red-100"
                  >
                    Erneut generieren
                  </button>
                )}
                {canGeneratePremium && !hasPremiumCards && (
                  <button
                    onClick={onGeneratePremium}
                    className="inline-flex items-center gap-2 rounded-xl border border-amber-300 bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-800 hover:bg-amber-100"
                  >
                    <Sparkles className="w-3.5 h-3.5" />
                    Premium-Karten erzeugen
                  </button>
                )}
                {onDelete && (
                  <button
                    onClick={onDelete}
                    className="inline-flex items-center gap-2 rounded-xl border border-red-200 bg-white px-3 py-2 text-xs font-semibold text-red-700 hover:bg-red-50"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    Formel loeschen
                  </button>
                )}
              </div>

              <div className="mb-5 grid gap-3 xl:grid-cols-2">
                <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                  <p className="text-[11px] font-bold uppercase tracking-widest text-slate-500">Verwendung</p>
                  <p className="mt-2 text-sm text-slate-700">
                    {formula.purpose.trim() || 'Noch kein Verwendungszweck hinterlegt.'}
                  </p>
                </div>

                <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                  <p className="text-[11px] font-bold uppercase tracking-widest text-slate-500">Status & Nutzung</p>
                  <div className="mt-2 flex flex-wrap items-center gap-2">
                    <span className={`inline-flex rounded-full border px-2 py-0.5 text-[11px] font-semibold ${statusBadgeClass}`}>
                      {statusLabel}
                    </span>
                    <span className="text-sm text-slate-700">{formula.usageCount}x verwendet</span>
                  </div>
                </div>

                <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 xl:col-span-2">
                  <p className="text-[11px] font-bold uppercase tracking-widest text-slate-500">Tags</p>
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {formula.tags.length > 0 ? (
                      formula.tags.map((tag) => (
                        <span key={tag} className="rounded-full border border-slate-200 bg-white px-2 py-0.5 text-xs text-slate-600">
                          {tag}
                        </span>
                      ))
                    ) : (
                      <span className="text-sm text-slate-500">Keine Tags hinterlegt.</span>
                    )}
                  </div>
                </div>

                <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 xl:col-span-2">
                  <p className="text-[11px] font-bold uppercase tracking-widest text-slate-500">Beispiele</p>
                  {formula.examples.length > 0 ? (
                    <ul className="mt-2 space-y-1 text-sm text-slate-700 list-disc pl-5">
                      {formula.examples.map((example, index) => (
                        <li key={`${formula.id}-example-${index}`}>{example}</li>
                      ))}
                    </ul>
                  ) : (
                    <p className="mt-2 text-sm text-slate-500">Noch keine Beispiele hinterlegt.</p>
                  )}
                </div>

                {formula.stepByStepExplanation.trim() && (
                  <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 xl:col-span-2">
                    <p className="text-[11px] font-bold uppercase tracking-widest text-slate-500">Schritt-fuer-Schritt Erklaerung</p>
                    <div className="mt-2 text-sm text-slate-700">
                      <MathRenderer content={formula.stepByStepExplanation} />
                    </div>
                  </div>
                )}

                <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 xl:col-span-2">
                  <p className="text-[11px] font-bold uppercase tracking-widest text-slate-500">Quellen</p>
                  <p className="mt-2 text-sm text-slate-700">{sourceSummary}</p>
                </div>
              </div>

              {currentCard ? (
                <div className="rounded-2xl border border-indigo-100 shadow-sm overflow-hidden flex-1">
                  <div className="px-4 sm:px-5 py-4 bg-indigo-50 border-b border-indigo-100">
                    <div className="flex items-center gap-3">
                      <span className="inline-flex h-8 w-8 sm:h-9 sm:w-9 items-center justify-center rounded-full text-sm font-bold text-white bg-indigo-600 shadow-sm">
                        {currentCardIndex + 1}
                      </span>
                      <h3 className="text-base sm:text-lg font-bold text-indigo-700">
                        {currentCard.title || `Karte ${currentCardIndex + 1}`}
                      </h3>
                    </div>
                  </div>
                  <div className="bg-white p-4 sm:p-6 space-y-5">
                    <div className="text-base sm:text-lg text-slate-600 leading-relaxed">
                      <MathRenderer content={currentCard.explanation} />
                    </div>

                    {currentCard.formulas.length > 0 && (
                      <div className="rounded-2xl border border-indigo-100 bg-indigo-50/70 p-4 space-y-3 overflow-x-auto">
                        <p className="text-[11px] font-bold uppercase tracking-widest text-indigo-500">
                          Formeln in diesem Lernschritt
                        </p>
                        {currentCard.formulas.map((entry, index) => (
                          <div
                            key={`${currentCardIndex}-${index}`}
                            className="rounded-xl border border-white bg-white p-3 shadow-sm text-center"
                          >
                            <MathRenderer content={toDisplayMath(entry)} />
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              ) : (
                <div className="rounded-2xl border border-slate-200 bg-slate-50 p-6 text-sm text-slate-500">
                  Keine Lernkarte verfuegbar.
                </div>
              )}
            </div>

            <div className="p-3 sm:p-4 md:p-6 border-t border-slate-100 bg-white flex justify-between items-center gap-2 sm:gap-4">
              <button
                onClick={() => setCurrentCardIndex((index) => Math.max(0, index - 1))}
                disabled={isFirst}
                className={`flex items-center space-x-1 sm:space-x-2 px-3 sm:px-6 py-2.5 sm:py-3 rounded-xl font-semibold transition-all text-sm sm:text-base ${
                  isFirst
                    ? 'text-slate-300 cursor-not-allowed'
                    : 'text-slate-600 hover:bg-slate-50 hover:text-indigo-600'
                }`}
              >
                <ChevronLeft className="w-5 h-5" />
                <span>Zurueck</span>
              </button>

              <span className="text-xs text-slate-400 hidden md:inline" title="Pfeiltasten zur Navigation">
                &larr; &rarr;
              </span>

              <button
                onClick={() => setCurrentCardIndex((index) => Math.min(totalCards - 1, index + 1))}
                disabled={isLast}
                className={`px-4 sm:px-8 py-2.5 sm:py-3 rounded-xl font-bold text-sm sm:text-base shadow-lg transition-all active:scale-95 flex items-center gap-2 ${
                  isLast
                    ? 'bg-slate-100 text-slate-400 shadow-none cursor-not-allowed'
                    : 'bg-indigo-600 hover:bg-indigo-700 text-white shadow-indigo-200'
                }`}
              >
                <span>Naechste Karte</span>
                <ChevronRight className="w-5 h-5" />
              </button>
            </div>
          </div>

          {isLast && (
            <div className="mt-5 rounded-2xl border border-emerald-200 bg-emerald-50 p-5 text-center">
              <p className="text-base font-bold text-emerald-800 mb-1">Alle Karten durchgearbeitet!</p>
              <p className="text-sm text-emerald-700 mb-3">
                Du hast alle {totalCards} Lernkarten zu <span className="font-semibold">{formula.title}</span> abgeschlossen.
              </p>
              <button
                onClick={() => setCurrentCardIndex(0)}
                className="inline-flex items-center gap-2 rounded-xl border border-emerald-300 bg-white px-4 py-2 text-sm font-semibold text-emerald-700 hover:bg-emerald-100 transition-colors"
              >
                Von vorne starten
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default FormulaDetailView;
