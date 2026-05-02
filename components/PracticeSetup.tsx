import React, { useState } from 'react';
import { Plus, X, Send, Loader2 } from 'lucide-react';
import { PracticeRoom } from '../types';
import { SHARED_DIFFICULTY_OPTIONS } from '../constants/difficultyOptions';

interface PracticeSetupProps {
  onStart: (topic: string, difficulty: string, exampleTasks: string[], taskCount: number) => void;
  isLoading: boolean;
  existingRoom?: PracticeRoom | null;
}

const PracticeSetup: React.FC<PracticeSetupProps> = ({ onStart, isLoading, existingRoom }) => {
  const [topic, setTopic] = useState(existingRoom?.topic || '');
  const [difficultyPreset, setDifficultyPreset] = useState(() => {
    if (!existingRoom) return 'Mittel';
    const match = SHARED_DIFFICULTY_OPTIONS.find((option) => option.value === existingRoom.difficulty);
    return match ? match.value : 'custom';
  });
  const [customDifficulty, setCustomDifficulty] = useState(() => {
    if (!existingRoom) return '';
    const match = SHARED_DIFFICULTY_OPTIONS.find((option) => option.value === existingRoom.difficulty);
    return match ? '' : existingRoom.difficulty;
  });
  const [taskBatchCount, setTaskBatchCount] = useState(3);
  const [exampleTasks, setExampleTasks] = useState<string[]>(
    existingRoom?.exampleTasks?.length ? [...existingRoom.exampleTasks] : ['']
  );

  const difficulty = difficultyPreset === 'custom' ? customDifficulty : difficultyPreset;

  const addExampleTask = () => {
    setExampleTasks((prev) => [...prev, '']);
  };

  const removeExampleTask = (index: number) => {
    setExampleTasks((prev) => prev.filter((_, i) => i !== index));
  };

  const updateExampleTask = (index: number, value: string) => {
    setExampleTasks((prev) => prev.map((task, i) => (i === index ? value : task)));
  };

  const handleSubmit = () => {
    if (!topic.trim() || !difficulty.trim()) return;
    const filteredExamples = exampleTasks.filter((task) => task.trim() !== '');
    onStart(topic.trim(), difficulty.trim(), filteredExamples, taskBatchCount);
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
          onChange={(event) => setTopic(event.target.value)}
          placeholder="z. B. Quadratische Gleichungen, Bruchrechnung, Integrale berechnen ..."
          className="w-full h-24 p-4 bg-slate-50 rounded-2xl border border-slate-200 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200 focus:bg-white transition-all resize-none text-slate-700 text-base placeholder:text-slate-400"
        />
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <div className="sm:col-span-2">
          <label className="block text-sm font-semibold text-slate-700 mb-1.5">
            Schwierigkeit
          </label>
          <select
            value={difficultyPreset}
            onChange={(event) => setDifficultyPreset(event.target.value)}
            className="w-full p-3 bg-slate-50 rounded-xl border border-slate-200 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200 focus:bg-white transition-all text-slate-700 text-base"
          >
            {SHARED_DIFFICULTY_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
          {difficultyPreset === 'custom' && (
            <input
              type="text"
              value={customDifficulty}
              onChange={(event) => setCustomDifficulty(event.target.value)}
              placeholder="z. B. Klasse 10 Gymnasium, Abitur-Niveau ..."
              className="w-full mt-2 p-3 bg-slate-50 rounded-xl border border-slate-200 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200 focus:bg-white transition-all text-slate-700 text-base placeholder:text-slate-400"
            />
          )}
        </div>

        <div>
          <label className="block text-sm font-semibold text-slate-700 mb-1.5">
            Aufgaben im Lernraum
          </label>
          <select
            value={taskBatchCount}
            onChange={(event) => setTaskBatchCount(Number(event.target.value))}
            className="w-full p-3 bg-slate-50 rounded-xl border border-slate-200 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200 focus:bg-white transition-all text-slate-700 text-base"
          >
            {Array.from({ length: 10 }, (_, index) => index + 1).map((count) => (
              <option key={count} value={count}>
                {count}
              </option>
            ))}
          </select>
        </div>
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
                onChange={(event) => updateExampleTask(index, event.target.value)}
                placeholder="z. B. Loese x^2 + 5x + 6 = 0"
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
          Beispielaufgabe hinzufuegen
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
              <span>Erstelle Aufgabenpaket ...</span>
            </>
          ) : (
            <>
              <Send className="w-5 h-5" />
              <span>{taskBatchCount > 1 ? 'Aufgabenpaket generieren' : 'Aufgabe generieren'}</span>
            </>
          )}
        </button>
      </div>
    </div>
  );
};

export default PracticeSetup;
