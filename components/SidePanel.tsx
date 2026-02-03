import React, { useState, useRef, useEffect } from 'react';
import { Send, X, MessageSquare, Loader2, Volume2, VolumeX } from 'lucide-react';
import MathRenderer from './MathRenderer';
import { SolutionStep } from '../types';
import { chatWithAI } from '../services/gemini';
import { speakText } from '../services/tts';

interface SidePanelProps {
  currentStep: SolutionStep;
  allSteps: SolutionStep[];
  stepIndex: number;
  initialPrompt: string; // The original question/task
  isOpen: boolean;
  onToggle: () => void;
}

interface Message {
  role: 'user' | 'model';
  content: string;
}

const SidePanel: React.FC<SidePanelProps> = ({ 
  currentStep, 
  allSteps, 
  stepIndex, 
  initialPrompt, 
  isOpen, 
  onToggle 
}) => {
  const [messages, setMessages] = useState<Message[]>([
    { 
      role: 'model', 
      content: `Hallo! Ich bin dein Mathe-Assistent. Ich sehe, du bist gerade bei Schritt ${stepIndex + 1}: **"${currentStep.title}"**. \n\nHast du Fragen dazu?` 
    }
  ]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isSoundEnabled, setIsSoundEnabled] = useState(true);
  const [ttsError, setTtsError] = useState<string | null>(null);
  
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  // Scroll to bottom on new messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isOpen]);

  // TTS Effect: Play latest AI message if sound enabled
  useEffect(() => {
    if (!isOpen) {
      stopAudio();
      return;
    }

    const lastMessage = messages[messages.length - 1];
    if (lastMessage && lastMessage.role === 'model' && isSoundEnabled && !ttsError) {
      // Small delay to ensure it doesn't conflict with previous sounds or UI updates
      const timer = setTimeout(() => {
        handleSpeak(lastMessage.content);
      }, 500);
      return () => clearTimeout(timer);
    }
  }, [messages, isOpen, ttsError]); 

  // Stop audio on unmount or close
  useEffect(() => {
    return () => stopAudio();
  }, []);

  const stopAudio = () => {
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.currentTime = 0;
      audioRef.current = null;
    }
  };

  const handleSpeak = async (text: string) => {
    stopAudio();
    if (!isSoundEnabled) return;

    try {
      const audio = await speakText(text);
      audioRef.current = audio;
      audio.play().catch(e => console.error("Playback error:", e));
      
      audio.onended = () => { audioRef.current = null; };
    } catch (err: any) {
      console.warn("TTS failed:", err);
      setTtsError(err.message || "TTS Fehler");
      setIsSoundEnabled(false);
    }
  };

  const toggleSound = () => {
    if (ttsError) {
      // If there was an error, try to clear it and re-enable
      setTtsError(null);
      setIsSoundEnabled(true);
      return;
    }
    const newState = !isSoundEnabled;
    setIsSoundEnabled(newState);
    if (!newState) {
      stopAudio();
    }
  };

  const handleSend = async () => {
    // ... (rest of simple code)
    if (!input.trim() || isLoading) return;
    stopAudio();
    // ...
    const userMsg = input.trim();
    setInput('');
    setMessages(prev => [...prev, { role: 'user', content: userMsg }]);
    setIsLoading(true);

    try {
      const context = {
        currentStep,
        allSteps,
        stepIndex,
        initialPrompt,
        chatHistory: messages
      };

      const response = await chatWithAI(userMsg, context);

      setMessages(prev => [...prev, { role: 'model', content: response }]);
    } catch (error) {
      console.error("Chat error:", error);
      setMessages(prev => [...prev, { role: 'model', content: "Entschuldigung, ich konnte darauf nicht antworten. Bitte versuche es erneut." }]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  if (!isOpen) {
    return (
      <button
        onClick={onToggle}
        className="fixed bottom-6 right-6 z-50 bg-indigo-600 hover:bg-indigo-700 text-white p-4 rounded-full shadow-xl transition-all hover:scale-110 active:scale-95 group"
        title="KI Assistent öffnen"
      >
        <MessageSquare className="w-6 h-6" />
        <span className="absolute right-full mr-3 top-1/2 -translate-y-1/2 bg-slate-800 text-white text-xs px-2 py-1 rounded opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap pointer-events-none">
          Fragen stellen
        </span>
      </button>
    );
  }

  return (
    <div className="fixed right-0 top-0 h-full w-full md:w-[400px] bg-white shadow-2xl z-40 transform transition-transform duration-300 ease-in-out border-l border-slate-200 flex flex-col">
      {/* Header */}
      <div className="p-4 bg-indigo-600 text-white flex justify-between items-center shadow-md">
        <div className="flex items-center gap-2">
          <MessageSquare className="w-5 h-5" />
          <div>
            <h3 className="font-bold">KI Tutor</h3>
            <p className="text-xs text-indigo-200">
              {ttsError ? <span className="text-red-300 font-bold">{ttsError}</span> : `Schritt ${stepIndex + 1}: ${currentStep.title}`}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-1">
          <button 
            onClick={toggleSound}
            className={`p-2 rounded-full transition-colors ${ttsError ? 'bg-red-500 hover:bg-red-600' : 'hover:bg-indigo-500'}`}
            title={ttsError ? "Fehler zurücksetzen" : (isSoundEnabled ? "Ton ausschalten" : "Ton einschalten")}
          >
            {isSoundEnabled ? <Volume2 className="w-5 h-5" /> : <VolumeX className="w-5 h-5" />}
          </button>
          <button 
            onClick={onToggle}
            className="p-2 hover:bg-indigo-500 rounded-full transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-4 bg-slate-50 space-y-4">
        {messages.map((msg, idx) => (
          <div 
            key={idx} 
            className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
          >
            <div 
              className={`max-w-[85%] rounded-2xl p-3 shadow-sm ${
                msg.role === 'user' 
                  ? 'bg-indigo-600 text-white rounded-br-none' 
                  : 'bg-white border border-slate-200 text-slate-700 rounded-bl-none'
              }`}
            >
              {msg.role === 'model' ? (
                <div className="prose prose-sm max-w-none text-inherit dark:prose-invert">
                  <MathRenderer content={msg.content} />
                </div>
              ) : (
                <p className="whitespace-pre-wrap">{msg.content}</p>
              )}
            </div>
          </div>
        ))}
        {isLoading && (
          <div className="flex justify-start">
            <div className="bg-white border border-slate-200 rounded-2xl p-4 shadow-sm rounded-bl-none flex items-center gap-2">
              <Loader2 className="w-4 h-4 animate-spin text-indigo-600" />
              <span className="text-xs text-slate-400">Tippt...</span>
            </div>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <div className="p-4 bg-white border-t border-slate-200">
        <div className="relative">
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyPress}
            placeholder="Stelle eine Frage zu diesem Schritt..."
            className="w-full pl-4 pr-12 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:border-indigo-500 focus:ring-1 focus:ring-indigo-200 transition-all resize-none max-h-32 min-h-[50px]"
            rows={1}
            style={{ minHeight: '50px' }}
          />
          <button
            onClick={handleSend}
            disabled={!input.trim() || isLoading}
            className="absolute right-2 bottom-2 p-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
          >
            <Send className="w-4 h-4" />
          </button>
        </div>
        <p className="text-[10px] text-center text-slate-400 mt-2">
          KI kann Fehler machen. Überprüfe wichtige Informationen.
        </p>
      </div>
    </div>
  );
};

export default SidePanel;
