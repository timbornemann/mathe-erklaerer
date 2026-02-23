import { GoogleGenAI, Type } from "@google/genai";
import { InputMode, MathSolution, SolutionStep } from "../types";

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

const TUTOR_OUTLINE_PROMPT = `
Du planst einen vollständigen Mathe-Lernpfad von den Grundlagen bis zu Spezialfällen.

ANFORDERUNGEN:
- Der Nutzer nennt ein Thema.
- Erstelle eine didaktisch sinnvolle, vollständige Roadmap mit Lektionen vom absoluten Einstieg bis zu fortgeschrittenen/speziellen Fällen.
- Die Struktur soll lang genug sein, dass echtes Verständnis entsteht.
- Gib 8 bis 12 Lektionen aus.
- Früh: Grundlagen & Intuition, Mitte: Standardverfahren, Spät: Spezialfälle/Fallen/Transferaufgaben.
- Das Ausgabeformat muss striktes JSON sein.
`;

const TUTOR_SECTION_PROMPT = `
Du bist ein Meister-Tutor und schreibst EINE ausführliche Lektion eines Lernpfads.

PFLICHT:
1. Vollständig anfängerverständlich erklären.
2. Mehrere Erklärblöcke mit klaren Überschriften.
3. Mindestens ein vollständig vorgerechnetes Beispiel.
4. Mehrere Übungsaufgaben mit steigender Schwierigkeit.
5. Direkt danach "Musterlösung" mit Schritt-für-Schritt-Lösung zu den Übungsaufgaben.
6. In späteren Lektionen darf der Aufgabenanteil höher sein als der Erkläranteil.
7. Nutze LaTeX:
   - In title/explanation mathematische Ausdrücke als $...$.
   - In formulas nur roher LaTeX ohne Dollarzeichen.
8. Ausgabeformat ist striktes JSON.
`;

interface TutorOutlineSection {
  id: string;
  title: string;
  goals: string[];
  focusLevel: string;
  specialCases: string[];
}

interface TutorOutline {
  courseTitle: string;
  learnerProfile: string;
  sections: TutorOutlineSection[];
  masteryChecklist: string[];
}

interface TutorSectionContent {
  title: string;
  explanation: string;
  formulas: string[];
  takeaway: string;
}

const getApiKey = () => {
  if (typeof window !== 'undefined') {
    const savedKey = localStorage.getItem('GEMINI_API_KEY');
    if (savedKey) return savedKey;

    const runtimeKey = (window as any).__APP_CONFIG__?.GEMINI_API_KEY;
    if (runtimeKey) return runtimeKey;
  }

  return import.meta.env.VITE_GEMINI_API_KEY || '';
};

const buildMathSchema = () => ({
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
});

const generateClassicSolution = async (
  ai: GoogleGenAI,
  modelId: string,
  promptText: string,
  imageBase64?: string,
  mimeType: string = 'image/jpeg'
): Promise<MathSolution> => {
  const parts: any[] = [];

  if (imageBase64) {
    const data = imageBase64.split(',')[1] || imageBase64;
    parts.push({
      inlineData: {
        data,
        mimeType,
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
      parts
    },
    config: {
      systemInstruction: SYSTEM_PROMPT,
      thinkingConfig: {
        thinkingBudget: 4096,
      },
      maxOutputTokens: 8192,
      responseMimeType: "application/json",
      responseSchema: buildMathSchema()
    },
  });

  if (!response.text) {
    throw new Error("Keine Antwort erhalten.");
  }

  return JSON.parse(response.text) as MathSolution;
};

const generateTutorOutline = async (
  ai: GoogleGenAI,
  modelId: string,
  topic: string
): Promise<TutorOutline> => {
  const response = await ai.models.generateContent({
    model: modelId,
    contents: {
      role: 'user',
      parts: [{ text: `Thema des Lernpfads: ${topic}` }]
    },
    config: {
      systemInstruction: TUTOR_OUTLINE_PROMPT,
      thinkingConfig: {
        thinkingBudget: 2048,
      },
      maxOutputTokens: 4096,
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          courseTitle: { type: Type.STRING },
          learnerProfile: { type: Type.STRING },
          sections: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                id: { type: Type.STRING },
                title: { type: Type.STRING },
                goals: { type: Type.ARRAY, items: { type: Type.STRING } },
                focusLevel: { type: Type.STRING },
                specialCases: { type: Type.ARRAY, items: { type: Type.STRING } }
              },
              required: ["id", "title", "goals", "focusLevel", "specialCases"]
            }
          },
          masteryChecklist: { type: Type.ARRAY, items: { type: Type.STRING } }
        },
        required: ["courseTitle", "learnerProfile", "sections", "masteryChecklist"]
      }
    }
  });

  if (!response.text) {
    throw new Error("Tutor-Outline konnte nicht erzeugt werden.");
  }

  return JSON.parse(response.text) as TutorOutline;
};

const generateTutorSection = async (
  ai: GoogleGenAI,
  modelId: string,
  topic: string,
  outline: TutorOutline,
  section: TutorOutlineSection,
  sectionIndex: number,
  totalSections: number,
  previousTakeaways: string[]
): Promise<TutorSectionContent> => {
  const previousContext = previousTakeaways.length
    ? previousTakeaways.map((item, idx) => `${idx + 1}. ${item}`).join('\n')
    : 'Noch keine vorherigen Lektionen.';

  const response = await ai.models.generateContent({
    model: modelId,
    contents: {
      role: 'user',
      parts: [{
        text: `
Thema: ${topic}
Kursname: ${outline.courseTitle}
Lernprofil: ${outline.learnerProfile}
Lektion ${sectionIndex + 1} von ${totalSections}
Titel: ${section.title}
Lernziele: ${section.goals.join('; ')}
Schwierigkeitsfokus: ${section.focusLevel}
Spezialfälle/Fallen: ${section.specialCases.join('; ') || 'Keine'}

Bisherige Lernfortschritte:
${previousContext}

Wichtig: Diese Lektion muss so ausgearbeitet sein, dass sie auch allein verständlich ist und folgende Abschnitte enthält:
- Intuition & Erklärung
- Beispiel(e) vorgerechnet
- Übungsaufgaben (mind. 3, mit steigender Schwierigkeit)
- Musterlösung Schritt für Schritt
`
      }]
    },
    config: {
      systemInstruction: TUTOR_SECTION_PROMPT,
      thinkingConfig: {
        thinkingBudget: 3072,
      },
      maxOutputTokens: 8192,
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          title: { type: Type.STRING },
          explanation: { type: Type.STRING },
          formulas: { type: Type.ARRAY, items: { type: Type.STRING } },
          takeaway: { type: Type.STRING }
        },
        required: ["title", "explanation", "formulas", "takeaway"]
      }
    }
  });

  if (!response.text) {
    throw new Error(`Lektion ${sectionIndex + 1} konnte nicht erzeugt werden.`);
  }

  return JSON.parse(response.text) as TutorSectionContent;
};

const generateTutorLearningPath = async (
  ai: GoogleGenAI,
  modelId: string,
  topic: string
): Promise<MathSolution> => {
  const outline = await generateTutorOutline(ai, modelId, topic);
  const limitedSections = outline.sections.slice(0, 10);

  if (!limitedSections.length) {
    throw new Error("Es konnten keine Lektionen für den Tutor-Lernpfad erstellt werden.");
  }

  const steps: SolutionStep[] = [];
  const takeaways: string[] = [];

  for (let i = 0; i < limitedSections.length; i++) {
    const section = limitedSections[i];
    const lesson = await generateTutorSection(
      ai,
      modelId,
      topic,
      outline,
      section,
      i,
      limitedSections.length,
      takeaways.slice(-3)
    );

    steps.push({
      title: lesson.title,
      explanation: lesson.explanation,
      formulas: lesson.formulas
    });

    takeaways.push(lesson.takeaway);
  }

  const mastery = outline.masteryChecklist.length
    ? outline.masteryChecklist.map((point, idx) => `${idx + 1}. ${point}`).join('\n')
    : 'Arbeite die Lektionen erneut durch und löse zusätzliche Transferaufgaben.';

  const finalAnswer = `
**Lernpfad abgeschlossen: ${outline.courseTitle}**

Du hast jetzt einen vollständigen Lernpfad von den Grundlagen bis zu Spezialfällen.

**Mastery-Checkliste:**
${mastery}

**Wiederholen & später ansehen:**
Dieser Lernpfad wurde in deinem Verlauf gespeichert. Öffne ihn jederzeit erneut und arbeite die Lektionen Schritt für Schritt durch.
`;

  return { steps, finalAnswer };
};

export const solveMathProblem = async (
  promptText: string,
  imageBase64?: string,
  mimeType: string = 'image/jpeg',
  mode: InputMode = InputMode.TEXT
): Promise<MathSolution> => {
  try {
    const ai = new GoogleGenAI({ apiKey: getApiKey() });
    const modelId = 'gemini-3-pro-preview';

    if (mode === InputMode.TUTOR) {
      return await generateTutorLearningPath(ai, modelId, promptText);
    }

    return await generateClassicSolution(ai, modelId, promptText, imageBase64, mimeType);
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
      contents,
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
