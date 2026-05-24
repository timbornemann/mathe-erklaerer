import React, { useState, useEffect, useCallback } from 'react';
import { Settings, Save, X, Download, Upload } from 'lucide-react';
import {
  getDefaultGeminiModelId,
  getSelectedGeminiModelId,
  listSelectableGeminiModels,
  SelectableGeminiModel
} from '../services/gemini';

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  onExport: () => void;
  onImportClick: () => void;
}

const SettingsModal: React.FC<SettingsModalProps> = ({
  isOpen,
  onClose,
  onExport,
  onImportClick
}) => {
  const [apiKey, setApiKey] = useState('');
  const [selectedModelId, setSelectedModelId] = useState(getDefaultGeminiModelId());
  const [availableModels, setAvailableModels] = useState<SelectableGeminiModel[]>([]);
  const [isLoadingModels, setIsLoadingModels] = useState(false);
  const [modelsError, setModelsError] = useState('');
  const [isSaved, setIsSaved] = useState(false);
  const runtimeKey = typeof window !== 'undefined' ? (window as any).__APP_CONFIG__?.GEMINI_API_KEY : '';

  const loadModels = useCallback(async (apiKeyOverride?: string) => {
    setIsLoadingModels(true);
    setModelsError('');
    try {
      const models = await listSelectableGeminiModels(apiKeyOverride);
      setAvailableModels(models);
      setSelectedModelId((previousModelId) => {
        if (models.some((model) => model.id === previousModelId)) {
          return previousModelId;
        }
        const savedModelId = getSelectedGeminiModelId();
        if (models.some((model) => model.id === savedModelId)) {
          return savedModelId;
        }
        return models[0]?.id || getDefaultGeminiModelId();
      });
    } catch (error: any) {
      setAvailableModels([]);
      setModelsError(error?.message || 'Modelle konnten nicht geladen werden.');
    } finally {
      setIsLoadingModels(false);
    }
  }, []);

  useEffect(() => {
    if (isOpen) {
      const savedKey = localStorage.getItem('GEMINI_API_KEY');
      if (savedKey) {
        setApiKey(savedKey);
      } else {
        setApiKey('');
      }
      setSelectedModelId(getSelectedGeminiModelId());
      void loadModels(savedKey || runtimeKey || undefined);
    }
  }, [isOpen, runtimeKey, loadModels]);

  const handleSave = () => {
    localStorage.setItem('GEMINI_MODEL_ID', selectedModelId || getDefaultGeminiModelId());

    if (apiKey.trim()) {
      localStorage.setItem('GEMINI_API_KEY', apiKey.trim());
      setIsSaved(true);
      setTimeout(() => {
        setIsSaved(false);
        onClose();
      }, 1500);
    } else {
      localStorage.removeItem('GEMINI_API_KEY');
      onClose();
    }
    window.location.reload();
  };

  const handleOverlayClick = (e: React.MouseEvent) => {
    if (e.target === e.currentTarget) onClose();
  };

  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    },
    [onClose]
  );

  useEffect(() => {
    if (isOpen) {
      document.addEventListener('keydown', handleKeyDown);
      return () => document.removeEventListener('keydown', handleKeyDown);
    }
  }, [isOpen, handleKeyDown]);

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 animate-in fade-in duration-200"
      onClick={handleOverlayClick}
    >
      <div
        className="w-full max-w-md bg-white rounded-2xl shadow-2xl border border-slate-100 overflow-hidden animate-in zoom-in-95 duration-200"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between p-4 border-b border-slate-100">
          <h2 className="font-bold text-slate-800 flex items-center gap-2 text-lg">
            <Settings className="w-5 h-5 text-indigo-500" />
            Einstellungen
          </h2>
          <button
            onClick={onClose}
            className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-full transition-colors"
            title="Schließen"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-4 space-y-6">
          {/* Model Block */}
          <section>
            <h3 className="text-sm font-semibold text-slate-700 mb-2">KI Modell</h3>
            <p className="text-xs text-slate-500 mb-3 leading-relaxed">
              Das ausgewaehlte Modell wird fuer alle KI-Anfragen mit Text- und Bildverarbeitung verwendet.
            </p>
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => void loadModels(apiKey.trim() || runtimeKey || undefined)}
                  className="px-3 py-2 rounded-xl text-xs font-medium border border-slate-200 bg-white text-slate-600 hover:border-indigo-300 hover:text-indigo-700 hover:bg-indigo-50 transition-colors"
                >
                  Modelle aktualisieren
                </button>
                {isLoadingModels && <span className="text-xs text-slate-500">Lade Modelle...</span>}
              </div>

              <select
                value={selectedModelId}
                onChange={(e) => setSelectedModelId(e.target.value)}
                className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-indigo-200 focus:border-indigo-500 transition-all outline-none"
                disabled={isLoadingModels || availableModels.length === 0}
              >
                {availableModels.length === 0 ? (
                  <option value={selectedModelId}>Keine Modelle geladen</option>
                ) : (
                  availableModels.map((model) => (
                    <option key={model.id} value={model.id}>
                      {model.displayName} ({model.id})
                    </option>
                  ))
                )}
              </select>

              {modelsError && (
                <p className="text-[11px] text-rose-600 leading-relaxed">{modelsError}</p>
              )}
              {!modelsError && availableModels.length > 0 && (
                <p className="text-[11px] text-slate-500 leading-relaxed">
                  Gefundene multimodale Modelle: {availableModels.length}
                </p>
              )}
            </div>
          </section>

          <hr className="border-slate-100" />

          {/* API Key Block */}
          <section>
            <h3 className="text-sm font-semibold text-slate-700 mb-2">API Key</h3>
            <p className="text-xs text-slate-500 mb-3 leading-relaxed">
              Gib deinen Google Gemini API Key ein. Er wird lokal gespeichert und überschreibt optional den Container-Key.
            </p>
            {runtimeKey && (
              <p className="text-[11px] text-emerald-600 mb-3 leading-relaxed">
                Container-Key aktiv: Die App funktioniert auch ohne lokalen Browser-Key.
              </p>
            )}
            <div className="space-y-3">
              <input
                type="password"
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                placeholder="AIzaSy..."
                className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-indigo-200 focus:border-indigo-500 transition-all outline-none"
              />
              <button
                onClick={handleSave}
                className={`w-full py-2.5 rounded-xl text-sm font-bold flex items-center justify-center gap-2 transition-all ${
                  isSaved
                    ? 'bg-green-500 text-white'
                    : 'bg-indigo-600 hover:bg-indigo-700 text-white shadow-md shadow-indigo-100'
                }`}
              >
                <Save className="w-4 h-4" />
                {isSaved ? 'Gespeichert!' : 'Einstellungen speichern'}
              </button>
              <p className="text-[10px] text-center text-slate-400 italic">
                Kein Key? Hol dir einen auf{' '}
                <a
                  href="https://aistudio.google.com/"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-indigo-500 underline"
                >
                  aistudio.google.com
                </a>
              </p>
            </div>
          </section>

          <hr className="border-slate-100" />

          {/* Daten Export/Import Block */}
          <section>
            <h3 className="text-sm font-semibold text-slate-700 mb-2">Daten</h3>
            <p className="text-xs text-slate-500 mb-3 leading-relaxed">
              Verlauf, Projekte, Lernraeume und Pruefungen als JSON sichern oder von einem anderen Geraet uebernehmen.
            </p>
            <div className="flex flex-wrap gap-2">
              <button
                onClick={() => {
                  onExport();
                  onClose();
                }}
                className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium border border-slate-200 bg-white text-slate-600 hover:border-indigo-300 hover:text-indigo-700 hover:bg-indigo-50 transition-colors"
              >
                <Download className="w-4 h-4" />
                Daten exportieren
              </button>
              <button
                onClick={() => {
                  onImportClick();
                  onClose();
                }}
                className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium border border-slate-200 bg-white text-slate-600 hover:border-indigo-300 hover:text-indigo-700 hover:bg-indigo-50 transition-colors"
              >
                <Upload className="w-4 h-4" />
                Daten importieren
              </button>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
};

export default SettingsModal;

