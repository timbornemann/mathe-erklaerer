import { GoogleGenAI, Type } from "@google/genai";
import { InputMode, MathSolution, SolutionStep, PracticeTask } from "../types";

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
1. Erkläre das Thema der Lektion vollständig anfängerverständlich.
2. Unterteile die Lektion in 4–8 kurze Lernschritte (substeps).
3. Jeder Lernschritt hat:
   - eine kurze Überschrift (title),
   - 1–3 Absätze Erklärung (explanation),
   - die genau zu diesem Schritt passenden Formeln (formulas) als LaTeX ohne Dollarzeichen.
4. Baue in die Lernschritte mindestens ein vollständig vorgerechnetes Beispiel ein.
5. Füge mehrere Übungsaufgaben mit steigender Schwierigkeit und direkt danach Musterlösungen ein (ebenfalls in Lernschritten).
6. In späteren Lektionen darf der Aufgabenanteil höher sein als der Erkläranteil.
7. Nutze LaTeX:
   - In allen Erklärungstexten mathematische Ausdrücke als $...$.
   - In formulas nur roher LaTeX ohne Dollarzeichen.
8. Das Ausgabeformat ist striktes JSON mit:
   - title: string (Lektionstitel),
   - substeps: Array von Objekten { title, explanation, formulas },
   - takeaway: string (wichtigste Merksätze).
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

interface TutorSubstep {
  title: string;
  explanation: string;
  formulas: string[];
}

interface TutorSectionContent {
  title: string;
  substeps: TutorSubstep[];
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

/**
 * Extracts JSON from a Gemini response, handling cases where the model
 * wraps JSON in markdown code fences or returns it inside candidates.
 */
const extractJson = (response: any): any => {
  // Try response.text first (standard accessor)
  let raw = '';
  try {
    raw = response.text ?? '';
  } catch {
    // response.text can throw if all candidates are filtered
  }

  // If empty, try digging into candidates directly
  if (!raw && response.candidates?.[0]?.content?.parts) {
    for (const part of response.candidates[0].content.parts) {
      if (part.text) {
        raw = part.text;
        break;
      }
    }
  }

  raw = raw.trim();

  if (!raw) {
    throw new Error("Keine Antwort vom Modell erhalten. Bitte versuche es erneut.");
  }

  // Strip markdown code fences if present
  const fenceMatch = raw.match(/```(?:json)?\s*\n?([\s\S]*?)\n?\s*```/);
  if (fenceMatch) {
    raw = fenceMatch[1].trim();
  }

  try {
    return JSON.parse(raw);
  } catch {
    console.error("Failed to parse model response as JSON:", raw.slice(0, 500));
    throw new Error("Die KI-Antwort konnte nicht verarbeitet werden. Bitte versuche es erneut.");
  }
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

Wichtig:
- Die Lektion muss so ausgearbeitet sein, dass sie auch allein verständlich ist.
- Unterteile die Lektion in 4–8 kurze Lernschritte (substeps), die der tatsächlichen Lernreihenfolge folgen.
- Jeder substep enthält eine klare Überschrift, eine kurze, gut lesbare Erklärung und genau die Formeln, die zu diesem Schritt gehören.
- Baue in diese Lernschritte Beispiele, Übungsaufgaben und deren Musterlösungen ein.
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
          substeps: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                title: { type: Type.STRING },
                explanation: { type: Type.STRING },
                formulas: { type: Type.ARRAY, items: { type: Type.STRING } }
              },
              required: ["title", "explanation", "formulas"]
            }
          },
          takeaway: { type: Type.STRING }
        },
        required: ["title", "substeps", "takeaway"]
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

    const lessonSubsteps: SolutionStep[] = Array.isArray(lesson.substeps)
      ? lesson.substeps.map((substep) => ({
          title: substep.title,
          explanation: substep.explanation,
          formulas: substep.formulas
        }))
      : [];

    steps.push({
      title: lesson.title,
      explanation: lesson.takeaway,
      formulas: [],
      substeps: lessonSubsteps
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

const PRACTICE_GENERATE_PROMPT = `
Du bist ein Mathe-Aufgaben-Generator. Deine Aufgabe ist es, eine einzelne Übungsaufgabe zu erstellen.

REGELN:
1. Erstelle GENAU EINE Aufgabe passend zum angegebenen Thema und Schwierigkeitsgrad.
2. Die Aufgabe soll KURZ und PRÄGNANT formuliert sein – maximal 3–5 Sätze. Keine Teilaufgaben (a, b, c …), keine langen Textaufgaben mit mehreren Absätzen. Eine einzige, klare Fragestellung.
3. Die Aufgabe muss eine eindeutige Lösung haben.
4. Orientiere dich an den Beispielaufgaben des Nutzers bezüglich Stil, Umfang und Schwierigkeit.
5. Wiederhole KEINE der bereits gestellten Aufgaben – variiere Zahlen, Kontext und Struktur.
6. Nutze LaTeX für mathematische Ausdrücke: umschließe sie mit $...$ im Text.
7. Gib auch eine kurze Beschreibung des Aufgabentyps (max. 10 Wörter) für die Übersicht.
8. Das Ausgabeformat muss striktes JSON sein.
`;

const PRACTICE_CHECK_PROMPT = `
Du bist ein Mathe-Korrektor. Deine Aufgabe ist es, die Lösung eines Schülers zu überprüfen.

REGELN:
1. Vergleiche die Schülerlösung mit der korrekten Lösung der Aufgabe.
2. Bewerte ob die Lösung korrekt ist (isCorrect: true/false).
3. Gib konstruktives Feedback:
   - Bei korrekter Lösung: Kurze Bestätigung und ggf. Lob.
   - Bei falscher Lösung: Erkläre WAS falsch ist, aber verrate NICHT die vollständige Lösung. Gib einen Hinweis, wo der Fehler liegt.
4. Nutze LaTeX für mathematische Ausdrücke: $...$ im Feedback-Text.
5. Sei ermutigend und pädagogisch wertvoll.
6. Das Ausgabeformat muss striktes JSON sein.
`;

export const generatePracticeTask = async (
  topic: string,
  difficulty: string,
  exampleTasks: string[],
  previousTasks: PracticeTask[],
  additionalPrompt?: string
): Promise<{ taskText: string; description: string }> => {
  try {
    const ai = new GoogleGenAI({ apiKey: getApiKey() });
    const modelId = 'gemini-3-pro-preview';

    const examplesSection = exampleTasks.length
      ? `\nBeispielaufgaben des Nutzers (orientiere dich an Stil und Umfang):\n${exampleTasks.map((t, i) => `${i + 1}. ${t}`).join('\n')}`
      : '';

    const previousSection = previousTasks.length
      ? `\nBereits gestellte Aufgaben (NICHT wiederholen):\n${previousTasks.map((t, i) => `${i + 1}. ${t.taskText}${t.isCorrect === true ? ' ✓' : t.isCorrect === false ? ' ✗' : ''}`).join('\n')}`
      : '';

    const additionalSection = additionalPrompt
      ? `\nZusätzliche Anweisungen des Nutzers: ${additionalPrompt}`
      : '';

    const userPrompt = `Thema: ${topic}
Schwierigkeit: ${difficulty}${examplesSection}${previousSection}${additionalSection}

Erstelle eine passende Übungsaufgabe.`;

    const response = await ai.models.generateContent({
      model: modelId,
      contents: {
        role: 'user',
        parts: [{ text: userPrompt }]
      },
      config: {
        systemInstruction: PRACTICE_GENERATE_PROMPT,
        thinkingConfig: { thinkingBudget: 2048 },
        maxOutputTokens: 4096,
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            taskText: { type: Type.STRING },
            description: { type: Type.STRING }
          },
          required: ["taskText", "description"]
        }
      }
    });

    const parsed = extractJson(response);

    return {
      taskText: parsed.taskText || "Aufgabe konnte nicht gelesen werden.",
      description: parsed.description || ""
    };
  } catch (error: any) {
    console.error("Practice Generate Error:", error);
    throw new Error(error?.message || "Aufgabe konnte nicht erstellt werden.");
  }
};

export const checkPracticeSolution = async (
  taskText: string,
  userSolution?: string,
  userSolutionImage?: string,
  imageMimeType: string = 'image/jpeg'
): Promise<{ isCorrect: boolean; feedback: string }> => {
  try {
    const ai = new GoogleGenAI({ apiKey: getApiKey() });
    const modelId = 'gemini-3-pro-preview';

    const parts: any[] = [];

    if (userSolutionImage) {
      const data = userSolutionImage.split(',')[1] || userSolutionImage;
      parts.push({ inlineData: { data, mimeType: imageMimeType } });
    }

    const solutionText = userSolution?.trim()
      ? `\nLösung des Schülers: ${userSolution}`
      : (userSolutionImage ? '\nDer Schüler hat seine Lösung als Bild eingereicht (siehe oben).' : '\nKeine Lösung eingereicht.');

    parts.push({ text: `Aufgabe: ${taskText}${solutionText}` });

    const response = await ai.models.generateContent({
      model: modelId,
      contents: { role: 'user', parts },
      config: {
        systemInstruction: PRACTICE_CHECK_PROMPT,
        thinkingConfig: { thinkingBudget: 4096 },
        maxOutputTokens: 4096,
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            isCorrect: { type: Type.BOOLEAN },
            feedback: { type: Type.STRING }
          },
          required: ["isCorrect", "feedback"]
        }
      }
    });

    const parsed = extractJson(response);

    return {
      isCorrect: !!parsed.isCorrect,
      feedback: parsed.feedback || "Keine Details verfügbar."
    };
  } catch (error: any) {
    console.error("Practice Check Error:", error);
    throw new Error(error?.message || "Lösung konnte nicht überprüft werden.");
  }
};

export const solvePracticeTask = async (
  taskText: string
): Promise<MathSolution> => {
  try {
    const ai = new GoogleGenAI({ apiKey: getApiKey() });
    const modelId = 'gemini-3-pro-preview';
    return await generateClassicSolution(ai, modelId, `Löse folgende Aufgabe Schritt für Schritt:\n\n${taskText}`);
  } catch (error: any) {
    console.error("Practice Solve Error:", error);
    throw new Error(error?.message || "Lösung konnte nicht erstellt werden.");
  }
};

export interface SolveMathOptions {
  onTutorProgress?: (partialSolution: MathSolution) => void;
}

const generateTutorLearningPathProgressive = async (
  ai: GoogleGenAI,
  modelId: string,
  topic: string,
  onProgress: (partialSolution: MathSolution) => void
): Promise<MathSolution> => {
  const outline = await generateTutorOutline(ai, modelId, topic);
  const limitedSections = outline.sections.slice(0, 10);

  if (!limitedSections.length) {
    throw new Error("Es konnten keine Lektionen für den Tutor-Lernpfad erstellt werden.");
  }

  const steps: SolutionStep[] = limitedSections.map((section) => ({
    title: section.title,
    explanation: '',
    formulas: [],
    substeps: [],
    loading: true
  }));

  const initialSolution: MathSolution = {
    steps,
    finalAnswer: 'Lernpfad wird erstellt…'
  };
  onProgress(initialSolution);

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

    const lessonSubsteps: SolutionStep[] = Array.isArray(lesson.substeps)
      ? lesson.substeps.map((substep) => ({
          title: substep.title,
          explanation: substep.explanation,
          formulas: substep.formulas
        }))
      : [];

    steps[i] = {
      title: lesson.title,
      explanation: lesson.takeaway,
      formulas: [],
      substeps: lessonSubsteps
    };

    takeaways.push(lesson.takeaway);
    onProgress({ steps: [...steps], finalAnswer: initialSolution.finalAnswer });
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

  const completeSolution: MathSolution = { steps, finalAnswer };
  onProgress(completeSolution);
  return completeSolution;
};

export const solveMathProblem = async (
  promptText: string,
  imageBase64?: string,
  mimeType: string = 'image/jpeg',
  mode: InputMode = InputMode.TEXT,
  options?: SolveMathOptions
): Promise<MathSolution> => {
  try {
    const ai = new GoogleGenAI({ apiKey: getApiKey() });
    const modelId = 'gemini-3-pro-preview';

    if (mode === InputMode.TUTOR) {
      if (options?.onTutorProgress) {
        return await generateTutorLearningPathProgressive(ai, modelId, promptText, options.onTutorProgress);
      }
      return await generateTutorLearningPath(ai, modelId, promptText);
    }

    return await generateClassicSolution(ai, modelId, promptText, imageBase64, mimeType);
  } catch (error: any) {
    console.error("Gemini API Error:", error);
    const rawMessage: string = error?.message || "";
    const isHighDemand =
      error?.error?.code === 503 ||
      error?.error?.status === "UNAVAILABLE" ||
      rawMessage.includes("high demand") ||
      rawMessage.includes("UNAVAILABLE") ||
      rawMessage.includes("503");

    if (isHighDemand) {
      throw new Error(
        "Das Gemini‑Modell ist gerade stark ausgelastet (503 / \"high demand\"). Bitte versuche es in ein paar Sekunden erneut – die Überlastung ist normalerweise nur vorübergehend."
      );
    }

    throw new Error(rawMessage || "Ein Fehler ist bei der Anfrage aufgetreten.");
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
