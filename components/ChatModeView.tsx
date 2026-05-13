import React, { useMemo, useRef, useState } from 'react';
import { BookPlus, ImageIcon, Loader2, MessageSquare, Plus, Send, Trash2, X } from 'lucide-react';
import MathRenderer from './MathRenderer';
import { ChatConversation, ChatImageAttachment, FormulaExtractionActionResult, Project } from '../types';

interface ChatModeViewProps {
  conversations: ChatConversation[];
  projects: Project[];
  activeConversationId: string | null;
  isSending: boolean;
  onSelectConversation: (conversationId: string) => void;
  onCreateConversation: () => void;
  onDeleteConversation: (conversationId: string) => void;
  onSendMessage: (payload: { conversationId: string; text: string; images: ChatImageAttachment[] }) => void;
  onExtractFormulasFromMessage?: (message: string, sourceLabel: string) => Promise<FormulaExtractionActionResult> | void;
}

const formatOriginLabel = (label: string): string => {
  if (!label) return 'Chat';
  return label;
};

const formatConversationTitle = (title?: string): string => {
  const normalized = (title ?? '').replace(/\s+/g, ' ').trim();
  if (!normalized) return 'Chat';
  return normalized.length > 140 ? `${normalized.slice(0, 137)}...` : normalized;
};

const ChatModeView: React.FC<ChatModeViewProps> = ({
  conversations,
  projects,
  activeConversationId,
  isSending,
  onSelectConversation,
  onCreateConversation,
  onDeleteConversation,
  onSendMessage,
  onExtractFormulasFromMessage
}) => {
  const [input, setInput] = useState('');
  const [attachments, setAttachments] = useState<ChatImageAttachment[]>([]);
  const [extractFeedback, setExtractFeedback] = useState<string | null>(null);
  const [extractingMessageId, setExtractingMessageId] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const messageListRef = useRef<HTMLDivElement | null>(null);
  const messageElementByIdRef = useRef<Record<string, HTMLDivElement | null>>({});

  const activeConversation = useMemo(
    () => conversations.find((conversation) => conversation.id === activeConversationId) ?? null,
    [activeConversationId, conversations]
  );
  const historyConversations = useMemo(
    () => conversations.filter((conversation) => !conversation.isDraft),
    [conversations]
  );
  const lastUserMessageId = useMemo(() => {
    if (!activeConversation) return null;
    for (let idx = activeConversation.messages.length - 1; idx >= 0; idx -= 1) {
      const message = activeConversation.messages[idx];
      if (message.role === 'user') return message.id;
    }
    return null;
  }, [activeConversation]);
  const projectNameById = useMemo(() => {
    const map = new Map<string, string>();
    for (const project of projects) {
      map.set(project.id, project.name);
    }
    return map;
  }, [projects]);

  const addImageFile = (file: File) => {
    if (!file.type.startsWith('image/')) return;
    const reader = new FileReader();
    reader.onloadend = () => {
      setAttachments((prev) => [
        ...prev,
        {
          id: typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : `chat-image-${Date.now()}-${Math.random().toString(16).slice(2)}`,
          mimeType: file.type || 'image/jpeg',
          dataUrl: reader.result as string,
          name: file.name,
          temporary: true
        }
      ]);
    };
    reader.readAsDataURL(file);
  };

  const handleFileSelection = (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files ? Array.from(event.target.files) : [];
    for (const file of files) {
      addImageFile(file);
    }
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
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
    setAttachments((prev) => prev.filter((attachment) => attachment.id !== attachmentId));
  };

  const handleSend = () => {
    if (!activeConversation) return;
    const text = input.trim();
    if ((!text && attachments.length === 0) || isSending) return;
    onSendMessage({
      conversationId: activeConversation.id,
      text,
      images: attachments.map((attachment) => ({ ...attachment }))
    });
    setInput('');
    setAttachments([]);
  };

  const handleExtractFormulas = async (messageId: string, messageContent: string) => {
    if (!activeConversation || !onExtractFormulasFromMessage || extractingMessageId) return;
    setExtractingMessageId(messageId);
    setExtractFeedback(null);
    try {
      const result = await onExtractFormulasFromMessage(
        messageContent,
        `Chat: ${activeConversation.title || 'Konversation'}`
      );
      if (result?.requiresSelection) {
        setExtractFeedback(`${result.extracted} Kandidaten gefunden. Bitte im Popup die gewuenschten Formeln auswaehlen.`);
      } else if (result && typeof result === 'object' && 'added' in result && 'extracted' in result) {
        setExtractFeedback(`${result.added}/${result.extracted} Formeln hinzugefuegt.`);
      } else {
        setExtractFeedback('Formeln wurden verarbeitet.');
      }
    } catch (error: any) {
      setExtractFeedback(error?.message || 'Formeln konnten nicht hinzugefuegt werden.');
    } finally {
      setExtractingMessageId(null);
    }
  };

  React.useEffect(() => {
    const container = messageListRef.current;
    if (!container) return;

    if (!lastUserMessageId) {
      container.scrollTop = 0;
      return;
    }

    const lastUserMessageElement = messageElementByIdRef.current[lastUserMessageId];
    if (!lastUserMessageElement) return;

    const targetTop =
      lastUserMessageElement.offsetTop -
      container.clientHeight / 2 +
      lastUserMessageElement.clientHeight / 2;
    container.scrollTop = Math.max(0, targetTop);
  }, [activeConversation?.id, lastUserMessageId]);

  return (
    <section className="h-full min-h-0 w-full overflow-hidden">
      <div className="flex h-full min-h-0 flex-col md:flex-row">
        <aside className="flex min-h-0 max-h-[32vh] flex-col border-b border-slate-100 bg-slate-50/70 md:max-h-none md:w-[320px] md:flex-none md:border-b-0 md:border-r">
          <div className="p-4 border-b border-slate-100">
            <button
              onClick={onCreateConversation}
              className="w-full inline-flex items-center justify-center gap-2 rounded-xl bg-indigo-600 px-3 py-2.5 text-sm font-semibold text-white hover:bg-indigo-700 transition-colors"
            >
              <Plus className="w-4 h-4" />
              Neuer Chat
            </button>
          </div>
          <div className="flex-1 overflow-y-auto overscroll-contain p-2 space-y-2">
            {historyConversations.length === 0 ? (
              <div className="rounded-xl border border-dashed border-slate-300 bg-white p-3 text-xs text-slate-500">
                Noch keine Chatverlaeufe vorhanden.
              </div>
            ) : (
              historyConversations.map((conversation) => (
                <div
                  key={conversation.id}
                  className={`w-full rounded-xl border px-3 py-3 text-left transition-colors ${
                    conversation.id === activeConversationId
                      ? 'border-indigo-300 bg-indigo-50'
                      : 'border-slate-200 bg-white hover:border-indigo-200 hover:bg-indigo-50/40'
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <button
                      type="button"
                      onClick={() => onSelectConversation(conversation.id)}
                      className="min-w-0 text-left"
                      title={formatConversationTitle(conversation.title || 'Chat')}
                    >
                      <p className="truncate text-sm font-semibold text-slate-800">{formatConversationTitle(conversation.title || 'Chat')}</p>
                      <p className="mt-0.5 text-[11px] text-slate-500">
                        {formatOriginLabel(conversation.origin.label)} | {new Date(conversation.updatedAt).toLocaleString()}
                      </p>
                      {conversation.projectId && projectNameById.get(conversation.projectId) && (
                        <span className="mt-1 inline-flex rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-semibold text-slate-600">
                          Projekt: {projectNameById.get(conversation.projectId)}
                        </span>
                      )}
                    </button>
                    <button
                      type="button"
                      className="inline-flex h-6 w-6 items-center justify-center rounded-full text-slate-400 hover:bg-red-50 hover:text-red-500"
                      onClick={() => onDeleteConversation(conversation.id)}
                      title="Chat loeschen"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        </aside>

        <div className="flex min-h-0 flex-1 flex-col">
          <div className="border-b border-slate-100 px-4 py-3 bg-white">
            <div className="flex items-center gap-2">
              <MessageSquare className="w-4 h-4 text-indigo-500" />
              <p
                className="min-w-0 truncate text-sm font-semibold text-slate-800"
                title={formatConversationTitle(activeConversation?.title || 'Chat-Modus')}
              >
                {formatConversationTitle(activeConversation?.title || 'Chat-Modus')}
              </p>
            </div>
            <p className="text-xs text-slate-500 mt-0.5">
              {activeConversation ? `Kontext: ${formatOriginLabel(activeConversation.origin.label)}` : 'Erstelle einen Chat, um loszulegen.'}
            </p>
          </div>

          <div ref={messageListRef} className="flex-1 min-h-0 overflow-y-auto overscroll-contain p-4 bg-slate-50 space-y-3">
            {extractFeedback && (
              <div className="rounded-xl border border-indigo-100 bg-indigo-50 px-3 py-2 text-xs text-indigo-700">
                {extractFeedback}
              </div>
            )}
            {!activeConversation ? (
              <div className="h-full flex items-center justify-center text-center text-slate-500 text-sm px-6">
                Waehle links einen Verlauf oder starte einen neuen Chat.
              </div>
            ) : (
              <>
                {activeConversation.messages.map((message) => (
                  <div
                    key={message.id}
                    ref={(element) => {
                      messageElementByIdRef.current[message.id] = element;
                    }}
                    className={`flex ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}
                  >
                    <div
                      className={`max-w-[90%] rounded-2xl p-3 shadow-sm text-sm ${
                        message.role === 'user'
                          ? 'bg-indigo-600 text-white rounded-br-none'
                          : 'bg-white border border-slate-200 text-slate-700 rounded-bl-none'
                      }`}
                    >
                      {message.role === 'model' ? (
                        <div className="space-y-2">
                          <div className="prose prose-sm max-w-none text-inherit">
                            <MathRenderer content={message.content} />
                          </div>
                          {onExtractFormulasFromMessage && (
                            <button
                              onClick={() => {
                                void handleExtractFormulas(message.id, message.content);
                              }}
                              disabled={extractingMessageId !== null}
                              className="inline-flex items-center gap-1.5 rounded-lg border border-indigo-200 bg-indigo-50 px-2 py-1 text-xs font-semibold text-indigo-700 hover:bg-indigo-100 disabled:opacity-50"
                            >
                              {extractingMessageId === message.id ? (
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
                          {message.content ? <p className="whitespace-pre-wrap">{message.content}</p> : null}
                          {Array.isArray(message.images) && message.images.length > 0 && (
                            <div className="space-y-2">
                              {message.images.map((image) => (
                                <div key={image.id} className="rounded-xl overflow-hidden border border-white/30 bg-white/10">
                                  {image.dataUrl && !image.unavailable ? (
                                    <img src={image.dataUrl} alt={image.name || 'Anhang'} className="max-h-60 w-full object-contain bg-black/20" />
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
                {isSending && (
                  <div className="flex justify-start">
                    <div className="bg-white border border-slate-200 rounded-2xl p-3 shadow-sm rounded-bl-none flex items-center gap-2">
                      <Loader2 className="w-4 h-4 animate-spin text-indigo-600" />
                      <span className="text-xs text-slate-400">Tippt...</span>
                    </div>
                  </div>
                )}
              </>
            )}
          </div>

          <div className="border-t border-slate-100 p-4 bg-white space-y-2">
            {attachments.length > 0 && (
              <div className="rounded-xl border border-slate-200 bg-slate-50 p-2 space-y-2">
                <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">Anhaenge ({attachments.length})</p>
                <div className="grid grid-cols-4 gap-2">
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
                onChange={(event) => setInput(event.target.value)}
                onPaste={handlePaste}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' && !event.shiftKey) {
                    event.preventDefault();
                    handleSend();
                  }
                }}
                placeholder={activeConversation ? 'Schreibe eine Nachricht...' : 'Bitte zuerst einen Chat auswaehlen oder erstellen.'}
                disabled={!activeConversation}
                className="w-full min-h-[52px] max-h-40 resize-none rounded-xl border border-slate-200 bg-slate-50 py-3 pl-4 pr-24 text-sm text-slate-700 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-200 disabled:cursor-not-allowed disabled:opacity-70"
              />
              <div className="absolute right-2 bottom-2 flex items-center gap-1">
                <button
                  onClick={() => fileInputRef.current?.click()}
                  disabled={!activeConversation}
                  className="p-2 rounded-lg border border-slate-200 bg-white text-slate-600 hover:bg-slate-50 disabled:opacity-50"
                  title="Bilder anhaengen"
                >
                  <ImageIcon className="w-4 h-4" />
                </button>
                <button
                  onClick={handleSend}
                  disabled={!activeConversation || isSending || (!input.trim() && attachments.length === 0)}
                  className="p-2 rounded-lg bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed"
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
            <p className="text-[10px] text-center text-slate-400">
              KI kann Fehler machen. Ueberpruefe wichtige Informationen.
            </p>
          </div>
        </div>
      </div>
    </section>
  );
};

export default ChatModeView;
