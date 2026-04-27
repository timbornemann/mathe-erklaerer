import React, { useEffect, useMemo, useState } from 'react';
import { Download, MoreHorizontal, Pencil, Plus, Save, Search, Sparkles, Trash2, X } from 'lucide-react';
import MathRenderer from './MathRenderer';
import { FormulaEntry, Project } from '../types';
import { buildFormulaSearchText } from '../services/formulaCollection';

type FormulaSortMode = 'newest' | 'most-used' | 'title';
type AddTabMode = 'manual' | 'prompt';

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
  onUpdateFormula,
  onDeleteFormula,
  onMarkUsed,
  onRetryFormula,
  onDownloadCheatSheetMarkdown,
  onDownloadCheatSheetPdf,
  onOpenFormulaDetail
}) => {
  const [search, setSearch] = useState('');
  const [tagFilter, setTagFilter] = useState('');
  const [projectFilter, setProjectFilter] = useState<'all' | 'none' | string>('all');
  const [sortMode, setSortMode] = useState<FormulaSortMode>('newest');

  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [addTab, setAddTab] = useState<AddTabMode>('manual');
  const [newFormulaLatex, setNewFormulaLatex] = useState('');
  const [newFormulaContext, setNewFormulaContext] = useState('');
  const [newFormulaPrompt, setNewFormulaPrompt] = useState('');
  const [feedbackMessage, setFeedbackMessage] = useState<string | null>(null);

  const [isOverflowOpen, setIsOverflowOpen] = useState(false);
  const [isCheatSheetOpen, setIsCheatSheetOpen] = useState(false);
  const [cheatSheetTopN, setCheatSheetTopN] = useState(10);
  const [selectedCheatSheetIds, setSelectedCheatSheetIds] = useState<string[]>([]);
  const [editingFormulaId, setEditingFormulaId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState('');
  const [editSummary, setEditSummary] = useState('');
  const [editTags, setEditTags] = useState('');
  const [editProjectIds, setEditProjectIds] = useState<string[]>([]);

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
    () => [...formulas].sort((a, b) => b.usageCount - a.usageCount || b.updatedAt - a.updatedAt).slice(0, 30),
    [formulas]
  );

  useEffect(() => {
    if (!isCheatSheetOpen) return;
    if (selectedCheatSheetIds.length > 0) return;
    const topIds = topUsed.slice(0, Math.max(1, cheatSheetTopN)).map((entry) => entry.id);
    setSelectedCheatSheetIds(topIds);
  }, [cheatSheetTopN, isCheatSheetOpen, selectedCheatSheetIds.length, topUsed]);

  const handleAddLatex = () => {
    const formula = newFormulaLatex.trim();
    const context = newFormulaContext.trim() || undefined;
    if (!formula) return;

    setNewFormulaLatex('');
    setNewFormulaContext('');
    setIsAddModalOpen(false);
    setFeedbackMessage('Formel wird erstellt und in die Liste uebernommen.');

    void Promise.resolve(onAddFormulaLatex(formula, context))
      .then(() => setFeedbackMessage('Formel hinzugefuegt. Lernpfad wird erstellt.'))
      .catch((error: any) => {
        setFeedbackMessage(error?.message || 'Formel konnte nicht hinzugefuegt werden.');
      });
  };

  const handleAskPrompt = () => {
    const prompt = newFormulaPrompt.trim();
    if (!prompt) return;

    setNewFormulaPrompt('');
    setIsAddModalOpen(false);
    setFeedbackMessage('Formel wird erstellt und in die Liste uebernommen.');

    void Promise.resolve(onAskFormulaPrompt(prompt))
      .then(() => setFeedbackMessage('Formelkarte wurde erstellt.'))
      .catch((error: any) => {
        setFeedbackMessage(error?.message || 'Formel konnte nicht erstellt werden.');
      });
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

  const openEditFormula = (entry: FormulaEntry) => {
    setEditingFormulaId(entry.id);
    setEditTitle(entry.title);
    setEditSummary(entry.summary);
    setEditTags(entry.tags.join(', '));
    setEditProjectIds(entry.projectIds);
  };

  const closeEditFormula = () => {
    setEditingFormulaId(null);
    setEditTitle('');
    setEditSummary('');
    setEditTags('');
    setEditProjectIds([]);
  };

  const toggleEditProject = (projectId: string) => {
    setEditProjectIds((prev) =>
      prev.includes(projectId) ? prev.filter((id) => id !== projectId) : [...prev, projectId]
    );
  };

  const saveFormulaEdits = () => {
    if (!editingFormulaId) return;
    const tags = editTags
      .split(/[,\n;]/)
      .map((tag) => tag.trim())
      .filter(Boolean);

    onUpdateFormula(editingFormulaId, {
      title: editTitle.trim() || 'Neue Formel',
      summary: editSummary.trim(),
      tags,
      projectIds: editProjectIds
    });

    setFeedbackMessage('Formel wurde aktualisiert.');
    closeEditFormula();
  };

  const deleteEditedFormula = () => {
    if (!editingFormulaId) return;
    onDeleteFormula(editingFormulaId);
    setFeedbackMessage('Formel wurde geloescht.');
    closeEditFormula();
  };

  return (
    <div className="space-y-4">
      <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <h2 className="text-lg font-bold text-slate-800">Formelsammlung</h2>
              <p className="text-sm text-slate-600">Kompakte Lernpfade mit Lektionen und Unterkarten.</p>
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={() => setIsAddModalOpen(true)}
                className="inline-flex items-center gap-2 rounded-xl bg-indigo-600 px-3.5 py-2 text-xs font-semibold text-white hover:bg-indigo-700"
              >
                <Plus className="h-3.5 w-3.5" />
                Neue Formel
              </button>
              <div className="relative">
                <button
                  onClick={() => setIsOverflowOpen((prev) => !prev)}
                  className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                >
                  <MoreHorizontal className="h-3.5 w-3.5" />
                  Mehr
                </button>
                {isOverflowOpen && (
                  <div className="absolute right-0 z-20 mt-2 w-44 rounded-xl border border-slate-200 bg-white p-1.5 shadow-lg">
                    <button
                      onClick={() => {
                        setIsCheatSheetOpen(true);
                        setIsOverflowOpen(false);
                      }}
                      className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-xs font-semibold text-slate-700 hover:bg-slate-50"
                    >
                      <Download className="h-3.5 w-3.5 text-slate-500" />
                      Cheat-Sheet exportieren
                    </button>
                  </div>
                )}
              </div>
            </div>
          </div>

          <div className="grid gap-3 md:grid-cols-5">
            <div className="relative md:col-span-2">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Formeln durchsuchen..."
                className="w-full rounded-xl border border-slate-200 bg-slate-50 py-2.5 pl-9 pr-3 text-sm focus:border-indigo-500 focus:ring-1 focus:ring-indigo-200"
              />
            </div>
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
            <select
              value={sortMode}
              onChange={(e) => setSortMode(e.target.value as FormulaSortMode)}
              className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm focus:border-indigo-500 focus:ring-1 focus:ring-indigo-200"
            >
              <option value="newest">Neueste</option>
              <option value="most-used">Meist genutzt</option>
              <option value="title">Titel A-Z</option>
            </select>
          </div>

          {feedbackMessage && (
            <button
              onClick={() => setFeedbackMessage(null)}
              className="inline-flex items-center justify-between gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-left text-xs text-slate-600 hover:bg-slate-100"
            >
              <span>{feedbackMessage}</span>
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-100 px-4 py-3 sm:px-5">
          <p className="text-sm font-semibold text-slate-700">{filteredAndSortedFormulas.length} Formeln</p>
        </div>

        {filteredAndSortedFormulas.length === 0 ? (
          <div className="p-5">
            <p className="rounded-xl border border-dashed border-slate-200 bg-slate-50 p-4 text-sm text-slate-500">
              Keine Formeln gefunden.
            </p>
          </div>
        ) : (
          <div className="divide-y divide-slate-100">
            {filteredAndSortedFormulas.map((entry) => {
              return (
                <article key={entry.id} className="flex flex-col gap-3 px-4 py-4 sm:px-5 lg:flex-row lg:items-start lg:justify-between">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="truncate text-sm font-semibold text-slate-800">{entry.title}</p>
                      <span className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold ${statusBadgeClass(entry.status)}`}>
                        {statusLabel(entry.status)}
                      </span>
                    </div>

                    <div className="mt-2 overflow-x-auto text-xs text-slate-700">
                      <MathRenderer content={`$$ ${entry.formula} $$`} />
                    </div>

                    {entry.status === 'pending' && (
                      <div className="mt-2 rounded-xl border border-amber-200 bg-amber-50 p-2.5">
                        <p className="text-[11px] font-semibold text-amber-700">Lernpfad wird im Hintergrund erstellt...</p>
                        <div className="mt-2 space-y-1.5">
                          <div className="h-2.5 w-full animate-pulse rounded bg-amber-100" />
                          <div className="h-2.5 w-5/6 animate-pulse rounded bg-amber-100" />
                          <div className="h-2.5 w-2/3 animate-pulse rounded bg-amber-100" />
                        </div>
                      </div>
                    )}

                    {entry.status !== 'pending' && entry.summary && (
                      <div className="mt-2 max-h-16 overflow-hidden text-xs text-slate-600">
                        <MathRenderer content={entry.summary} />
                      </div>
                    )}

                    <div className="mt-2 flex flex-wrap gap-1">
                      {entry.tags.slice(0, 4).map((tag) => (
                        <span key={tag} className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] text-slate-600">
                          {tag}
                        </span>
                      ))}
                    </div>
                  </div>

                  <div className="flex min-w-[230px] flex-col items-start gap-2 lg:items-end">
                    <div className="flex w-full flex-col gap-1.5 sm:w-auto">
                      <button
                        onClick={() => onMarkUsed(entry.id)}
                        className="rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-left text-[11px] font-semibold text-slate-700 hover:bg-slate-50"
                      >
                        Genutzt
                      </button>
                      <button
                        onClick={() => onOpenFormulaDetail(entry.id)}
                        className="rounded-lg border border-indigo-200 bg-indigo-50 px-2.5 py-1 text-left text-[11px] font-semibold text-indigo-700 hover:bg-indigo-100"
                      >
                        Detailseite
                      </button>
                      <button
                        onClick={() => openEditFormula(entry)}
                        className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-left text-[11px] font-semibold text-slate-700 hover:bg-slate-50"
                      >
                        <Pencil className="h-3 w-3" />
                        Bearbeiten
                      </button>
                      {entry.status === 'failed' && (
                        <button
                          onClick={() => onRetryFormula(entry.id)}
                          className="inline-flex items-center gap-1 rounded-lg border border-red-200 bg-red-50 px-2.5 py-1 text-left text-[11px] font-semibold text-red-700 hover:bg-red-100"
                        >
                          <Sparkles className="h-3 w-3" />
                          Retry
                        </button>
                      )}
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </section>

      {isAddModalOpen && (
        <div className="fixed inset-0 z-50 flex items-end justify-center p-0 sm:items-center sm:p-6">
          <button
            className="absolute inset-0 bg-slate-900/45"
            onClick={() => setIsAddModalOpen(false)}
            aria-label="Modal schliessen"
          />

          <section className="relative z-10 w-full max-h-[92vh] overflow-y-auto rounded-t-2xl border border-slate-200 bg-white shadow-2xl sm:max-w-3xl sm:rounded-2xl">
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

            <div className="p-4 sm:p-5">
              <div className="mb-4 inline-flex rounded-xl border border-slate-200 bg-slate-50 p-1 text-xs font-semibold">
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
                    placeholder="Optionaler Kontext (Quelle, Thema, Klassenstufe, gewuenschte Tiefe)..."
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
                    placeholder="Frage nach einer Formel (z. B. Wie funktioniert die Mitternachtsformel und wann nutze ich sie?)"
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

      {isCheatSheetOpen && (
        <div className="fixed inset-0 z-50 flex items-end justify-center p-0 sm:items-center sm:p-6">
          <button
            className="absolute inset-0 bg-slate-900/45"
            onClick={() => setIsCheatSheetOpen(false)}
            aria-label="Modal schliessen"
          />

          <section className="relative z-10 w-full max-h-[92vh] overflow-y-auto rounded-t-2xl border border-slate-200 bg-white shadow-2xl sm:max-w-3xl sm:rounded-2xl">
            <div className="sticky top-0 z-10 flex items-center justify-between border-b border-slate-100 bg-white/95 px-4 py-3 backdrop-blur">
              <h3 className="text-base font-bold text-slate-800">Cheat-Sheet Export</h3>
              <button
                onClick={() => setIsCheatSheetOpen(false)}
                className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2 py-1 text-xs font-semibold text-slate-600 hover:bg-slate-50"
              >
                <X className="h-3.5 w-3.5" />
                Schliessen
              </button>
            </div>

            <div className="space-y-3 p-4 sm:p-5">
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
                <p className="rounded-xl border border-dashed border-slate-200 bg-slate-50 p-4 text-sm text-slate-500">
                  Noch keine Formeln fuer ein Cheat-Sheet vorhanden.
                </p>
              ) : (
                <div className="max-h-72 space-y-1 overflow-y-auto pr-1">
                  {topUsed.map((entry) => (
                    <label
                      key={entry.id}
                      className="flex items-center justify-between gap-2 rounded-lg border border-slate-100 bg-slate-50 px-2 py-1.5 text-xs"
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

              <div className="flex flex-wrap gap-2 pt-1">
                <button
                  onClick={() => onDownloadCheatSheetMarkdown(selectedCheatSheetIds)}
                  disabled={selectedCheatSheetIds.length === 0}
                  className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
                >
                  <Download className="h-3.5 w-3.5" />
                  Markdown
                </button>
                <button
                  onClick={() => onDownloadCheatSheetPdf(selectedCheatSheetIds)}
                  disabled={selectedCheatSheetIds.length === 0}
                  className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
                >
                  <Download className="h-3.5 w-3.5" />
                  PDF
                </button>
              </div>
            </div>
          </section>
        </div>
      )}

      {editingFormulaId && (
        <div className="fixed inset-0 z-50 flex items-end justify-center p-0 sm:items-center sm:p-6">
          <button
            className="absolute inset-0 bg-slate-900/45"
            onClick={closeEditFormula}
            aria-label="Bearbeiten schliessen"
          />

          <section className="relative z-10 w-full max-h-[92vh] overflow-y-auto rounded-t-2xl border border-slate-200 bg-white shadow-2xl sm:max-w-2xl sm:rounded-2xl">
            <div className="sticky top-0 z-10 flex items-center justify-between border-b border-slate-100 bg-white/95 px-4 py-3 backdrop-blur">
              <h3 className="text-base font-bold text-slate-800">Formel bearbeiten</h3>
              <button
                onClick={closeEditFormula}
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
                <button
                  onClick={deleteEditedFormula}
                  className="inline-flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs font-semibold text-red-700 hover:bg-red-100"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                  Formel loeschen
                </button>
                <div className="flex gap-2">
                <button
                  onClick={closeEditFormula}
                  className="rounded-lg border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-50"
                >
                  Abbrechen
                </button>
                <button
                  onClick={saveFormulaEdits}
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
    </div>
  );
};

export default FormulaCollectionView;
