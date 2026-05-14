import React, { useState, useRef, useEffect, useMemo, useCallback } from 'react';
import { Send, X, MessageSquare, Loader2, Volume2, VolumeX, BookPlus, ImageIcon } from 'lucide-react';
import MathRenderer from './MathRenderer';
import {
  ChatContextSnapshot,
  FormulaExtractionActionResult,
  ChatImageAttachment,
  ChatMessage,
  ChatOriginMode,
  ChatSessionPersistPayload,
  SolutionStep
} from '../types';
import { chatWithAI } from '../services/gemini';
import { speakText } from '../services/tts';

interface SidePanelProps {
  currentStep: SolutionStep;
  allSteps: SolutionStep[];
  stepIndex: number;
  stepLabel: string;
  stepScopeKey: string;
  initialPrompt: string;
  isOpen: boolean;
  onToggle: () => void;
  onExtractFormulasFromMessage?: (message: string, sourceLabel: string) => Promise<FormulaExtractionActionResult> | void;
  loadPersistedMessages?: (sessionKey: string) => ChatMessage[] | null;
  onPersistChatSession?: (payload: ChatSessionPersistPayload) => void;
  sessionOriginMode?: ChatOriginMode;
  sessionOriginLabel?: string;
  sessionSourceId?: string;
  sessionProjectId?: string;
  sessionKeyPrefix?: string;
}

const generateId = (): string => {
  if (typeof globalThis.crypto?.randomUUID === 'function') {
    return globalThis.crypto.randomUUID();
  }
  return `chat-${Date.now()}-${Math.random().toString(16).slice(2)}`;
};

const buildGreetingMessage = (stepLabel: string, stepTitle: string): ChatMessage => ({
  id: `greeting-${stepLabel}-${stepTitle}`.replace(/\s+/g, '-').toLowerCase(),
  role: 'model',
  content: `Hallo! Ich bin dein Mathe-Assistent. Ich sehe, du bist gerade bei ${stepLabel}: **"${stepTitle}"**. \n\nHast du Fragen dazu?`,
  timestamp: Date.now()
});

const getMessagesForStep = (
  sessions: Record<string, ChatMessage[]>,
  stepScopeKey: string,
  stepLabel: string,
  stepTitle: string
): ChatMessage[] => sessions[stepScopeKey] ?? [buildGreetingMessage(stepLabel, stepTitle)];

const SidePanel: React.FC<SidePanelProps> = ({
  currentStep,
  allSteps,
  stepIndex,
  stepLabel,
  stepScopeKey,
  initialPrompt,
  isOpen,
  onToggle,
  onExtractFormulasFromMessage,
  loadPersistedMessages,
  onPersistChatSession,
  sessionOriginMode = 'CHAT',
  sessionOriginLabel = 'Chat',
  sessionSourceId,
  sessionProjectId,
  sessionKeyPrefix
}) => {
  const [chatSessions, setChatSessions] = useState<Record<string, ChatMessage[]>>({});
  const [input, setInput] = useState('');
  const [attachments, setAttachments] = useState<ChatImageAttachment[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [extractingMessageIndex, setExtractingMessageIndex] = useState<number | null>(null);
  const [extractFeedback, setExtractFeedback] = useState<string | null>(null);
  const [isSoundEnabled, setIsSoundEnabled] = useState(false);
  const [ttsError, setTtsError] = useState<string | null>(null);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const defaultMessagesForStep = useMemo(
    () => [buildGreetingMessage(stepLabel, currentStep.title)],
    [stepLabel, currentStep.title]
  );
  const resolvedSessionKey = sessionKeyPrefix ? `${sessionKeyPrefix}:${stepScopeKey}` : stepScopeKey;
  const messages = chatSessions[resolvedSessionKey] ?? defaultMessagesForStep;

  const buildContextSnapshot = useCallback((): ChatContextSnapshot => ({
    initialPrompt,
    currentStep: {
      title: currentStep.title ?? '',
      explanation: currentStep.explanation ?? '',
      formulas: Array.isArray(currentStep.formulas) ? currentStep.formulas : []
    },
    allSteps: (allSteps ?? []).map((step) => ({
      title: step.title ?? '',
      explanation: step.explanation ?? '',
      formulas: Array.isArray(step.formulas) ? step.formulas : []
    })),
    stepIndex,
    stepLabel,
    stepScopeKey: resolvedSessionKey,
    originMode: sessionOriginMode,
    ...(sessionProjectId ? { projectId: sessionProjectId } : {})
  }), [allSteps, currentStep.explanation, currentStep.formulas, currentStep.title, initialPrompt, resolvedSessionKey, sessionOriginMode, sessionProjectId, stepIndex, stepLabel]);

  const persistChatSession = useCallback((nextMessages: ChatMessage[]) => {
    if (!onPersistChatSession) return;
    const hasUserMessage = nextMessages.some(message => message.role === 'user');
    if (!hasUserMessage) return;

    onPersistChatSession({
      sessionKey: resolvedSessionKey,
      title: (initialPrompt || currentStep.title || stepLabel || 'Chat').trim(),
      projectId: sessionProjectId,
      origin: {
        mode: sessionOriginMode,
        label: sessionOriginLabel,
        ...(sessionSourceId ? { sourceId: sessionSourceId } : {})
      },
      context: buildContextSnapshot(),
      messages: nextMessages
    });
  }, [buildContextSnapshot, currentStep.title, initialPrompt, onPersistChatSession, resolvedSessionKey, sessionOriginLabel, sessionOriginMode, sessionProjectId, sessionSourceId, stepLabel]);

  useEffect(() => {
    if (!loadPersistedMessages) return;
    setChatSessions((prev) => {
      if (prev[resolvedSessionKey]) return prev;
      const loaded = loadPersistedMessages(resolvedSessionKey);
      if (!loaded || loaded.length === 0) return prev;
      return {
        ...prev,
        [resolvedSessionKey]: loaded
      };
    });
  }, [loadPersistedMessages, resolvedSessionKey]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isOpen]);

  useEffect(() => {
    if (!isOpen) {
      stopAudio();
      return;
    }

    const lastMessage = messages[messages.length - 1];
    if (lastMessage && lastMessage.role === 'model' && isSoundEnabled && !ttsError) {
      const timer = setTimeout(() => {
        void handleSpeak(lastMessage.content);
      }, 500);
      return () => clearTimeout(timer);
    }
    return;
  }, [messages, isOpen, ttsError, isSoundEnabled]);

  useEffect(() => {
    return () => stopAudio();
  }, []);

  useEffect(() => {
    stopAudio();
  }, [resolvedSessionKey]);

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
      audio.play().catch(e => console.error('Playback error:', e));
      audio.onended = () => { audioRef.current = null; };
    } catch (err: any) {
      console.warn('TTS failed:', err);
      setTtsError(err.message || 'TTS Fehler');
      setIsSoundEnabled(false);
    }
  };

  const toggleSound = () => {
    if (ttsError) {
      setTtsError(null);
      return;
    }
    const newState = !isSoundEnabled;
    setIsSoundEnabled(newState);
    if (!newState) {
      stopAudio();
    }
  };

  const addImageFile = useCallback((file: File) => {
    if (!file.type.startsWith('image/')) return;
    const reader = new FileReader();
    reader.onloadend = () => {
      setAttachments((prev) => [
        ...prev,
        {
          id: generateId(),
          mimeType: file.type || 'image/jpeg',
          dataUrl: reader.result as string,
          name: file.name,
          temporary: true
        }
      ]);
    };
    reader.readAsDataURL(file);
  }, []);

  const handleFileSelection = (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files ? Array.from(event.target.files) : [];
    for (const file of files) {
      addImageFile(file);
    }
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handlePaste = (event: React.ClipboardEvent<HTMLTextAreaElement>) => {
    const items = Array.from(event.clipboardData.items);
    const imageItems = items.filter((item) => item.type.includes('image'));
    if (imageItems.length === 0) return;
    event.preventDefault();
    for (const item of imageItems) {
      const file = item.getAsFile();
      if (file) addImageFile(file);
    }
  };

  const removeAttachment = (attachmentId: string) => {
    setAttachments((prev) => prev.filter((entry) => entry.id !== attachmentId));
  };

  const handleSend = async () => {
    const userMsg = input.trim();
    if ((!userMsg && attachments.length === 0) || isLoading) return;
    stopAudio();

    const activeStepKey = resolvedSessionKey;
    const activeStepLabel = stepLabel;
    const activeStepTitle = currentStep.title;
    const historyBeforeNewMessage = messages;
    const now = Date.now();
    const outgoingImages = attachments.map((image) => ({ ...image }));
    const userMessage: ChatMessage = {
      id: generateId(),
      role: 'user',
      content: userMsg,
      images: outgoingImages.length > 0 ? outgoingImages : undefined,
      timestamp: now
    };

    setInput('');
    setAttachments([]);
    setChatSessions(prev => {
      const base = getMessagesForStep(prev, activeStepKey, activeStepLabel, activeStepTitle);
      const nextMessages = [...base, userMessage];
      persistChatSession(nextMessages);
      return {
        ...prev,
        [activeStepKey]: nextMessages
      };
    });
    setIsLoading(true);

    try {
      const response = await chatWithAI({
        messageText: userMsg,
        messageImages: outgoingImages,
        context: buildContextSnapshot(),
        chatHistory: historyBeforeNewMessage
      });
      const modelMessage: ChatMessage = {
        id: generateId(),
        role: 'model',
        content: response,
        timestamp: Date.now()
      };

      setChatSessions(prev => {
        const base = prev[activeStepKey] ?? [...historyBeforeNewMessage, userMessage];
        const nextMessages = [...base, modelMessage];
        persistChatSession(nextMessages);
        return {
          ...prev,
          [activeStepKey]: nextMessages
        };
      });
    } catch (error) {
      console.error('Chat error:', error);
      const fallbackMessage: ChatMessage = {
        id: generateId(),
        role: 'model',
        content: 'Entschuldigung, ich konnte darauf nicht antworten. Bitte versuche es erneut.',
        timestamp: Date.now()
      };
      setChatSessions(prev => {
        const base = prev[activeStepKey] ?? [...historyBeforeNewMessage, userMessage];
        const nextMessages = [...base, fallbackMessage];
        persistChatSession(nextMessages);
        return {
          ...prev,
          [activeStepKey]: nextMessages
        };
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleKeyPress = (event: React.KeyboardEvent) => {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      void handleSend();
    }
  };

  const handleExtractFormulas = async (messageContent: string, messageIndex: number) => {
    if (!onExtractFormulasFromMessage || extractingMessageIndex !== null) return;
    setExtractingMessageIndex(messageIndex);
    setExtractFeedback(null);
    try {
      const result = await onExtractFormulasFromMessage(messageContent, `${stepLabel}: ${currentStep.title}`);
      if (result?.requiresSelection) {
        setExtractFeedback(`${result.extracted} Kandidaten gefunden. Bitte im Popup die passenden Formeln auswaehlen.`);
      } else if (result && typeof result === 'object' && 'added' in result && 'extracted' in result) {
        setExtractFeedback(`${result.added}/${result.extracted} Formeln hinzugefuegt.`);
      } else {
        setExtractFeedback('Formeln wurden verarbeitet.');
      }
    } catch (error: any) {
      setExtractFeedback(error?.message || 'Formeln konnten nicht hinzugefuegt werden.');
    } finally {
      setExtractingMessageIndex(null);
    }
  };

  if (!isOpen) {
    return (
      <button
        onClick={onToggle}
        className="fixed bottom-4 right-4 sm:bottom-6 sm:right-6 z-50 bg-indigo-600 hover:bg-indigo-700 text-white p-3.5 sm:p-4 rounded-full shadow-xl transition-all hover:scale-110 active:scale-95 group"
        title="KI Assistent oeffnen"
      >
        <MessageSquare className="w-6 h-6" />
        <span className="absolute right-full mr-3 top-1/2 -translate-y-1/2 bg-slate-800 text-white text-xs px-2 py-1 rounded opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap pointer-events-none">
          Fragen stellen
        </span>
      </button>
    );
  }

  return (
    <div className="fixed right-0 top-0 h-full w-full md:w-[400px] bg-white shadow-2xl z-40 transform transition-transform duration-300 ease-in-out border-l border-slate-200 flex flex-col pb-[env(safe-area-inset-bottom)]">
      <div className="p-3 sm:p-4 bg-indigo-600 text-white flex justify-between items-center shadow-md">
        <div className="flex items-center gap-2">
          <MessageSquare className="w-5 h-5" />
          <div>
            <h3 className="font-bold">KI Tutor</h3>
            <p className="text-xs text-indigo-200">
              {ttsError ? <span className="text-red-300 font-bold">{ttsError}</span> : `${stepLabel}: ${currentStep.title}`}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={toggleSound}
            className={`p-2 rounded-full transition-colors ${ttsError ? 'bg-red-500 hover:bg-red-600' : 'hover:bg-indigo-500'}`}
            title={ttsError ? 'Fehler zuruecksetzen' : (isSoundEnabled ? 'Ton ausschalten' : 'Ton einschalten')}
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

      <div className="flex-1 overflow-y-auto overflow-x-hidden p-3 sm:p-4 bg-slate-50 space-y-3 sm:space-y-4">
        {extractFeedback && (
          <div className="rounded-xl border border-indigo-100 bg-indigo-50 px-3 py-2 text-xs text-indigo-700">
            {extractFeedback}
          </div>
        )}
        {messages.map((msg, idx) => (
          <div
            key={msg.id || `${msg.role}-${idx}`}
            className={`flex min-w-0 ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
          >
            <div
              className={`min-w-0 max-w-[90%] sm:max-w-[85%] overflow-hidden rounded-2xl p-3 shadow-sm text-sm sm:text-base ${
                msg.role === 'user'
                  ? 'bg-indigo-600 text-white rounded-br-none'
                  : 'bg-white border border-slate-200 text-slate-700 rounded-bl-none'
              }`}
            >
              {msg.role === 'model' ? (
                <div className="space-y-2">
                  <div className="prose prose-sm min-w-0 max-w-none text-inherit dark:prose-invert">
                    <MathRenderer content={msg.content} />
                  </div>
                  {onExtractFormulasFromMessage && (
                    <button
                      onClick={() => {
                        void handleExtractFormulas(msg.content, idx);
                      }}
                      disabled={extractingMessageIndex !== null}
                      className="inline-flex items-center gap-1.5 rounded-lg border border-indigo-200 bg-indigo-50 px-2 py-1 text-xs font-semibold text-indigo-700 hover:bg-indigo-100 disabled:opacity-50"
                    >
                      {extractingMessageIndex === idx ? (
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      ) : (
                        <BookPlus className="w-3.5 h-3.5" />
                      )}
                      Formeln hinzufuegen
                    </button>
                  )}
                </div>
              ) : (
                <div className="space-y-2">
                  {msg.content ? <p className="whitespace-pre-wrap break-words">{msg.content}</p> : null}
                  {Array.isArray(msg.images) && msg.images.length > 0 && (
                    <div className="space-y-2">
                      {msg.images.map((image) => (
                        <div key={image.id} className="rounded-xl overflow-hidden border border-white/30 bg-white/10">
                          {image.dataUrl && !image.unavailable ? (
                            <img src={image.dataUrl} alt={image.name || 'Anhang'} className="max-h-56 w-full object-contain bg-black/20" />
                          ) : (
                            <div className="px-2.5 py-2 text-xs text-white/90">
                              Bild nicht verfuegbar ({image.name || image.mimeType || 'Anhang'})
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
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

      <div className="p-3 sm:p-4 bg-white border-t border-slate-200 space-y-2">
        {attachments.length > 0 && (
          <div className="rounded-xl border border-slate-200 bg-slate-50 p-2 space-y-2">
            <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">Anhaenge ({attachments.length})</p>
            <div className="grid grid-cols-3 gap-2">
              {attachments.map((attachment) => (
                <div key={attachment.id} className="relative rounded-lg overflow-hidden border border-slate-200 bg-white">
                  {attachment.dataUrl ? (
                    <img src={attachment.dataUrl} alt={attachment.name || 'Bild'} className="h-16 w-full object-cover" />
                  ) : (
                    <div className="h-16 flex items-center justify-center text-[10px] text-slate-500 px-1 text-center">
                      {attachment.name || attachment.mimeType}
                    </div>
                  )}
                  <button
                    onClick={() => removeAttachment(attachment.id)}
                    className="absolute top-1 right-1 h-5 w-5 rounded-full bg-black/60 text-white flex items-center justify-center"
                    title="Entfernen"
                  >
                    <X className="w-3 h-3" />
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="relative">
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyPress}
            onPaste={handlePaste}
            placeholder="Stelle eine Frage zu diesem Schritt..."
            className="w-full pl-4 pr-24 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:border-indigo-500 focus:ring-1 focus:ring-indigo-200 transition-all resize-none max-h-32 min-h-[50px]"
            rows={1}
            style={{ minHeight: '50px' }}
          />
          <div className="absolute right-2 bottom-2 flex items-center gap-1">
            <button
              onClick={() => fileInputRef.current?.click()}
              className="p-2 rounded-lg border border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
              title="Bilder anhaengen"
            >
              <ImageIcon className="w-4 h-4" />
            </button>
            <button
              onClick={() => {
                void handleSend();
              }}
              disabled={(!input.trim() && attachments.length === 0) || isLoading}
              className="p-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
            >
              <Send className="w-4 h-4" />
            </button>
          </div>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            multiple
            className="hidden"
            onChange={handleFileSelection}
          />
        </div>
        <p className="text-[10px] text-center text-slate-400 mt-2">
          KI kann Fehler machen. Ueberpruefe wichtige Informationen.
        </p>
      </div>
    </div>
  );
};

export default SidePanel;
