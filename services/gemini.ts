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