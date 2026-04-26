import React, { useEffect, useMemo, useState } from 'react';
import {
  ArrowLeft,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  List,
  Loader2,
  RotateCcw,
  Sparkles,
  Trash2,
  X
} from 'lucide-react';
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
  const [isTocOpenMobile, setIsTocOpenMobile] = useState(false);

  const hasPremiumCards = (formula.detailCards?.length ?? 0) > 0;
  const cards = useMemo<FormulaDetailCard[]>(
    () => (hasPremiumCards ? (formula.detailCards ?? []) : buildFallbackCards(formula)),
    [formula, hasPremiumCards]
  );
  const totalCards = cards.length;
  const currentCard = cards[currentCardIndex] ?? cards[0] ?? null;
  const progress = totalCards > 0 ? ((currentCardIndex + 1) / totalCards) * 100 : 0;

  const canGeneratePremium = typeof onGeneratePremium === 'function' && formula.status !== 'pending';
  const isFirst = currentCardIndex === 0;
  const isLast = currentCardIndex === totalCards - 1;

  const statusLabel = formula.status === 'pending' ? 'Wird erstellt' : formula.status === 'failed' ? 'Fehlgeschlagen' : 'Bereit';
  const statusBadgeClass =
    formula.status === 'pending'
      ? 'border-amber-200 bg-amber-50 text-amber-700'
      : formula.status === 'failed'
      ? 'border-red-200 bg-red-50 text-red-700'
      : 'border-emerald-200 bg-emerald-50 text-emerald-700';
  const sourceSummary = formula.sourceRefs.map((source) => `${source.type} (${source.label})`).join(', ') || 'Keine';

  useEffect(() => {
    setCurrentCardIndex(0);
    setIsTocOpenMobile(false);
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

  const navigateToCard = (index: number, closeAfterNavigate = false) => {
    const boundedIndex = Math.max(0, Math.min(index, totalCards - 1));
    setCurrentCardIndex(boundedIndex);
    if (closeAfterNavigate) setIsTocOpenMobile(false);
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
            className={`w-full rounded-xl border px-3 py-2.5 text-left transition-colors ${
              isActive ? 'border-indigo-200 bg-indigo-50' : 'border-slate-200 bg-white hover:bg-slate-50'
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
    <div className="space-y-5">
      {isTocOpenMobile && (
        <div className="fixed inset-0 z-50 xl:hidden">
          <button
            className="absolute inset-0 bg-slate-900/35"
            onClick={() => setIsTocOpenMobile(false)}
            aria-label="Inhaltsverzeichnis schliessen"
          />
          <div className="absolute left-0 top-0 h-full w-[88vw] max-w-sm bg-white shadow-2xl border-r border-slate-200 flex flex-col">
            <div className="border-b border-slate-100 px-4 py-3 flex items-center justify-between">
              <div>
                <p className="text-sm font-bold text-slate-800">Inhaltsverzeichnis</p>
                <p className="text-xs text-slate-500">{totalCards} Lernkarten</p>
              </div>
              <button
                onClick={() => setIsTocOpenMobile(false)}
                className="p-2 rounded-lg hover:bg-slate-100 text-slate-500"
                aria-label="Schliessen"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto p-2 space-y-1.5">{renderTocEntries(true)}</div>
          </div>
        </div>
      )}

      <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <button
                onClick={onBack}
                className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-100"
              >
                <ArrowLeft className="w-3.5 h-3.5" />
                Zurueck
              </button>
              <span className={`inline-flex rounded-full border px-2 py-0.5 text-[11px] font-semibold ${statusBadgeClass}`}>
                {statusLabel}
              </span>
              <span className="rounded-full bg-indigo-100 px-2 py-0.5 text-[11px] font-semibold text-indigo-700">
                Karte {Math.max(1, currentCardIndex + 1)} / {Math.max(1, totalCards)}
              </span>
              <span
                className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${
                  hasPremiumCards ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'
                }`}
              >
                {hasPremiumCards ? 'Premium-Ansicht' : 'Basis-Ansicht'}
              </span>
            </div>
            <h2 className="mt-2 text-xl sm:text-2xl font-bold text-slate-800">{formula.title}</h2>
          </div>
          <button
            onClick={() => setIsTocOpenMobile(true)}
            className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 xl:hidden"
          >
            <List className="w-4 h-4 text-indigo-600" />
            Inhaltsverzeichnis
          </button>
        </div>

        <div className="mt-4 w-full bg-slate-200 rounded-full h-2.5 overflow-hidden">
          <div className="bg-indigo-600 h-2.5 rounded-full transition-all duration-500 ease-out" style={{ width: `${progress}%` }} />
        </div>
      </section>

      <div className="grid gap-5 xl:grid-cols-[280px_minmax(0,1fr)]">
        <aside className="hidden xl:block">
          <div className="sticky top-24 rounded-2xl border border-slate-200 bg-white p-3 shadow-sm">
            <p className="px-1 pb-2 text-sm font-semibold text-slate-700">Lernkarten</p>
            <div className="space-y-1.5 max-h-[70vh] overflow-y-auto pr-1">{renderTocEntries()}</div>
          </div>
        </aside>

        <div className="space-y-5 min-w-0">
          <section className="rounded-2xl border border-indigo-100 bg-gradient-to-br from-indigo-50 via-white to-violet-50 p-4 sm:p-5 shadow-sm">
            <div className="overflow-x-auto text-center">
              <MathRenderer content={toDisplayMath(formula.formula)} />
            </div>
            {formula.shortExplanation && <p className="mt-3 text-sm text-slate-600 text-center">{formula.shortExplanation}</p>}
          </section>

          {!hasPremiumCards && (
            <section className="rounded-2xl border border-amber-200 bg-amber-50/80 p-4">
              <p className="text-sm font-bold text-amber-800">Premium-Lernkarten fehlen noch</p>
              {formula.status === 'pending' ? (
                <p className="mt-1 inline-flex items-center gap-2 text-xs font-semibold text-amber-700">
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  Die KI erstellt gerade den detailreichen Karten-Flow.
                </p>
              ) : formula.status === 'failed' ? (
                <p className="mt-1 text-xs text-amber-700">Die letzte Generierung ist fehlgeschlagen. Starte die Generierung erneut.</p>
              ) : (
                <p className="mt-1 text-xs text-amber-700">Aktuell siehst du eine Basisansicht aus den vorhandenen Inhalten.</p>
              )}
            </section>
          )}

          <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
            <div className="flex flex-wrap gap-2">
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
          </section>

          <section className="grid gap-4 xl:grid-cols-2">
            <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
              <p className="text-[11px] font-bold uppercase tracking-widest text-slate-500">Verwendung</p>
              <p className="mt-2 text-sm text-slate-700">{formula.purpose.trim() || 'Noch kein Verwendungszweck hinterlegt.'}</p>
            </div>

            <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
              <p className="text-[11px] font-bold uppercase tracking-widest text-slate-500">Status & Nutzung</p>
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <span className={`inline-flex rounded-full border px-2 py-0.5 text-[11px] font-semibold ${statusBadgeClass}`}>
                  {statusLabel}
                </span>
                <span className="text-sm text-slate-700">{formula.usageCount}x verwendet</span>
              </div>
            </div>

            <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm xl:col-span-2">
              <p className="text-[11px] font-bold uppercase tracking-widest text-slate-500">Tags</p>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {formula.tags.length > 0 ? (
                  formula.tags.map((tag) => (
                    <span key={tag} className="rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 text-xs text-slate-600">
                      {tag}
                    </span>
                  ))
                ) : (
                  <span className="text-sm text-slate-500">Keine Tags hinterlegt.</span>
                )}
              </div>
            </div>

            <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm xl:col-span-2">
              <p className="text-[11px] font-bold uppercase tracking-widest text-slate-500">Quellen</p>
              <p className="mt-2 text-sm text-slate-700">{sourceSummary}</p>
            </div>
          </section>

          <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm xl:p-5">
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
          </section>

          {formula.stepByStepExplanation.trim() && (
            <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm xl:p-5">
              <p className="text-[11px] font-bold uppercase tracking-widest text-slate-500">Schritt-fuer-Schritt Erklaerung</p>
              <div className="mt-2 text-sm text-slate-700">
                <MathRenderer content={formula.stepByStepExplanation} />
              </div>
            </section>
          )}

          <section className="rounded-2xl border border-indigo-100 bg-white shadow-sm overflow-hidden">
            {currentCard ? (
              <>
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
                  <div className="text-base text-slate-700 leading-relaxed">
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

                <div className="p-3 sm:p-4 border-t border-slate-100 bg-white flex items-center justify-between gap-3">
                  <button
                    onClick={() => setCurrentCardIndex((index) => Math.max(0, index - 1))}
                    disabled={isFirst}
                    className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-semibold transition-colors ${
                      isFirst
                        ? 'cursor-not-allowed text-slate-300'
                        : 'text-slate-600 hover:bg-slate-50 hover:text-indigo-600'
                    }`}
                  >
                    <ChevronLeft className="w-4 h-4" />
                    Zurueck
                  </button>

                  <button
                    onClick={() => setCurrentCardIndex((index) => Math.min(totalCards - 1, index + 1))}
                    disabled={isLast}
                    className={`inline-flex items-center gap-1.5 rounded-lg px-4 py-2 text-sm font-bold transition-colors ${
                      isLast
                        ? 'cursor-not-allowed bg-slate-100 text-slate-400'
                        : 'bg-indigo-600 text-white hover:bg-indigo-700'
                    }`}
                  >
                    Naechste Karte
                    <ChevronRight className="w-4 h-4" />
                  </button>
                </div>
              </>
            ) : (
              <div className="p-6 text-sm text-slate-500">Keine Lernkarte verfuegbar.</div>
            )}
          </section>

          {isLast && (
            <section className="rounded-2xl border border-emerald-200 bg-emerald-50 p-5 text-center">
              <p className="text-base font-bold text-emerald-800 mb-1">Alle Karten durchgearbeitet!</p>
              <p className="text-sm text-emerald-700 mb-3">
                Du hast alle {totalCards} Lernkarten zu <span className="font-semibold">{formula.title}</span> abgeschlossen.
              </p>
              <button
                onClick={() => setCurrentCardIndex(0)}
                className="inline-flex items-center gap-2 rounded-xl border border-emerald-300 bg-white px-4 py-2 text-sm font-semibold text-emerald-700 hover:bg-emerald-100"
              >
                <RotateCcw className="w-4 h-4" />
                Von vorne starten
              </button>
            </section>
          )}
        </div>
      </div>
    </div>
  );
};

export default FormulaDetailView;
