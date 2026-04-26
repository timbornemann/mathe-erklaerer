import React, { useEffect, useMemo, useState } from 'react';
import { BookOpen, Download, Loader2, Plus, Save, Search, Sparkles, X } from 'lucide-react';
import MathRenderer from './MathRenderer';
import { FormulaEntry, Project } from '../types';
import { buildFormulaSearchText } from '../services/formulaCollection';

type FormulaSortMode = 'newest' | 'most-used' | 'title';
type UtilityPanelMode = 'none' | 'add' | 'cheat-sheet';

interface FormulaCollectionViewProps {
  formulas: FormulaEntry[];
  projects: Project[];
  activeProjectId: string | null;
  onAddFormulaLatex: (formula: string, contextText?: string) => Promise<void> | void;
  onAskFormulaPrompt: (prompt: string) => Promise<void> | void;
  onUpdateFormula: (formulaId: string, updates: Partial<FormulaEntry>) => void;
  onDeleteFormula: (formulaId: string) => void;
  onMarkUsed: (formulaId: string) => void;
  onRetryFormula: (formulaId: string) => void;
  onDownloadCheatSheetMarkdown: (formulaIds: string[]) => void;
  onDownloadCheatSheetPdf: (formulaIds: string[]) => void;
  onOpenFormulaDetail: (formulaId: string) => void;
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

const FormulaCollectionView: React.FC<FormulaCollectionViewProps> = ({
  formulas,
  projects,
  activeProjectId,
  onAddFormulaLatex,
  onAskFormulaPrompt,
  onUpdateFormula: _onUpdateFormula,
  onDeleteFormula: _onDeleteFormula,
  onMarkUsed: _onMarkUsed,
  onRetryFormula,
  onDownloadCheatSheetMarkdown,
  onDownloadCheatSheetPdf,
  onOpenFormulaDetail
}) => {
  const [search, setSearch] = useState('');
  const [tagFilter, setTagFilter] = useState('');
  const [projectFilter, setProjectFilter] = useState<'all' | 'none' | string>('all');
  const [sortMode, setSortMode] = useState<FormulaSortMode>('newest');
  const [newFormulaLatex, setNewFormulaLatex] = useState('');
  const [newFormulaContext, setNewFormulaContext] = useState('');
  const [newFormulaPrompt, setNewFormulaPrompt] = useState('');
  const [isAddingFormula, setIsAddingFormula] = useState(false);
  const [isAskingPrompt, setIsAskingPrompt] = useState(false);
  const [feedbackMessage, setFeedbackMessage] = useState<string | null>(null);
  const [activeUtilityPanel, setActiveUtilityPanel] = useState<UtilityPanelMode>('none');

  const [cheatSheetTopN, setCheatSheetTopN] = useState(10);
  const [selectedCheatSheetIds, setSelectedCheatSheetIds] = useState<string[]>([]);

  const availableTags = useMemo(() => {
    const tags = new Set<string>();
    formulas.forEach((entry) => entry.tags.forEach((tag) => tags.add(tag)));
    return Array.from(tags).sort((a, b) => a.localeCompare(b, 'de'));
  }, [formulas]);

  const filteredAndSortedFormulas = useMemo(() => {
    const query = search.trim().toLowerCase();
    let next = formulas.filter((entry) => {
      if (query && !buildFormulaSearchText(entry).includes(query)) return false;
      if (tagFilter && !entry.tags.includes(tagFilter)) return false;
      if (projectFilter === 'none' && entry.projectIds.length > 0) return false;
      if (projectFilter !== 'all' && projectFilter !== 'none' && !entry.projectIds.includes(projectFilter)) return false;
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
  }, [formulas, projectFilter, search, sortMode, tagFilter]);

  const topUsed = useMemo(
    () => [...formulas].sort((a, b) => b.usageCount - a.usageCount || b.updatedAt - a.updatedAt).slice(0, 20),
    [formulas]
  );

  useEffect(() => {
    if (activeUtilityPanel === 'none') {
      setFeedbackMessage(null);
    }
  }, [activeUtilityPanel]);

  useEffect(() => {
    if (activeUtilityPanel !== 'cheat-sheet') return;
    if (selectedCheatSheetIds.length > 0) return;
    const topIds = topUsed.slice(0, Math.max(1, cheatSheetTopN)).map((entry) => entry.id);
    setSelectedCheatSheetIds(topIds);
  }, [activeUtilityPanel, cheatSheetTopN, selectedCheatSheetIds.length, topUsed]);

  const handleAddLatex = async () => {
    const formula = newFormulaLatex.trim();
    if (!formula || isAddingFormula) return;
    setIsAddingFormula(true);
    setFeedbackMessage(null);
    try {
      await onAddFormulaLatex(formula, newFormulaContext.trim() || undefined);
      setNewFormulaLatex('');
      setNewFormulaContext('');
      setFeedbackMessage('Formel wurde hinzugefuegt und wird im Hintergrund angereichert.');
    } catch (error: any) {
      setFeedbackMessage(error?.message || 'Formel konnte nicht hinzugefuegt werden.');
    } finally {
      setIsAddingFormula(false);
    }
  };

  const handleAskPrompt = async () => {
    const prompt = newFormulaPrompt.trim();
    if (!prompt || isAskingPrompt) return;
    setIsAskingPrompt(true);
    setFeedbackMessage(null);
    try {
      await onAskFormulaPrompt(prompt);
      setNewFormulaPrompt('');
      setFeedbackMessage('Formelkarte wurde erstellt.');
    } catch (error: any) {
      setFeedbackMessage(error?.message || 'Formel konnte nicht erstellt werden.');
    } finally {
      setIsAskingPrompt(false);
    }
  };

  const defaultCheatSheetSelection = () => {
    const topIds = topUsed.slice(0, Math.max(1, cheatSheetTopN)).map((entry) => entry.id);
    setSelectedCheatSheetIds(topIds);
  };

  const toggleCheatSheetFormula = (formulaId: string) => {
    setSelectedCheatSheetIds((prev) =>
      prev.includes(formulaId) ? prev.filter((id) => id !== formulaId) : [...prev, formulaId]
    );
  };

  return (
    <div className="space-y-5">
      <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <h2 className="text-lg font-bold text-slate-800">Formelsammlung</h2>
            <p className="text-sm text-slate-600">
              Wähle eine Formel und öffne die komplette Detailseite im Lesson-Stil.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              onClick={() => setActiveUtilityPanel('add')}
              className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50"
            >
              <Plus className="w-3.5 h-3.5" />
              Neue Formel
            </button>
            <button
              onClick={() => setActiveUtilityPanel('cheat-sheet')}
              className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50"
            >
              <Download className="w-3.5 h-3.5" />
              Cheat-Sheet
            </button>
          </div>
        </div>

        <div className="mt-4 grid gap-2 sm:grid-cols-3">
          <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Formeln</p>
            <p className="text-base font-bold text-slate-800">{formulas.length}</p>
          </div>
          <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Premium-Karten</p>
            <p className="text-base font-bold text-slate-800">
              {formulas.filter((entry) => (entry.detailCards?.length ?? 0) > 0).length}
            </p>
          </div>
          <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">In Generierung</p>
            <p className="text-base font-bold text-slate-800">
              {formulas.filter((entry) => entry.status === 'pending').length}
            </p>
          </div>
        </div>
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5 space-y-3">
        <div className="grid gap-3 md:grid-cols-4">
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Suchen..."
            className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm focus:border-indigo-500 focus:ring-1 focus:ring-indigo-200 md:col-span-2"
          />
          <select
            value={tagFilter}
            onChange={(e) => setTagFilter(e.target.value)}
            className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm focus:border-indigo-500 focus:ring-1 focus:ring-indigo-200"
          >
            <option value="">Alle Tags</option>
            {availableTags.map((tag) => (
              <option key={tag} value={tag}>
                {tag}
              </option>
            ))}
          </select>
          <select
            value={projectFilter}
            onChange={(e) => setProjectFilter(e.target.value)}
            className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm focus:border-indigo-500 focus:ring-1 focus:ring-indigo-200"
          >
            <option value="all">Alle Projekte</option>
            <option value="none">Ohne Projekt</option>
            {projects.map((project) => (
              <option key={project.id} value={project.id}>
                {project.name}
                {activeProjectId === project.id ? ' (aktiv)' : ''}
              </option>
            ))}
          </select>
        </div>
        <div className="flex justify-end">
          <select
            value={sortMode}
            onChange={(e) => setSortMode(e.target.value as FormulaSortMode)}
            className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm focus:border-indigo-500 focus:ring-1 focus:ring-indigo-200"
          >
            <option value="newest">Neueste zuerst</option>
            <option value="most-used">Meist verwendet</option>
            <option value="title">Titel A-Z</option>
          </select>
        </div>
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5 space-y-3">
        <div className="flex items-center justify-between gap-3">
          <h3 className="text-sm font-semibold text-slate-700">{filteredAndSortedFormulas.length} Formeln</h3>
          <p className="text-xs text-slate-500">Alle Details findest du in der Detailseite jeder Formel.</p>
        </div>

        {filteredAndSortedFormulas.length === 0 ? (
          <p className="text-sm text-slate-500 rounded-xl border border-dashed border-slate-200 bg-slate-50 p-4">
            Keine Formeln gefunden.
          </p>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {filteredAndSortedFormulas.map((entry) => (
              <article key={entry.id} className="rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
                <div className="flex items-start justify-between gap-2">
                  <p className="text-sm font-semibold text-slate-800">{entry.title}</p>
                  <span className={`text-[10px] px-2 py-0.5 rounded-full border font-semibold ${statusBadgeClass(entry.status)}`}>
                    {statusLabel(entry.status)}
                  </span>
                </div>

                <div className="mt-2 text-xs text-slate-700 overflow-x-auto">
                  <MathRenderer content={`$$ ${entry.formula} $$`} />
                </div>

                {entry.shortExplanation && (
                  <p className="mt-2 text-xs text-slate-600 line-clamp-2">{entry.shortExplanation}</p>
                )}

                <div className="mt-2 flex flex-wrap gap-1">
                  {entry.tags.slice(0, 3).map((tag) => (
                    <span key={tag} className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] text-slate-600">
                      {tag}
                    </span>
                  ))}
                </div>

                <div className="mt-3 flex items-center justify-between gap-2">
                  <span className="text-[11px] text-slate-500">{entry.usageCount}x verwendet</span>
                  <div className="flex flex-wrap gap-1.5">
                    <button
                      onClick={() => onOpenFormulaDetail(entry.id)}
                      className="inline-flex items-center gap-1.5 rounded-lg border border-indigo-200 bg-indigo-50 px-2.5 py-1 text-[11px] font-semibold text-indigo-700 hover:bg-indigo-100 transition-colors"
                    >
                      <BookOpen className="w-3 h-3" />
                      Detailseite
                    </button>
                    {(entry.detailCards?.length ?? 0) === 0 && entry.status !== 'pending' && (
                      <button
                        onClick={() => onRetryFormula(entry.id)}
                        className="inline-flex items-center gap-1 rounded-lg border border-amber-200 bg-amber-50 px-2.5 py-1 text-[11px] font-semibold text-amber-700 hover:bg-amber-100 transition-colors"
                      >
                        <Sparkles className="w-3 h-3" />
                        Premium
                      </button>
                    )}
                  </div>
                </div>
              </article>
            ))}
          </div>
        )}
      </section>

      {activeUtilityPanel !== 'none' && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-6">
          <button
            className="absolute inset-0 bg-slate-900/45"
            onClick={() => setActiveUtilityPanel('none')}
            aria-label="Modal schliessen"
          />

          <section className="relative z-10 w-full sm:max-w-4xl max-h-[92vh] overflow-y-auto rounded-t-2xl sm:rounded-2xl border border-slate-200 bg-white shadow-2xl">
            <div className="sticky top-0 z-10 flex items-center justify-between gap-2 border-b border-slate-100 bg-white/95 px-4 py-3 backdrop-blur">
              <h3 className="text-base font-bold text-slate-800">
                {activeUtilityPanel === 'add' ? 'Neue Formel erstellen' : 'Cheat-Sheet erstellen'}
              </h3>
              <button
                onClick={() => setActiveUtilityPanel('none')}
                className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2 py-1 text-xs font-semibold text-slate-600 hover:bg-slate-50"
              >
                <X className="w-3.5 h-3.5" />
                Schliessen
              </button>
            </div>

            <div className="p-4 sm:p-5">
              {activeUtilityPanel === 'add' ? (
                <div className="grid gap-5 lg:grid-cols-2">
                  <div className="space-y-3">
                    <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Manuell per Formel</p>
                    <textarea
                      value={newFormulaLatex}
                      onChange={(e) => setNewFormulaLatex(e.target.value)}
                      rows={2}
                      placeholder="Formel (LaTeX) eingeben..."
                      className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm focus:border-indigo-500 focus:ring-1 focus:ring-indigo-200 resize-none"
                    />
                    <textarea
                      value={newFormulaContext}
                      onChange={(e) => setNewFormulaContext(e.target.value)}
                      rows={2}
                      placeholder="Optionaler Kontext zur Formel (Quelle/Anwendungsfall)..."
                      className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm focus:border-indigo-500 focus:ring-1 focus:ring-indigo-200 resize-none"
                    />
                    <button
                      onClick={handleAddLatex}
                      disabled={!newFormulaLatex.trim() || isAddingFormula}
                      className="inline-flex items-center gap-2 rounded-xl bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-50"
                    >
                      {isAddingFormula ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                      Formel speichern
                    </button>
                  </div>

                  <div className="space-y-3 border-t border-slate-100 pt-4 lg:border-l lg:border-t-0 lg:pl-5 lg:pt-0">
                    <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Per KI-Frage</p>
                    <textarea
                      value={newFormulaPrompt}
                      onChange={(e) => setNewFormulaPrompt(e.target.value)}
                      rows={4}
                      placeholder="Frage nach einer Formel (z. B. Wann nutze ich den Satz des Pythagoras?)"
                      className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm focus:border-indigo-500 focus:ring-1 focus:ring-indigo-200 resize-none"
                    />
                    <button
                      onClick={handleAskPrompt}
                      disabled={!newFormulaPrompt.trim() || isAskingPrompt}
                      className="inline-flex items-center gap-2 rounded-xl border border-indigo-200 bg-indigo-50 px-4 py-2.5 text-sm font-semibold text-indigo-700 hover:bg-indigo-100 disabled:opacity-50"
                    >
                      {isAskingPrompt ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
                      Formel per KI erstellen
                    </button>
                  </div>
                </div>
              ) : (
                <div className="space-y-3">
                  <p className="text-sm text-slate-600">
                    Wähle Formeln aus oder nutze automatisch die meistverwendeten.
                  </p>
                  <div className="flex flex-wrap items-center gap-2">
                    <label className="text-xs font-semibold text-slate-600">Top N</label>
                    <input
                      value={cheatSheetTopN}
                      onChange={(e) => setCheatSheetTopN(Math.max(1, Number(e.target.value) || 1))}
                      type="number"
                      min={1}
                      max={50}
                      className="w-20 rounded-lg border border-slate-200 px-2 py-1.5 text-sm"
                    />
                    <button
                      onClick={defaultCheatSheetSelection}
                      className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-100"
                    >
                      Top {Math.max(1, cheatSheetTopN)} waehlen
                    </button>
                  </div>

                  {topUsed.length === 0 ? (
                    <p className="text-sm text-slate-500 rounded-xl border border-dashed border-slate-200 bg-slate-50 p-4">
                      Noch keine Formeln fuer ein Cheat-Sheet vorhanden.
                    </p>
                  ) : (
                    <div className="space-y-1 max-h-64 overflow-y-auto pr-1">
                      {topUsed.map((entry) => (
                        <label
                          key={entry.id}
                          className="flex items-center justify-between gap-2 text-xs rounded-lg border border-slate-100 bg-slate-50 px-2 py-1.5"
                        >
                          <span className="truncate">{entry.title}</span>
                          <div className="flex items-center gap-2">
                            <span className="text-slate-500">{entry.usageCount}x</span>
                            <input
                              type="checkbox"
                              checked={selectedCheatSheetIds.includes(entry.id)}
                              onChange={() => toggleCheatSheetFormula(entry.id)}
                            />
                          </div>
                        </label>
                      ))}
                    </div>
                  )}

                  <div className="flex flex-wrap gap-2">
                    <button
                      onClick={() => onDownloadCheatSheetMarkdown(selectedCheatSheetIds)}
                      disabled={selectedCheatSheetIds.length === 0}
                      className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
                    >
                      <Download className="w-3.5 h-3.5" />
                      Markdown
                    </button>
                    <button
                      onClick={() => onDownloadCheatSheetPdf(selectedCheatSheetIds)}
                      disabled={selectedCheatSheetIds.length === 0}
                      className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
                    >
                      <Download className="w-3.5 h-3.5" />
                      PDF
                    </button>
                  </div>
                </div>
              )}

              {feedbackMessage && <p className="mt-3 text-xs text-slate-500">{feedbackMessage}</p>}
            </div>
          </section>
        </div>
      )}
    </div>
  );
};

export default FormulaCollectionView;
