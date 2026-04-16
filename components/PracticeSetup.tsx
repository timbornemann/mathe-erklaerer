import React, { useState } from 'react';
import { Plus, X, Send, Loader2 } from 'lucide-react';
import { PracticeRoom } from '../types';

const DIFFICULTY_OPTIONS = [
  { value: 'Leicht', label: 'Leicht' },
  { value: 'Mittel', label: 'Mittel' },
  { value: 'Schwer', label: 'Schwer' },
  { value: 'Sehr Schwer', label: 'Sehr Schwer' },
  { value: 'custom', label: 'Eigene Beschreibung …' },
];

interface PracticeSetupProps {
  onStart: (topic: string, difficulty: string, exampleTasks: string[]) => void;
  isLoading: boolean;
  existingRoom?: PracticeRoom | null;
}

const PracticeSetup: React.FC<PracticeSetupProps> = ({ onStart, isLoading, existingRoom }) => {
  const [topic, setTopic] = useState(existingRoom?.topic || '');
  const [difficultyPreset, setDifficultyPreset] = useState(() => {
    if (!existingRoom) return 'Mittel';
    const match = DIFFICULTY_OPTIONS.find(o => o.value === existingRoom.difficulty);
    return match ? match.value : 'custom';
  });
  const [customDifficulty, setCustomDifficulty] = useState(() => {
    if (!existingRoom) return '';
    const match = DIFFICULTY_OPTIONS.find(o => o.value === existingRoom.difficulty);
    return match ? '' : existingRoom.difficulty;
  });
  const [exampleTasks, setExampleTasks] = useState<string[]>(
    existingRoom?.exampleTasks?.length ? [...existingRoom.exampleTasks] : ['']
  );

  const difficulty = difficultyPreset === 'custom' ? customDifficulty : difficultyPreset;

  const addExampleTask = () => {
    setExampleTasks(prev => [...prev, '']);
  };

  const removeExampleTask = (index: number) => {
    setExampleTasks(prev => prev.filter((_, i) => i !== index));
  };

  const updateExampleTask = (index: number, value: string) => {
    setExampleTasks(prev => prev.map((t, i) => (i === index ? value : t)));
  };

  const handleSubmit = () => {
    if (!topic.trim() || !difficulty.trim()) return;
    const filtered = exampleTasks.filter(t => t.trim() !== '');
    onStart(topic.trim(), difficulty.trim(), filtered);
  };

  const canSubmit = topic.trim() && difficulty.trim() && !isLoading;

  return (
    <div className="space-y-5">
      <div>
        <label className="block text-sm font-semibold text-slate-700 mb-1.5">
          Thema / Aufgabenart
        </label>
        <textarea
          value={topic}
          onChange={e => setTopic(e.target.value)}
          placeholder="z. B. Quadratische Gleichungen, Bruchrechnung, Integrale berechnen …"
          className="w-full h-24 p-4 bg-slate-50 rounded-2xl border border-slate-200 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200 focus:bg-white transition-all resize-none text-slate-700 text-base placeholder:text-slate-400"
        />
      </div>

      <div>
        <label className="block text-sm font-semibold text-slate-700 mb-1.5">
          Schwierigkeit
        </label>
        <select
          value={difficultyPreset}
          onChange={e => setDifficultyPreset(e.target.value)}
          className="w-full p-3 bg-slate-50 rounded-xl border border-slate-200 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200 focus:bg-white transition-all text-slate-700 text-base"
        >
          {DIFFICULTY_OPTIONS.map(opt => (
            <option key={opt.value} value={opt.value}>{opt.label}</option>
          ))}
        </select>
        {difficultyPreset === 'custom' && (
          <input
            type="text"
            value={customDifficulty}
            onChange={e => setCustomDifficulty(e.target.value)}
            placeholder="z. B. Klasse 10 Gymnasium, Abitur-Niveau, Grundschule …"
            className="w-full mt-2 p-3 bg-slate-50 rounded-xl border border-slate-200 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200 focus:bg-white transition-all text-slate-700 text-base placeholder:text-slate-400"
          />
        )}
      </div>

      <div>
        <label className="block text-sm font-semibold text-slate-700 mb-1.5">
          Beispielaufgaben <span className="font-normal text-slate-400">(optional)</span>
        </label>
        <p className="text-xs text-slate-400 mb-3">
          Gib Beispielaufgaben ein, damit die KI den Stil und Umfang kennt.
        </p>
        <div className="space-y-2">
          {exampleTasks.map((task, index) => (
            <div key={index} className="flex items-start gap-2">
              <span className="mt-3 text-xs font-mono text-slate-400 w-5 text-right flex-shrink-0">
                {index + 1}.
              </span>
              <textarea
                value={task}
                onChange={e => updateExampleTask(index, e.target.value)}
                placeholder="z. B. Löse x² + 5x + 6 = 0"
                rows={2}
                className="flex-1 p-3 bg-slate-50 rounded-xl border border-slate-200 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200 focus:bg-white transition-all resize-none text-slate-700 text-sm placeholder:text-slate-400"
              />
              {exampleTasks.length > 1 && (
                <button
                  onClick={() => removeExampleTask(index)}
                  className="mt-2 p-1.5 text-slate-300 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors"
                  title="Beispiel entfernen"
                >
                  <X className="w-4 h-4" />
                </button>
              )}
            </div>
          ))}
        </div>
        <button
          onClick={addExampleTask}
          className="mt-3 flex items-center gap-1.5 text-sm font-medium text-indigo-600 hover:text-indigo-700 px-3 py-2 rounded-lg hover:bg-indigo-50 transition-colors"
        >
          <Plus className="w-4 h-4" />
          Beispielaufgabe hinzufügen
        </button>
      </div>

      <div className="flex justify-end pt-2">
        <button
          onClick={handleSubmit}
          disabled={!canSubmit}
          className="w-full sm:w-auto justify-center bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed text-white px-6 sm:px-8 py-3.5 rounded-xl font-bold text-base sm:text-lg shadow-lg shadow-indigo-200 flex items-center space-x-2 transition-all active:scale-95"
        >
          {isLoading ? (
            <>
              <Loader2 className="w-5 h-5 animate-spin" />
              <span>Erstelle Aufgabe …</span>
            </>
          ) : (
            <>
              <Send className="w-5 h-5" />
              <span>Aufgabe generieren</span>
            </>
          )}
        </button>
      </div>
    </div>
  );
};

export default PracticeSetup;
