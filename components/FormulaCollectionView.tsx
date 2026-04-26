import React, { useEffect, useMemo, useState } from 'react';
import { Download, Loader2, Pencil, Save, Search, Trash2 } from 'lucide-react';
import MathRenderer from './MathRenderer';
import { FormulaEntry, Project } from '../types';
import { buildFormulaSearchText, normalizeTagList } from '../services/formulaCollection';

type FormulaSortMode = 'newest' | 'most-used' | 'title';

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
}

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
  onDownloadCheatSheetPdf
}) => {
  const [search, setSearch] = useState('');
  const [tagFilter, setTagFilter] = useState('');
  const [projectFilter, setProjectFilter] = useState<'all' | 'none' | string>('all');
  const [sortMode, setSortMode] = useState<FormulaSortMode>('newest');
  const [selectedFormulaId, setSelectedFormulaId] = useState<string | null>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [editDraft, setEditDraft] = useState<FormulaEntry | null>(null);

  const [newFormulaLatex, setNewFormulaLatex] = useState('');
  const [newFormulaContext, setNewFormulaContext] = useState('');
  const [newFormulaPrompt, setNewFormulaPrompt] = useState('');
  const [isAddingFormula, setIsAddingFormula] = useState(false);
  const [isAskingPrompt, setIsAskingPrompt] = useState(false);
  const [feedbackMessage, setFeedbackMessage] = useState<string | null>(null);

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

  const selectedFormula =
    filteredAndSortedFormulas.find((entry) => entry.id === selectedFormulaId) ??
    filteredAndSortedFormulas[0] ??
    null;

  const topUsed = useMemo(
    () => [...formulas].sort((a, b) => b.usageCount - a.usageCount || b.updatedAt - a.updatedAt).slice(0, 10),
    [formulas]
  );

  useEffect(() => {
    if (!selectedFormula) {
      setSelectedFormulaId(null);
      setIsEditing(false);
      setEditDraft(null);
      return;
    }
    setSelectedFormulaId(selectedFormula.id);
  }, [selectedFormula]);

  useEffect(() => {
    if (!selectedFormula || !isEditing) return;
    setEditDraft(selectedFormula);
  }, [isEditing, selectedFormula]);

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

  const handleSaveEdit = () => {
    if (!editDraft || !selectedFormula) return;
    onUpdateFormula(selectedFormula.id, {
      formula: editDraft.formula,
      title: editDraft.title,
      shortExplanation: editDraft.shortExplanation,
      stepByStepExplanation: editDraft.stepByStepExplanation,
      examples: editDraft.examples,
      purpose: editDraft.purpose,
      tags: normalizeTagList(editDraft.tags),
      projectIds: editDraft.projectIds
    });
    setIsEditing(false);
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
      <div className="grid gap-4 lg:grid-cols-[1.2fr_1fr]">
        <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5 space-y-3">
          <h3 className="text-base font-bold text-slate-800">Formel hinzufuegen</h3>
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
          <div className="border-t border-slate-100 pt-3 space-y-2">
            <textarea
              value={newFormulaPrompt}
              onChange={(e) => setNewFormulaPrompt(e.target.value)}
              rows={2}
              placeholder="Oder frage nach einer Formel (z. B. Wann nutze ich den Satz des Pythagoras?)"
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
          {feedbackMessage && <p className="text-xs text-slate-500">{feedbackMessage}</p>}
        </section>

        <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5 space-y-3">
          <h3 className="text-base font-bold text-slate-800">Cheat-Sheet</h3>
          <p className="text-sm text-slate-600">
            Waehle Formeln aus oder nutze automatisch die meistverwendeten.
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
          <div className="space-y-1 max-h-36 overflow-y-auto pr-1">
            {topUsed.map((entry) => (
              <label key={entry.id} className="flex items-center justify-between gap-2 text-xs rounded-lg border border-slate-100 bg-slate-50 px-2 py-1.5">
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
        </section>
      </div>

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

      <div className="grid gap-4 xl:grid-cols-[1fr_1.2fr]">
        <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5 space-y-2 max-h-[640px] overflow-y-auto">
          <h3 className="text-sm font-semibold text-slate-700">{filteredAndSortedFormulas.length} Formeln</h3>
          {filteredAndSortedFormulas.map((entry) => (
            <button
              key={entry.id}
              onClick={() => {
                setSelectedFormulaId(entry.id);
                setIsEditing(false);
              }}
              className={`w-full rounded-xl border p-3 text-left transition-colors ${
                selectedFormula?.id === entry.id
                  ? 'border-indigo-300 bg-indigo-50'
                  : 'border-slate-200 bg-white hover:bg-slate-50'
              }`}
            >
              <div className="flex items-center justify-between gap-2">
                <p className="text-sm font-semibold text-slate-800 truncate">{entry.title}</p>
                <span className="text-[10px] font-semibold text-slate-500">{entry.usageCount}x</span>
              </div>
              <div className="mt-1 text-xs text-slate-700 overflow-x-auto">
                <MathRenderer content={`$$ ${entry.formula} $$`} />
              </div>
              <div className="mt-2 flex flex-wrap gap-1">
                {entry.tags.slice(0, 3).map((tag) => (
                  <span key={tag} className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] text-slate-600">
                    {tag}
                  </span>
                ))}
              </div>
            </button>
          ))}
          {filteredAndSortedFormulas.length === 0 && (
            <p className="text-sm text-slate-500 rounded-xl border border-dashed border-slate-200 bg-slate-50 p-4">
              Keine Formeln gefunden.
            </p>
          )}
        </section>

        <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
          {!selectedFormula ? (
            <p className="text-sm text-slate-500">Bitte waehle eine Formel aus.</p>
          ) : (
            <div className="space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h3 className="text-lg font-bold text-slate-800">{selectedFormula.title}</h3>
                <div className="flex flex-wrap gap-2">
                  {!isEditing && (
                    <button
                      onClick={() => {
                        setEditDraft(selectedFormula);
                        setIsEditing(true);
                      }}
                      className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                    >
                      <Pencil className="w-3.5 h-3.5" />
                      Bearbeiten
                    </button>
                  )}
                  <button
                    onClick={() => onMarkUsed(selectedFormula.id)}
                    className="rounded-lg bg-indigo-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-indigo-700"
                  >
                    Verwendet
                  </button>
                  {selectedFormula.status === 'failed' && (
                    <button
                      onClick={() => onRetryFormula(selectedFormula.id)}
                      className="rounded-lg border border-red-200 bg-red-50 px-3 py-1.5 text-xs font-semibold text-red-700 hover:bg-red-100"
                    >
                      Retry
                    </button>
                  )}
                  <button
                    onClick={() => onDeleteFormula(selectedFormula.id)}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-red-200 bg-red-50 px-3 py-1.5 text-xs font-semibold text-red-700 hover:bg-red-100"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    Loeschen
                  </button>
                </div>
              </div>

              {!isEditing ? (
                <div className="space-y-3">
                  <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-slate-800 overflow-x-auto">
                    <MathRenderer content={`$$ ${selectedFormula.formula} $$`} />
                  </div>
                  {selectedFormula.shortExplanation && (
                    <p className="text-sm text-slate-700">{selectedFormula.shortExplanation}</p>
                  )}
                  {selectedFormula.stepByStepExplanation && (
                    <div className="rounded-xl border border-slate-200 bg-white p-3 text-sm text-slate-700 whitespace-pre-wrap">
                      {selectedFormula.stepByStepExplanation}
                    </div>
                  )}
                  {selectedFormula.examples.length > 0 && (
                    <div className="rounded-xl border border-slate-200 bg-white p-3">
                      <p className="text-xs font-semibold text-slate-500 mb-2">Beispiele</p>
                      <ul className="list-disc pl-5 text-sm text-slate-700 space-y-1">
                        {selectedFormula.examples.map((example, index) => (
                          <li key={`${selectedFormula.id}-example-${index}`}>{example}</li>
                        ))}
                      </ul>
                    </div>
                  )}
                  {selectedFormula.purpose && (
                    <p className="text-sm text-slate-700">
                      <span className="font-semibold text-slate-800">Verwendungszweck:</span> {selectedFormula.purpose}
                    </p>
                  )}
                  <div className="flex flex-wrap gap-1">
                    {selectedFormula.tags.map((tag) => (
                      <span key={tag} className="rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-600">
                        {tag}
                      </span>
                    ))}
                  </div>
                  <p className="text-xs text-slate-500">
                    Quellen: {selectedFormula.sourceRefs.map((source) => `${source.type} (${source.label})`).join(', ') || 'keine'}
                  </p>
                </div>
              ) : editDraft ? (
                <div className="space-y-3">
                  <input
                    value={editDraft.title}
                    onChange={(e) => setEditDraft({ ...editDraft, title: e.target.value })}
                    className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm"
                  />
                  <textarea
                    value={editDraft.formula}
                    onChange={(e) => setEditDraft({ ...editDraft, formula: e.target.value })}
                    rows={2}
                    className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm resize-none"
                  />
                  <textarea
                    value={editDraft.shortExplanation}
                    onChange={(e) => setEditDraft({ ...editDraft, shortExplanation: e.target.value })}
                    rows={2}
                    className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm resize-none"
                  />
                  <textarea
                    value={editDraft.stepByStepExplanation}
                    onChange={(e) => setEditDraft({ ...editDraft, stepByStepExplanation: e.target.value })}
                    rows={5}
                    className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm resize-none"
                  />
                  <textarea
                    value={editDraft.examples.join('\n')}
                    onChange={(e) =>
                      setEditDraft({
                        ...editDraft,
                        examples: e.target.value
                          .split('\n')
                          .map((line) => line.trim())
                          .filter((line) => line.length > 0)
                      })
                    }
                    rows={4}
                    className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm resize-none"
                  />
                  <input
                    value={editDraft.purpose}
                    onChange={(e) => setEditDraft({ ...editDraft, purpose: e.target.value })}
                    className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm"
                  />
                  <input
                    value={editDraft.tags.join(', ')}
                    onChange={(e) =>
                      setEditDraft({
                        ...editDraft,
                        tags: e.target.value
                          .split(',')
                          .map((tag) => tag.trim())
                          .filter((tag) => tag.length > 0)
                      })
                    }
                    className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm"
                  />
                  <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                    <p className="text-xs font-semibold text-slate-600 mb-2">Projekte</p>
                    <div className="flex flex-wrap gap-2">
                      {projects.map((project) => {
                        const isSelected = editDraft.projectIds.includes(project.id);
                        return (
                          <label key={project.id} className="inline-flex items-center gap-1.5 text-xs text-slate-700">
                            <input
                              type="checkbox"
                              checked={isSelected}
                              onChange={(e) =>
                                setEditDraft({
                                  ...editDraft,
                                  projectIds: e.target.checked
                                    ? [...editDraft.projectIds, project.id]
                                    : editDraft.projectIds.filter((id) => id !== project.id)
                                })
                              }
                            />
                            {project.name}
                          </label>
                        );
                      })}
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={handleSaveEdit}
                      className="inline-flex items-center gap-2 rounded-xl bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700"
                    >
                      <Save className="w-4 h-4" />
                      Speichern
                    </button>
                    <button
                      onClick={() => {
                        setIsEditing(false);
                        setEditDraft(null);
                      }}
                      className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
                    >
                      Abbrechen
                    </button>
                  </div>
                </div>
              ) : null}
            </div>
          )}
        </section>
      </div>
    </div>
  );
};

export default FormulaCollectionView;
