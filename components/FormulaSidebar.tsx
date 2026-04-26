import React, { useMemo, useState } from 'react';
import { BookOpenText, Loader2, Plus, Search, X } from 'lucide-react';
import { FormulaEntry } from '../types';
import MathRenderer from './MathRenderer';
import { buildFormulaSearchText } from '../services/formulaCollection';

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
}

const statusBadgeClass = (status: FormulaEntry['status']): string => {
  if (status === 'ready') return 'bg-emerald-50 text-emerald-700 border-emerald-200';
  if (status === 'failed') return 'bg-red-50 text-red-700 border-red-200';
  return 'bg-amber-50 text-amber-700 border-amber-200';
};

const statusLabel = (status: FormulaEntry['status']): string => {
  if (status === 'ready') return 'Fertig';
  if (status === 'failed') return 'Fehlgeschlagen';
  return 'Wird erstellt';
};

const FormulaSidebar: React.FC<FormulaSidebarProps> = ({
  formulas,
  isOpen,
  onToggle,
  onMarkUsed,
  onRetryFormula,
  onAddFormulaLatex,
  onAskFormulaPrompt,
  readOnly = false,
  title = 'Formelsammlung'
}) => {
  const [search, setSearch] = useState('');
  const [selectedFormulaId, setSelectedFormulaId] = useState<string | null>(null);
  const [newFormulaLatex, setNewFormulaLatex] = useState('');
  const [newFormulaQuestion, setNewFormulaQuestion] = useState('');
  const [isAddingFormula, setIsAddingFormula] = useState(false);
  const [isAskingQuestion, setIsAskingQuestion] = useState(false);
  const [inlineMessage, setInlineMessage] = useState<string | null>(null);

  const filteredFormulas = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return formulas;
    return formulas.filter((formula) => buildFormulaSearchText(formula).includes(query));
  }, [formulas, search]);

  const selectedFormula =
    filteredFormulas.find((entry) => entry.id === selectedFormulaId) ??
    filteredFormulas[0] ??
    null;

  const handleAddFormula = async () => {
    if (readOnly || !onAddFormulaLatex) return;
    const formula = newFormulaLatex.trim();
    if (!formula || isAddingFormula) return;
    setIsAddingFormula(true);
    setInlineMessage(null);
    try {
      await onAddFormulaLatex(formula);
      setNewFormulaLatex('');
      setInlineMessage('Formel hinzugefuegt.');
    } catch (error: any) {
      setInlineMessage(error?.message || 'Formel konnte nicht hinzugefuegt werden.');
    } finally {
      setIsAddingFormula(false);
    }
  };

  const handleAskFormula = async () => {
    if (readOnly || !onAskFormulaPrompt) return;
    const prompt = newFormulaQuestion.trim();
    if (!prompt || isAskingQuestion) return;
    setIsAskingQuestion(true);
    setInlineMessage(null);
    try {
      await onAskFormulaPrompt(prompt);
      setNewFormulaQuestion('');
      setInlineMessage('Formelkarte erstellt.');
    } catch (error: any) {
      setInlineMessage(error?.message || 'Formel konnte nicht erstellt werden.');
    } finally {
      setIsAskingQuestion(false);
    }
  };

  if (!isOpen) {
    return (
      <button
        onClick={onToggle}
        className="fixed bottom-4 left-4 sm:bottom-6 sm:left-6 z-50 bg-emerald-600 hover:bg-emerald-700 text-white p-3.5 sm:p-4 rounded-full shadow-xl transition-all hover:scale-110 active:scale-95 group"
        title="Formelsammlung oeffnen"
      >
        <BookOpenText className="w-6 h-6" />
        <span className="absolute left-full ml-3 top-1/2 -translate-y-1/2 bg-slate-800 text-white text-xs px-2 py-1 rounded opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap pointer-events-none">
          Formelsammlung
        </span>
      </button>
    );
  }

  return (
    <div className="fixed left-0 top-0 h-full w-full md:w-[430px] bg-white shadow-2xl z-40 border-r border-slate-200 flex flex-col pb-[env(safe-area-inset-bottom)]">
      <div className="p-3 sm:p-4 bg-emerald-600 text-white flex justify-between items-center shadow-md">
        <div className="flex items-center gap-2">
          <BookOpenText className="w-5 h-5" />
          <div>
            <h3 className="font-bold">{title}</h3>
            <p className="text-xs text-emerald-100">{filteredFormulas.length} Formeln sichtbar</p>
          </div>
        </div>
        <button onClick={onToggle} className="p-2 hover:bg-emerald-500 rounded-full transition-colors">
          <X className="w-5 h-5" />
        </button>
      </div>

      <div className="p-3 sm:p-4 border-b border-slate-200 bg-slate-50 space-y-3">
        <div className="relative">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Formeln durchsuchen..."
            className="w-full pl-9 pr-3 py-2.5 rounded-xl border border-slate-200 bg-white text-sm focus:border-emerald-500 focus:ring-1 focus:ring-emerald-200"
          />
        </div>

        {!readOnly && (
          <div className="space-y-2">
            <textarea
              value={newFormulaLatex}
              onChange={(e) => setNewFormulaLatex(e.target.value)}
              placeholder="Formel eintragen (LaTeX, z. B. x = \\frac{-b \\pm \\sqrt{b^2-4ac}}{2a})"
              rows={2}
              className="w-full rounded-xl border border-slate-200 bg-white p-2.5 text-sm focus:border-emerald-500 focus:ring-1 focus:ring-emerald-200 resize-none"
            />
            <button
              onClick={handleAddFormula}
              disabled={!newFormulaLatex.trim() || isAddingFormula}
              className="w-full inline-flex items-center justify-center gap-2 rounded-xl bg-emerald-600 px-3 py-2 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-50"
            >
              {isAddingFormula ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
              Formel hinzufuegen
            </button>

            <textarea
              value={newFormulaQuestion}
              onChange={(e) => setNewFormulaQuestion(e.target.value)}
              placeholder="Nach Formel fragen (z. B. Wie berechne ich den Kreisumfang?)"
              rows={2}
              className="w-full rounded-xl border border-slate-200 bg-white p-2.5 text-sm focus:border-emerald-500 focus:ring-1 focus:ring-emerald-200 resize-none"
            />
            <button
              onClick={handleAskFormula}
              disabled={!newFormulaQuestion.trim() || isAskingQuestion}
              className="w-full inline-flex items-center justify-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm font-semibold text-emerald-700 hover:bg-emerald-100 disabled:opacity-50"
            >
              {isAskingQuestion ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
              Formel per KI erstellen
            </button>
          </div>
        )}

        {inlineMessage && <p className="text-xs text-slate-500">{inlineMessage}</p>}
      </div>

      <div className="flex-1 overflow-y-auto p-3 sm:p-4 space-y-3">
        {filteredFormulas.length === 0 ? (
          <p className="text-sm text-slate-500 bg-slate-50 border border-slate-200 rounded-xl p-3">
            Keine Formeln gefunden.
          </p>
        ) : (
          <>
            {filteredFormulas.map((formula) => (
              <button
                key={formula.id}
                onClick={() => setSelectedFormulaId(formula.id)}
                className={`w-full text-left rounded-xl border p-3 transition-colors ${
                  selectedFormula?.id === formula.id
                    ? 'border-emerald-300 bg-emerald-50'
                    : 'border-slate-200 bg-white hover:bg-slate-50'
                }`}
              >
                <div className="flex items-center justify-between gap-2 mb-2">
                  <p className="text-sm font-semibold text-slate-800 truncate">{formula.title}</p>
                  <span className={`text-[10px] px-2 py-0.5 rounded-full border font-semibold ${statusBadgeClass(formula.status)}`}>
                    {statusLabel(formula.status)}
                  </span>
                </div>
                <div className="text-xs text-slate-600 overflow-x-auto">
                  <MathRenderer content={`$$ ${formula.formula} $$`} />
                </div>
                <div className="mt-2 flex items-center justify-between text-[11px] text-slate-500">
                  <span>{formula.tags.slice(0, 2).join(', ') || 'ohne tags'}</span>
                  <span>{formula.usageCount}x verwendet</span>
                </div>
              </button>
            ))}

            {selectedFormula && (
              <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 space-y-2">
                <div className="flex items-start justify-between gap-2">
                  <h4 className="text-sm font-bold text-slate-800">{selectedFormula.title}</h4>
                  <span className={`text-[10px] px-2 py-0.5 rounded-full border font-semibold ${statusBadgeClass(selectedFormula.status)}`}>
                    {statusLabel(selectedFormula.status)}
                  </span>
                </div>
                <div className="text-xs text-slate-700">
                  <MathRenderer content={`$$ ${selectedFormula.formula} $$`} />
                </div>
                {selectedFormula.shortExplanation && (
                  <p className="text-xs text-slate-600">{selectedFormula.shortExplanation}</p>
                )}
                {selectedFormula.purpose && (
                  <p className="text-xs text-slate-600">
                    <span className="font-semibold text-slate-700">Verwendung:</span> {selectedFormula.purpose}
                  </p>
                )}
                <div className="flex flex-wrap gap-1">
                  {selectedFormula.tags.map((tag) => (
                    <span key={tag} className="px-2 py-0.5 rounded-full bg-white border border-slate-200 text-[10px] text-slate-600">
                      {tag}
                    </span>
                  ))}
                </div>
                <div className="flex gap-2 pt-1">
                  <button
                    onClick={() => onMarkUsed(selectedFormula.id)}
                    className="flex-1 rounded-lg bg-emerald-600 px-2 py-1.5 text-xs font-semibold text-white hover:bg-emerald-700"
                  >
                    Verwendet
                  </button>
                  {!readOnly && selectedFormula.status === 'failed' && (
                    <button
                      onClick={() => onRetryFormula(selectedFormula.id)}
                      className="rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-100"
                    >
                      Retry
                    </button>
                  )}
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
};

export default FormulaSidebar;
