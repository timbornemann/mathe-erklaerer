import React, { useState } from 'react';
import { BookOpen, Loader2, Plus, Send, X } from 'lucide-react';

const DIFFICULTY_OPTIONS = [
  { value: 'Schwer', label: 'Schwer' },
  { value: 'Sehr Schwer', label: 'Sehr Schwer' },
  { value: 'Abitur', label: 'Abitur-Niveau' },
  { value: 'custom', label: 'Eigene Beschreibung ...' }
];

const DURATION_OPTIONS = [10, 15, 20, 30, 45, 60];

export interface ExamConfig {
  topic: string;
  difficulty: string;
  taskCount: number;
  durationMinutes: number;
  exampleTasks: string[];
}

interface ExamSetupProps {
  isLoading: boolean;
  onStart: (config: ExamConfig) => void;
}

const ExamSetup: React.FC<ExamSetupProps> = ({ isLoading, onStart }) => {
  const [topic, setTopic] = useState('');
  const [difficultyPreset, setDifficultyPreset] = useState('Sehr Schwer');
  const [customDifficulty, setCustomDifficulty] = useState('');
  const [taskCount, setTaskCount] = useState(5);
  const [durationMinutes, setDurationMinutes] = useState(30);
  const [exampleTasks, setExampleTasks] = useState<string[]>(['']);

  const difficulty = difficultyPreset === 'custom' ? customDifficulty : difficultyPreset;

  const canSubmit = topic.trim() && difficulty.trim() && taskCount >= 5 && taskCount <= 10 && !isLoading;

  const updateExampleTask = (index: number, value: string) => {
    setExampleTasks(prev => prev.map((item, i) => (i === index ? value : item)));
  };

  const addExampleTask = () => {
    setExampleTasks(prev => [...prev, '']);
  };

  const removeExampleTask = (index: number) => {
    setExampleTasks(prev => prev.filter((_, i) => i !== index));
  };

  const handleStart = () => {
    if (!canSubmit) return;
    onStart({
      topic: topic.trim(),
      difficulty: difficulty.trim(),
      taskCount,
      durationMinutes,
      exampleTasks: exampleTasks.filter(item => item.trim())
    });
  };

  return (
    <div className="space-y-5">
      <div className="rounded-2xl border border-rose-100 bg-rose-50/70 p-4 text-sm leading-relaxed text-rose-900">
        <div className="flex items-start gap-2">
          <BookOpen className="w-5 h-5 mt-0.5 flex-shrink-0 text-rose-600" />
          <span>
            Prüfungsmodus simuliert eine Klausur: Du bekommst mehrere Aufgaben, löst sie unter Zeitdruck
            und siehst Bewertung und Lösungen erst bei Abgabe oder Zeitablauf.
          </span>
        </div>
      </div>

      <div>
        <label className="block text-sm font-semibold text-slate-700 mb-1.5">Thema</label>
        <textarea
          value={topic}
          onChange={e => setTopic(e.target.value)}
          placeholder="z. B. Lineare Algebra, Analysis, Stochastik ..."
          className="w-full h-24 p-4 bg-slate-50 rounded-2xl border border-slate-200 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200 focus:bg-white transition-all resize-none text-slate-700 text-base placeholder:text-slate-400"
        />
      </div>

      <div className="grid sm:grid-cols-3 gap-3">
        <div className="sm:col-span-2">
          <label className="block text-sm font-semibold text-slate-700 mb-1.5">Schwierigkeit</label>
          <select
            value={difficultyPreset}
            onChange={e => setDifficultyPreset(e.target.value)}
            className="w-full p-3 bg-slate-50 rounded-xl border border-slate-200 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200 focus:bg-white transition-all text-slate-700 text-base"
          >
            {DIFFICULTY_OPTIONS.map(option => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
          {difficultyPreset === 'custom' && (
            <input
              type="text"
              value={customDifficulty}
              onChange={e => setCustomDifficulty(e.target.value)}
              placeholder="z. B. 2. Semester Maschinenbau ..."
              className="w-full mt-2 p-3 bg-slate-50 rounded-xl border border-slate-200 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200 focus:bg-white transition-all text-slate-700 text-base placeholder:text-slate-400"
            />
          )}
        </div>

        <div>
          <label className="block text-sm font-semibold text-slate-700 mb-1.5">Aufgaben</label>
          <select
            value={taskCount}
            onChange={e => setTaskCount(Number(e.target.value))}
            className="w-full p-3 bg-slate-50 rounded-xl border border-slate-200 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200 focus:bg-white transition-all text-slate-700 text-base"
          >
            {[5, 6, 7, 8, 9, 10].map(count => (
              <option key={count} value={count}>
                {count}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div>
        <label className="block text-sm font-semibold text-slate-700 mb-1.5">Zeitlimit</label>
        <select
          value={durationMinutes}
          onChange={e => setDurationMinutes(Number(e.target.value))}
          className="w-full p-3 bg-slate-50 rounded-xl border border-slate-200 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200 focus:bg-white transition-all text-slate-700 text-base"
        >
          {DURATION_OPTIONS.map(minutes => (
            <option key={minutes} value={minutes}>
              {minutes} Minuten
            </option>
          ))}
        </select>
      </div>

      <div>
        <label className="block text-sm font-semibold text-slate-700 mb-1.5">
          Beispielaufgaben <span className="font-normal text-slate-400">(optional)</span>
        </label>
        <div className="space-y-2">
          {exampleTasks.map((task, index) => (
            <div key={index} className="flex items-start gap-2">
              <textarea
                value={task}
                onChange={e => updateExampleTask(index, e.target.value)}
                placeholder="z. B. Berechne die Eigenwerte der Matrix ..."
                rows={2}
                className="flex-1 p-3 bg-slate-50 rounded-xl border border-slate-200 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200 focus:bg-white transition-all resize-none text-slate-700 text-sm placeholder:text-slate-400"
              />
              {exampleTasks.length > 1 && (
                <button
                  onClick={() => removeExampleTask(index)}
                  className="mt-1.5 p-1.5 text-slate-300 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors"
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
          className="mt-2 inline-flex items-center gap-1.5 text-sm font-medium text-indigo-600 hover:text-indigo-700 px-3 py-2 rounded-lg hover:bg-indigo-50 transition-colors"
        >
          <Plus className="w-4 h-4" />
          Beispielaufgabe hinzufügen
        </button>
      </div>

      <div className="flex justify-end pt-1">
        <button
          onClick={handleStart}
          disabled={!canSubmit}
          className="w-full sm:w-auto justify-center bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed text-white px-6 sm:px-8 py-3.5 rounded-xl font-bold text-base sm:text-lg shadow-lg shadow-indigo-200 flex items-center space-x-2 transition-all active:scale-95"
        >
          {isLoading ? (
            <>
              <Loader2 className="w-5 h-5 animate-spin" />
              <span>Prüfung wird vorbereitet ...</span>
            </>
          ) : (
            <>
              <Send className="w-5 h-5" />
              <span>Prüfung starten</span>
            </>
          )}
        </button>
      </div>
    </div>
  );
};

export default ExamSetup;
