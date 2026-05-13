import React, { useEffect, useMemo, useState } from 'react';
import { Loader2, X } from 'lucide-react';
import MathRenderer from './MathRenderer';
import { FormulaExtractionCandidate } from '../types';

interface FormulaSelectionModalProps {
  isOpen: boolean;
  sourceLabel: string;
  candidates: FormulaExtractionCandidate[];
  onClose: () => void;
  onConfirm: (selectedCandidateIds: string[]) => Promise<void> | void;
}

const FormulaSelectionModal: React.FC<FormulaSelectionModalProps> = ({
  isOpen,
  sourceLabel,
  candidates,
  onClose,
  onConfirm
}) => {
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (!isOpen) return;
    setSelectedIds([]);
    setIsSubmitting(false);
  }, [isOpen, candidates]);

  const selectedIdSet = useMemo(() => new Set(selectedIds), [selectedIds]);

  const toggleSelection = (candidateId: string) => {
    setSelectedIds((prev) =>
      prev.includes(candidateId)
        ? prev.filter((id) => id !== candidateId)
        : [...prev, candidateId]
    );
  };

  const handleConfirm = async () => {
    if (selectedIds.length === 0 || isSubmitting) return;
    setIsSubmitting(true);
    try {
      await onConfirm(selectedIds);
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/55 p-4">
      <div className="w-full max-w-3xl rounded-2xl border border-slate-200 bg-white p-4 shadow-2xl sm:p-5">
        <div className="mb-3 flex items-start justify-between gap-3">
          <div>
            <h3 className="text-base font-bold text-slate-800">Formeln aus Nachricht auswaehlen</h3>
            <p className="text-xs text-slate-500">
              Quelle: {sourceLabel}
            </p>
            <p className="mt-1 text-xs text-slate-500">
              Waehle nur die Eintraege aus, die wirklich in deine Formelsammlung uebernommen werden sollen.
            </p>
          </div>
          <button
            onClick={onClose}
            className="rounded-lg border border-slate-200 p-1.5 text-slate-500 hover:bg-slate-100 transition-colors"
            title="Schliessen"
            disabled={isSubmitting}
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="max-h-[52vh] space-y-2 overflow-y-auto rounded-xl border border-slate-200 bg-slate-50 p-2.5">
          {candidates.length === 0 ? (
            <div className="rounded-lg border border-dashed border-slate-300 bg-white px-3 py-4 text-sm text-slate-500">
              Keine passenden Formel-Kandidaten gefunden.
            </div>
          ) : (
            candidates.map((candidate) => (
              <label
                key={candidate.id}
                className="flex cursor-pointer items-start gap-3 rounded-xl border border-slate-200 bg-white p-3 hover:border-indigo-300"
              >
                <input
                  type="checkbox"
                  className="mt-1 h-4 w-4 accent-indigo-600"
                  checked={selectedIdSet.has(candidate.id)}
                  onChange={() => toggleSelection(candidate.id)}
                  disabled={isSubmitting}
                />
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold text-slate-800">{candidate.title}</p>
                  <div className="mt-1 overflow-x-auto text-sm text-slate-700">
                    <MathRenderer content={`$$ ${candidate.formula} $$`} />
                  </div>
                  <p className="mt-1 break-all rounded bg-slate-100 px-2 py-1 font-mono text-[11px] text-slate-500">
                    {candidate.formula}
                  </p>
                </div>
              </label>
            ))
          )}
        </div>

        <div className="mt-4 flex flex-wrap items-center justify-between gap-2">
          <p className="text-xs text-slate-500">
            {selectedIds.length} von {candidates.length} ausgewaehlt
          </p>
          <div className="flex items-center gap-2">
            <button
              onClick={onClose}
              className="rounded-lg border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 transition-colors"
              disabled={isSubmitting}
            >
              Ohne Auswahl schliessen
            </button>
            <button
              onClick={() => {
                void handleConfirm();
              }}
              className="inline-flex items-center gap-1.5 rounded-lg bg-indigo-600 px-3 py-2 text-xs font-semibold text-white hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-60"
              disabled={selectedIds.length === 0 || isSubmitting}
            >
              {isSubmitting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
              Ausgewaehlte Formeln erstellen
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default FormulaSelectionModal;
