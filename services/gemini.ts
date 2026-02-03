import { GoogleGenAI, Type } from "@google/genai";
import { MathSolution } from "../types";

const SYSTEM_PROMPT = `
Du bist ein exzellenter Mathe-Tutor. Deine Aufgabe ist es, Aufgaben extrem detailliert in kleinen, logischen Einzelschritten zu lösen.

REGELN:
1. Zerlege die Lösung in sehr kleine Schritte. Jeder Rechenvorgang (Klammer auflösen, Term umformen, Kürzen, Einsetzen) ist ein eigener Schritt.
2. Erkläre jeden Schritt so, dass ein Schüler ihn sofort versteht.
3. Gib für jeden Schritt relevante Formeln an.
4. Nutze LaTeX Formatierung. 
   - WICHTIG: In allen Textfeldern ('explanation', 'title', 'finalAnswer') MUSST du mathematische Ausdrücke (Variablen, Zahlen, Formeln) zwingend mit einfachen Dollarzeichen umschließen (z.B. "Berechne $x^2$" oder "Lösung: $x=5$").
   - Im Array 'formulas' nutze KEINE Dollarzeichen, nur den rohen LaTeX-Code.
5. Das Ausgabeformat muss striktes JSON sein.

Struktur der Schritte:
- title: Kurze Überschrift was passiert (z.B. "Klammern auflösen", "$x$ ausklammern")
- explanation: Ausführliche textliche Erklärung mit Inline-LaTeX ($...$).
- formulas: Ein Array von LaTeX-Strings (ohne $), die die Rechnung in diesem Schritt zeigen. Zeige hier VORHER -> NACHHER oder die Zwischenrechnung.
`;

export const solveMathProblem = async (
  promptText: string,
  imageBase64?: string,
  mimeType: string = 'image/jpeg'
): Promise<MathSolution> => {
  try {
    const getApiKey = () => {
      if (typeof window !== 'undefined') {
        const savedKey = localStorage.getItem('GEMINI_API_KEY');
        if (savedKey) return savedKey;
      }
      return '';
    };

    const ai = new GoogleGenAI({ apiKey: getApiKey() });
    const modelId = 'gemini-3-pro-preview';

    const parts: any[] = [];

    if (imageBase64) {
      const data = imageBase64.split(',')[1] || imageBase64;
      parts.push({
        inlineData: {
          data: data,
          mimeType: mimeType,
        },
      });
    }

    const finalPrompt = promptText.trim() === '' && imageBase64 
      ? "Löse diese Aufgabe Schritt für Schritt." 
      : promptText;

    parts.push({ text: finalPrompt });

    const response = await ai.models.generateContent({
      model: modelId,
      contents: {
        role: 'user',
        parts: parts
      },
      config: {
        systemInstruction: SYSTEM_PROMPT,
        thinkingConfig: {
          thinkingBudget: 4096, 
        }, 
        maxOutputTokens: 8192,
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            steps: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  title: { type: Type.STRING },
                  explanation: { type: Type.STRING },
                  formulas: { 
                    type: Type.ARRAY, 
                    items: { type: Type.STRING } 
                  }
                },
                required: ["title", "explanation", "formulas"]
              }
            },
            finalAnswer: { type: Type.STRING }
          },
          required: ["steps", "finalAnswer"]
        }
      },
    });

    if (!response.text) {
      throw new Error("Keine Antwort erhalten.");
    }

    // Parse JSON
    const result = JSON.parse(response.text) as MathSolution;
    return result;

  } catch (error: any) {
    console.error("Gemini API Error:", error);
    throw new Error(error.message || "Ein Fehler ist bei der Anfrage aufgetreten.");
  }
};

export const chatWithAI = async (
  userMessage: string,
  context: {
    currentStep: any;
    allSteps: any[];
    stepIndex: number;
    initialPrompt: string;
    chatHistory: { role: 'user' | 'model'; content: string }[];
  }
): Promise<string> => {
  try {
    const getApiKey = () => {
      if (typeof window !== 'undefined') {
        const savedKey = localStorage.getItem('GEMINI_API_KEY');
        if (savedKey) return savedKey;
      }
      return '';
    };

    const ai = new GoogleGenAI({ apiKey: getApiKey() });
    const modelId = 'gemini-3-pro-preview';

    // Construct system prompt with context
    const contextPrompt = `
Du bist ein hilfreicher Mathe-Tutor, der einem Schüler bei einer spezifischen Aufgabe hilft.
Der Schüler befindet sich gerade in einer Schritt-für-Schritt-Lösung.

KONTEXT:
Ursprüngliche Aufgabe: "${context.initialPrompt}"

Aktueller Schritt (${context.stepIndex + 1}/${context.allSteps.length}):
Titel: ${context.currentStep.title}
Erklärung: ${context.currentStep.explanation}
Formeln: ${context.currentStep.formulas.join(', ')}

Deine Aufgabe ist es, Fragen des Schülers zu diesem spezifischen Schritt oder zum Gesamtverständnis zu beantworten.
- Antworte freundlich, geduldig und pädagogisch wertvoll.
- Nutze Markdown für die Formatierung (Fettgedruckt für wichtiges).
- Nutze LaTeX für mathematische Formeln. 
  - WICHTIG: Umschließe ALLE math. Ausdrücke mit einfachen Dollarzeichen ($...$).
  - Beispiel: "Die Ableitung von $x^2$ ist $2x$."
- Wenn der Nutzer nach dem nächsten Schritt fragt, kannst du einen Hinweis geben, aber verrate nicht sofort alles, wenn es dem Lernprozess schadet.
- Halte die Antworten prägnant, aber verständlich.
`;

    const contents = context.chatHistory.map(msg => ({
      role: msg.role === 'model' ? 'model' : 'user',
      parts: [{ text: msg.content }]
    }));

    contents.push({
      role: 'user',
      parts: [{ text: userMessage }]
    });

    const response = await ai.models.generateContent({
      model: modelId,
      contents: contents,
      config: {
        systemInstruction: contextPrompt,
      }
    });

    if (!response.text) {
        throw new Error("Keine Antwort erhalten.");
    }

    return response.text;

  } catch (error: any) {
    console.error("Gemini Chat Error:", error);
    throw new Error("Chat Anfrage fehlgeschlagen.");
  }
};