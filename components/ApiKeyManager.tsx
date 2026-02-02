import React, { useState, useEffect } from 'react';
import { Key, Save, X, Settings } from 'lucide-react';

const ApiKeyManager: React.FC = () => {
  const [isOpen, setIsOpen] = useState(false);
  const [apiKey, setApiKey] = useState('');
  const [isSaved, setIsSaved] = useState(false);

  useEffect(() => {
    const savedKey = localStorage.getItem('GEMINI_API_KEY');
    if (savedKey) {
      setApiKey(savedKey);
    }
  }, []);

  const handleSave = () => {
    if (apiKey.trim()) {
      localStorage.setItem('GEMINI_API_KEY', apiKey.trim());
      setIsSaved(true);
      setTimeout(() => {
        setIsSaved(false);
        setIsOpen(false);
      }, 1500);
    } else {
      localStorage.removeItem('GEMINI_API_KEY');
      setIsOpen(false);
    }
    // Reload the page to ensure the new key is used
    window.location.reload();
  };

  return (
    <div className="relative">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="p-2 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-full transition-all"
        title="API Key konfigurieren"
      >
        <Key className="w-5 h-5" />
      </button>

      {isOpen && (
        <div className="absolute right-0 mt-2 w-72 bg-white rounded-2xl shadow-2xl border border-slate-100 p-4 z-50 animate-in fade-in zoom-in duration-200">
          <div className="flex items-center justify-between mb-3">
            <h3 className="font-bold text-slate-800 flex items-center gap-2 text-sm">
              <Settings className="w-4 h-4 text-indigo-500" />
              API Settings
            </h3>
            <button onClick={() => setIsOpen(false)} className="text-slate-400 hover:text-slate-600">
              <X className="w-4 h-4" />
            </button>
          </div>
          
          <p className="text-xs text-slate-500 mb-3 leading-relaxed">
            Gib deinen Google Gemini API Key ein. Er wird nur lokal in deinem Browser gespeichert.
          </p>
          
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
              className={`w-full py-2 rounded-xl text-sm font-bold flex items-center justify-center gap-2 transition-all ${
                isSaved 
                  ? 'bg-green-500 text-white' 
                  : 'bg-indigo-600 hover:bg-indigo-700 text-white shadow-md shadow-indigo-100'
              }`}
            >
              <Save className="w-4 h-4" />
              {isSaved ? 'Gespeichert!' : 'Key speichern'}
            </button>
            
            <p className="text-[10px] text-center text-slate-400 italic">
              Kein Key? Hol dir einen auf <a href="https://aistudio.google.com/" target="_blank" rel="noopener noreferrer" className="text-indigo-500 underline">aistudio.google.com</a>
            </p>
          </div>
        </div>
      )}
    </div>
  );
};

export default ApiKeyManager;
