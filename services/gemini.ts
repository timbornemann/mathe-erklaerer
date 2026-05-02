import { GoogleGenAI, Type } from "@google/genai";
import {
  FormulaGenerationPayload,
  InputMode,
  MathSolution,
  PracticeTask,
  SolutionStep
} from "../types";
import { sanitizeFormulaPayload } from './formulaCollection';

const GRAPH_INSTRUCTIONS = `
GRAPH-OPTIONEN (nur wenn didaktisch sinnvoll):
- Graphen sind optional. Entscheide selbst, wann ein Graph das Verstaendnis verbessert.
- Fuer Ablauf- oder Beziehungsdiagramme: immer als Markdown-Codeblock mit Sprache "mermaid" (mit dreifachen Backticks).
- Fuer Funktionsgraphen: immer als Markdown-Codeblock mit Sprache "functionplot" (mit dreifachen Backticks).
- Bei Mermaid-Knotenlabels mit Sonderzeichen (z. B. "|", "★", ":", "->") immer quoted Labels verwenden (z. B. A["|"], B(("★"))).
- Der Inhalt im "functionplot"-Block muss gueltiges JSON sein.
- Erlaubte Varianten:
  - Kompakt: { "functions": [...], "xDomain"?: [min,max], "yDomain"?: [min,max], "grid"?: boolean, "title"?: string }
  - API-nah: { "data": [...], "xAxis"?: { "domain": [min,max] }, "yAxis"?: { "domain": [min,max] }, "grid"?: boolean, "title"?: string }
- In "functions" oder "data" muss jeder Eintrag ein Objekt sein und mindestens "fn" oder "points" enthalten.
- Nutze echte Zeilenumbrueche in den Codebloecken (kein "\\n" als sichtbarer Text).
- Mehrere Graphen sind erlaubt, wenn sie Zusammenhaenge, Aufbauten, Vergleiche oder Zwischenschritte klarer machen.
- Es gibt kein starres Limit; entscheide nach didaktischem Nutzen und Lesbarkeit.
`;

const SYSTEM_PROMPT = `
Du bist ein exzellenter Mathe-Tutor. Deine Aufgabe ist es, Aufgaben extrem detailliert in kleinen, logischen Einzelschritten zu loesen.

REGELN:
1. Zerlege die Loesung in sehr kleine Schritte. Jeder Rechenvorgang (Klammer aufloesen, Term umformen, Kuerzen, Einsetzen) ist ein eigener Schritt.
2. Erklaere jeden Schritt so, dass ein Schueler ihn sofort versteht.
3. Gib fuer jeden Schritt relevante Formeln an.
4. Nutze LaTeX Formatierung.
   - WICHTIG: In allen Textfeldern ('explanation', 'title', 'finalAnswer') MUSST du mathematische Ausdruecke (Variablen, Zahlen, Formeln) mit einfachen Dollarzeichen umschliessen (z. B. "Berechne $x^2$" oder "Loesung: $x=5$").
   - Im Array 'formulas' nutze KEINE Dollarzeichen, nur rohen LaTeX-Code.
   - Achte auf syntaktisch gueltiges LaTeX: Klammern muessen balanciert sein (insbesondere bei Makros wie \\text{...}).
5. Das Ausgabeformat muss striktes JSON sein.
${GRAPH_INSTRUCTIONS}

Struktur der Schritte:
- title: Kurze Ueberschrift was passiert (z. B. "Klammern aufloesen", "$x$ ausklammern")
- explanation: Ausfuehrliche textliche Erklaerung mit Inline-LaTeX ($...$), optional mit Graph-Codebloecken.
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
Du bist ein Meister-Tutor und schreibst EINE ausfuehrliche Lektion eines Lernpfads.

PFLICHT:
1. Erklaere das Thema der Lektion vollstaendig anfaengerverstaendlich.
2. Unterteile die Lektion in 4-8 kurze Lernschritte (substeps).
3. Jeder Lernschritt hat:
   - eine kurze Ueberschrift (title),
   - 1-3 Absaetze Erklaerung (explanation),
   - die genau zu diesem Schritt passenden Formeln (formulas) als LaTeX ohne Dollarzeichen.
4. Baue in die Lernschritte mindestens ein vollstaendig vorgerechnetes Beispiel ein.
5. Fuege mehrere Uebungsaufgaben mit steigender Schwierigkeit und direkt danach Musterloesungen ein (ebenfalls in Lernschritten).
6. In spaeteren Lektionen darf der Aufgabenanteil hoeher sein als der Erklaeranteil.
7. Nutze LaTeX:
   - In allen Erklaerungstexten mathematische Ausdruecke als $...$.
   - In formulas nur roher LaTeX ohne Dollarzeichen.
   - Achte auf syntaktisch gueltiges LaTeX: Klammern muessen balanciert sein (insbesondere bei Makros wie \\text{...}).
${GRAPH_INSTRUCTIONS}
8. Das Ausgabeformat ist striktes JSON mit:
   - title: string (Lektionstitel),
   - substeps: Array von Objekten { title, explanation, formulas },
   - takeaway: string (wichtigste Merksaetze).
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

  // Strip markdown code fences only when the whole payload is wrapped in one outer fence
  const fencedWholePayload = raw.match(/^```(?:json)?\s*[\r\n]+([\s\S]*?)\s*```$/i);
  if (fencedWholePayload) {
    raw = fencedWholePayload[1].trim();
  }

  try {
    return JSON.parse(raw);
  } catch (error) {
    console.error("Failed to parse model response as JSON:", raw.slice(0, 500));
    const parseMessage = error instanceof Error ? error.message : 'Unbekannter Parse-Fehler';
    throw new Error(`Die KI-Antwort konnte nicht verarbeitet werden (${parseMessage}). Bitte versuche es erneut.`);
  }
};

const wait = (ms: number) => new Promise<void>((resolve) => {
  globalThis.setTimeout(resolve, ms);
});

const isRetryableStructuredOutputError = (error: unknown): boolean => {
  const message = String((error as { message?: string } | undefined)?.message ?? '').toLowerCase();
  return (
    message.includes('json') ||
    message.includes('unterminated') ||
    message.includes('unexpected end') ||
    message.includes('could not be processed') ||
    message.includes('high demand') ||
    message.includes('unavailable') ||
    message.includes('503')
  );
};

const generateStructuredJson = async (
  ai: GoogleGenAI,
  model: string,
  contents: any,
  config: any,
  options?: { maxAttempts?: number; retryDelayMs?: number }
): Promise<any> => {
  const maxAttempts = Math.max(1, options?.maxAttempts ?? 3);
  const retryDelayMs = Math.max(0, options?.retryDelayMs ?? 450);
  let lastError: unknown;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const response = await ai.models.generateContent({
        model,
        contents,
        config
      });
      return extractJson(response);
    } catch (error) {
      lastError = error;
      const shouldRetry = attempt < maxAttempts && isRetryableStructuredOutputError(error);
      if (!shouldRetry) {
        throw error;
      }
      await wait(retryDelayMs * attempt);
    }
  }

  throw lastError instanceof Error ? lastError : new Error('Unbekannter Fehler bei der JSON-Generierung.');
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

  const parsed = await generateStructuredJson(
    ai,
    modelId,
    {
      role: 'user',
      parts
    },
    {
      systemInstruction: SYSTEM_PROMPT,
      thinkingConfig: {
        thinkingBudget: 4096,
      },
      maxOutputTokens: 8192,
      responseMimeType: "application/json",
      responseSchema: buildMathSchema()
    },
    { maxAttempts: 4, retryDelayMs: 600 }
  );

  return parsed as MathSolution;
};

const generateTutorOutline = async (
  ai: GoogleGenAI,
  modelId: string,
  topic: string
): Promise<TutorOutline> => {
  const parsed = await generateStructuredJson(
    ai,
    modelId,
    {
      role: 'user',
      parts: [{ text: `Thema des Lernpfads: ${topic}` }]
    },
    {
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
  );

  return parsed as TutorOutline;
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

  const parsed = await generateStructuredJson(
    ai,
    modelId,
    {
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
    {
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
    },
    { maxAttempts: 4, retryDelayMs: 600 }
  );

  return parsed as TutorSectionContent;
};

const buildTutorSectionFallback = (
  sectionTitle: string,
  sectionIndex: number,
  reason?: string
): TutorSectionContent => ({
  title: sectionTitle || `Lektion ${sectionIndex + 1}`,
  substeps: [
    {
      title: 'Vorlaeufige Platzhalter-Lektion',
      explanation:
        `Diese Lektion konnte in diesem Lauf nicht vollstaendig generiert werden.${reason ? ` Fehler: ${reason}` : ''} Starte den Tutor fuer dieses Thema erneut, um den Abschnitt sauber nachzuladen.`,
      formulas: []
    }
  ],
  takeaway:
    'Hinweis: Diese Lektion ist ein Platzhalter wegen eines technischen Generierungsfehlers.'
});

const toLessonSubsteps = (substeps: TutorSubstep[] | undefined): SolutionStep[] =>
  Array.isArray(substeps)
    ? substeps.map((substep) => ({
        title: substep.title,
        explanation: substep.explanation,
        formulas: Array.isArray(substep.formulas) ? substep.formulas : []
      }))
    : [];

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
  const sectionWarnings: string[] = [];

  for (let i = 0; i < limitedSections.length; i++) {
    const section = limitedSections[i];
    let lesson: TutorSectionContent;
    let generationError: string | undefined;
    try {
      lesson = await generateTutorSection(
        ai,
        modelId,
        topic,
        outline,
        section,
        i,
        limitedSections.length,
        takeaways.slice(-3)
      );
    } catch (error: any) {
      const reason = error?.message || 'Unbekannter Fehler';
      sectionWarnings.push(`Lektion ${i + 1}: ${reason}`);
      generationError = reason;
      lesson = buildTutorSectionFallback(section.title, i, reason);
    }

    const lessonSubsteps = toLessonSubsteps(lesson.substeps);
    const takeaway = typeof lesson.takeaway === 'string' && lesson.takeaway.trim() !== ''
      ? lesson.takeaway
      : `Lektion ${i + 1} abgeschlossen.`;

    steps.push({
      title: lesson.title,
      explanation: takeaway,
      formulas: [],
      substeps: lessonSubsteps,
      generationError
    });

    takeaways.push(takeaway);
  }

  const mastery = outline.masteryChecklist.length
    ? outline.masteryChecklist.map((point, idx) => `${idx + 1}. ${point}`).join('\n')
    : 'Arbeite die Lektionen erneut durch und löse zusätzliche Transferaufgaben.';

  const warningNote = sectionWarnings.length
    ? `\n\n**Technischer Hinweis:** ${sectionWarnings.length} Lektion(en) wurden als Platzhalter eingefuegt, weil die KI-Antwort dort ungueltiges JSON geliefert hat.`
    : '';

  const finalAnswer = `
**Lernpfad abgeschlossen: ${outline.courseTitle}**

Du hast jetzt einen vollständigen Lernpfad von den Grundlagen bis zu Spezialfällen.

**Mastery-Checkliste:**
${mastery}

${warningNote}

**Wiederholen & später ansehen:**
Dieser Lernpfad wurde in deinem Verlauf gespeichert. Öffne ihn jederzeit erneut und arbeite die Lektionen Schritt für Schritt durch.
`;

  return { steps, finalAnswer };
};

const PRACTICE_GENERATE_PROMPT = `
Du bist ein Mathe-Aufgaben-Generator. Deine Aufgabe ist es, eine einzelne Uebungsaufgabe zu erstellen.

REGELN:
1. Erstelle GENAU EINE Aufgabe passend zum angegebenen Thema und Schwierigkeitsgrad.
2. Die Aufgabe soll KURZ und PRAEGNANT formuliert sein - maximal 3-5 Saetze. Keine Teilaufgaben (a, b, c ...), keine langen Textaufgaben mit mehreren Absaetzen. Eine einzige, klare Fragestellung.
3. Die Aufgabe muss eine eindeutige Loesung haben.
4. Orientiere dich an den Beispielaufgaben des Nutzers bezueglich Stil, Umfang und Schwierigkeit.
5. Wiederhole KEINE der bereits gestellten Aufgaben - variiere Zahlen, Kontext und Struktur.
6. Nutze LaTeX fuer mathematische Ausdruecke: umschliesse sie mit $...$ im Text.
${GRAPH_INSTRUCTIONS}
7. Gib auch eine kurze Beschreibung des Aufgabentyps (max. 10 Woerter) fuer die Uebersicht.
8. Das Ausgabeformat muss striktes JSON sein.
`;

const PRACTICE_BATCH_PLAN_PROMPT = `
Du erstellst einen kurzen Aufgabenplan fuer ein Uebungspaket.

REGELN:
1. Plane genau so viele Aufgaben wie angefordert.
2. Jede Planposition soll klar unterschiedlich sein (anderer Fokus, anderer Aufgabentyp, andere typische Fehlerquelle).
3. Die geplanten Aufgaben muessen gemeinsam das gewuenschte Thema und Niveau sinnvoll abdecken.
4. Halte jeden Planpunkt kurz und konkret.
5. Kein Fliesstext ausserhalb von JSON.
`;

export interface PracticeTaskPlanItem {
  index: number;
  focus: string;
  skill: string;
  style: string;
  variation: string;
  promptHint: string;
}

export interface PlannedPracticeTask {
  taskText: string;
  description: string;
  plan: PracticeTaskPlanItem;
}

const normalizePlanItems = (items: any[], taskCount: number): PracticeTaskPlanItem[] => {
  const normalized: PracticeTaskPlanItem[] = [];
  for (let i = 0; i < taskCount; i++) {
    const item = items?.[i] ?? {};
    normalized.push({
      index: i + 1,
      focus: typeof item.focus === 'string' && item.focus.trim() !== '' ? item.focus.trim() : `Teilbereich ${i + 1}`,
      skill: typeof item.skill === 'string' && item.skill.trim() !== '' ? item.skill.trim() : 'Anwenden und erklaeren',
      style: typeof item.style === 'string' && item.style.trim() !== '' ? item.style.trim() : 'Rechenaufgabe',
      variation: typeof item.variation === 'string' && item.variation.trim() !== '' ? item.variation.trim() : 'Andere Zahlen und Kontext',
      promptHint:
        typeof item.promptHint === 'string' && item.promptHint.trim() !== ''
          ? item.promptHint.trim()
          : `Aufgabe ${i + 1} mit eigenem Fokus und klarer Variation`
    });
  }
  return normalized;
};

const PRACTICE_CHECK_PROMPT = `
Du bist ein Mathe-Korrektor. Deine Aufgabe ist es, die Loesung eines Schuelers zu ueberpruefen.

REGELN:
1. Vergleiche die Schuelerloesung mit der korrekten Loesung der Aufgabe.
2. Bewerte ob die Loesung korrekt ist (isCorrect: true/false).
3. Gib konstruktives Feedback:
   - Bei korrekter Loesung: Kurze Bestaetigung und ggf. Lob.
   - Bei falscher Loesung: Erklaere WAS falsch ist, aber verrate NICHT die vollstaendige Loesung. Gib einen Hinweis, wo der Fehler liegt.
4. Nutze LaTeX fuer mathematische Ausdruecke: $...$ im Feedback-Text.
${GRAPH_INSTRUCTIONS}
5. Sei ermutigend und paedagogisch wertvoll.
6. Das Ausgabeformat muss striktes JSON sein.
`;

const FORMULA_EXTRACT_PROMPT = `
Du extrahierst mathematische Formeln aus einer Chatnachricht.

REGELN:
1. Erkenne mathematische Formeln robust, auch wenn sie in normalem Text stehen.
2. Gib Formeln als reinen LaTeX-Text ohne Dollarzeichen aus.
3. Keine Duplikate.
4. Keine Erklaerung, nur JSON.
5. Format:
   {
     "formulas": ["..."]
   }
`;

const FORMULA_FROM_LATEX_PROMPT = `
Du erstellst einen professionellen Lernpfad zu EINER mathematischen Formel.

REGELN:
1. Erstelle didaktisch exzellente Inhalte auf Deutsch - kompakt, klar und ohne Dopplungen.
2. Die Formel selbst bleibt als roher LaTeX-String ohne Dollarzeichen.
3. Basisfelder:
   - title: kurzer, praeziser Titel
   - summary: 2-4 Saetze kompakter Ueberblick (Intuition, Einsatz, typische Stolperstelle)
   - tags: 3-8 thematische Tags (kleingeschrieben)
4. Erzeuge "learningPath" als didaktische Sequenz:
   - 6 bis 8 Lektionen
   - jede Lektion hat: title, goal, cards, takeaway
   - jede Lektion hat 3 bis 6 cards
   - jede card hat: title, explanation, formulas
5. Didaktik-Anforderungen:
   - rechnerisch kleinschrittig erklaeren
   - mehrere verschiedene Beispiele einbauen
   - mindestens 2 vollstaendig durchgerechnete Beispiele ueber den Lernpfad verteilt
   - typische Fehler und Grenzfaelle behandeln
6. Matheformat:
   - In explanation/goal/takeaway mathematische Inhalte mit $...$
   - In formulas nur roher LaTeX ohne Dollarzeichen
7. Kein Wiederholen derselben Aussage in verschiedenen Lektionen.
8. Gib strikt JSON aus.
`;

const FORMULA_FROM_PROMPT_PROMPT = `
Du beantwortest eine Nutzerfrage nach einer Formel und erzeugst einen professionellen Lernpfad.

REGELN:
1. Liefere genau EINE Hauptformel (roher LaTeX ohne Dollarzeichen).
2. Basis-Felder:
   - formula
   - title
   - summary (2-4 Saetze, kompakter Ueberblick)
   - tags
3. Erzeuge "learningPath" als didaktische Sequenz:
   - 6 bis 8 Lektionen
   - jede Lektion hat: title, goal, cards, takeaway
   - jede Lektion hat 3 bis 6 cards
   - jede card hat: title, explanation, formulas
4. Didaktik-Anforderungen:
   - rechnerisch kleinschrittig erklaeren
   - mehrere verschiedene Beispiele einbauen
   - mindestens 2 vollstaendig durchgerechnete Beispiele ueber den Lernpfad verteilt
   - typische Fehler und Grenzfaelle behandeln
5. Matheformat:
   - In explanation/goal/takeaway mathematische Inhalte mit $...$
   - In formulas nur roher LaTeX ohne Dollarzeichen
6. Schreibe auf Deutsch.
7. Kein Wiederholen derselben Aussage in verschiedenen Lektionen.
8. Ausgabe nur als valides JSON.
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

    const parsed = await generateStructuredJson(
      ai,
      modelId,
      {
        role: 'user',
        parts: [{ text: userPrompt }]
      },
      {
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
    );

    return {
      taskText: parsed.taskText || "Aufgabe konnte nicht gelesen werden.",
      description: parsed.description || ""
    };
  } catch (error: any) {
    console.error("Practice Generate Error:", error);
    throw new Error(error?.message || "Aufgabe konnte nicht erstellt werden.");
  }
};

export const generatePracticeTaskBatch = async (
  topic: string,
  difficulty: string,
  exampleTasks: string[],
  previousTasks: PracticeTask[],
  taskCount: number,
  additionalPrompt?: string
): Promise<{ plan: PracticeTaskPlanItem[]; tasks: PlannedPracticeTask[] }> => {
  const safeTaskCount = Math.max(1, Math.min(20, Math.floor(taskCount)));
  if (safeTaskCount === 1) {
    const single = await generatePracticeTask(topic, difficulty, exampleTasks, previousTasks, additionalPrompt);
    const singlePlan: PracticeTaskPlanItem = {
      index: 1,
      focus: 'Ausgewogenes Kernkonzept',
      skill: 'Grundidee anwenden',
      style: 'Kompakte Uebungsaufgabe',
      variation: 'Neu formuliert',
      promptHint: additionalPrompt?.trim() || 'Erzeuge eine passende Einzelaufgabe.'
    };
    return { plan: [singlePlan], tasks: [{ ...single, plan: singlePlan }] };
  }

  const ai = new GoogleGenAI({ apiKey: getApiKey() });
  const modelId = 'gemini-3-pro-preview';

  const examplesSection = exampleTasks.length
    ? `\nBeispielaufgaben:\n${exampleTasks.map((task, index) => `${index + 1}. ${task}`).join('\n')}`
    : '';

  const previousSection = previousTasks.length
    ? `\nBereits gestellte Aufgaben (nicht wiederholen):\n${previousTasks
        .map((task, index) => `${index + 1}. ${task.taskText}`)
        .join('\n')}`
    : '';

  const additionalSection = additionalPrompt?.trim()
    ? `\nZusatzwunsch: ${additionalPrompt.trim()}`
    : '';

  const plannedRaw = await generateStructuredJson(
    ai,
    modelId,
    {
      role: 'user',
      parts: [{
        text: `Thema: ${topic}
Schwierigkeit: ${difficulty}
Anzahl Aufgaben: ${safeTaskCount}${examplesSection}${previousSection}${additionalSection}

Erstelle einen kurzen Plan fuer ein differenziertes Uebungspaket.`
      }]
    },
    {
      systemInstruction: PRACTICE_BATCH_PLAN_PROMPT,
      thinkingConfig: { thinkingBudget: 2048 },
      maxOutputTokens: 4096,
      responseMimeType: 'application/json',
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          items: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                focus: { type: Type.STRING },
                skill: { type: Type.STRING },
                style: { type: Type.STRING },
                variation: { type: Type.STRING },
                promptHint: { type: Type.STRING }
              },
              required: ['focus', 'skill', 'style', 'variation', 'promptHint']
            }
          }
        },
        required: ['items']
      }
    }
  );

  const plan = normalizePlanItems(plannedRaw?.items ?? [], safeTaskCount);
  const planOverview = plan
    .map((item) => `${item.index}. Fokus: ${item.focus}; Stil: ${item.style}; Variation: ${item.variation}`)
    .join('\n');

  const tasks = await Promise.all(
    plan.map(async (planItem, index) => {
      const planPrompt = [
        additionalPrompt?.trim() ? `Zusatzwunsch des Nutzers: ${additionalPrompt.trim()}` : '',
        `Gesamtplan fuer das Aufgabenpaket:\n${planOverview}`,
        `Aktueller Planpunkt (${index + 1}/${safeTaskCount}):`,
        `- Fokus: ${planItem.focus}`,
        `- Lernziel: ${planItem.skill}`,
        `- Stil: ${planItem.style}`,
        `- Variation: ${planItem.variation}`,
        `- Hinweis: ${planItem.promptHint}`,
        'Wichtig: Diese Aufgabe muss sich deutlich von den anderen Planpunkten unterscheiden.'
      ]
        .filter((part) => part.trim() !== '')
        .join('\n');

      const generated = await generatePracticeTask(
        topic,
        difficulty,
        exampleTasks,
        previousTasks,
        planPrompt
      );

      return {
        ...generated,
        plan: planItem
      };
    })
  );

  return { plan, tasks };
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

    const parsed = await generateStructuredJson(
      ai,
      modelId,
      { role: 'user', parts },
      {
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
    );

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

export const extractFormulasFromMessage = async (message: string): Promise<string[]> => {
  try {
    const text = message.trim();
    if (!text) return [];

    const ai = new GoogleGenAI({ apiKey: getApiKey() });
    const modelId = 'gemini-3-pro-preview';

    const parsed = await generateStructuredJson(
      ai,
      modelId,
      {
        role: 'user',
        parts: [{ text }]
      },
      {
        systemInstruction: FORMULA_EXTRACT_PROMPT,
        thinkingConfig: { thinkingBudget: 1024 },
        maxOutputTokens: 4096,
        responseMimeType: 'application/json',
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            formulas: {
              type: Type.ARRAY,
              items: { type: Type.STRING }
            }
          },
          required: ['formulas']
        }
      }
    );

    const formulas = Array.isArray(parsed?.formulas)
      ? parsed.formulas
          .filter((entry: unknown): entry is string => typeof entry === 'string')
          .map((entry: string) => entry.trim())
          .filter((entry: string) => entry.length > 0)
      : [];

    return Array.from(new Set(formulas));
  } catch (error: any) {
    console.error('Extract Formula Error:', error);
    throw new Error(error?.message || 'Formeln konnten nicht aus der Nachricht extrahiert werden.');
  }
};

export const generateFormulaFromLatex = async (
  formula: string,
  contextText?: string
): Promise<FormulaGenerationPayload> => {
  try {
    const latex = formula.trim();
    if (!latex) {
      throw new Error('Leere Formel kann nicht verarbeitet werden.');
    }

    const ai = new GoogleGenAI({ apiKey: getApiKey() });
    const modelId = 'gemini-3-pro-preview';
    const prompt = contextText?.trim()
      ? `Formel: ${latex}\n\nZusatzkontext:\n${contextText.trim()}`
      : `Formel: ${latex}`;

    const parsed = await generateStructuredJson(
      ai,
      modelId,
      {
        role: 'user',
        parts: [{ text: prompt }]
      },
      {
        systemInstruction: FORMULA_FROM_LATEX_PROMPT,
        thinkingConfig: { thinkingBudget: 4096 },
        maxOutputTokens: 12288,
        responseMimeType: 'application/json',
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            title: { type: Type.STRING },
            summary: { type: Type.STRING },
            tags: { type: Type.ARRAY, items: { type: Type.STRING } },
            learningPath: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  title: { type: Type.STRING },
                  goal: { type: Type.STRING },
                  cards: {
                    type: Type.ARRAY,
                    items: {
                      type: Type.OBJECT,
                      properties: {
                        title: { type: Type.STRING },
                        explanation: { type: Type.STRING },
                        formulas: { type: Type.ARRAY, items: { type: Type.STRING } }
                      },
                      required: ['title', 'explanation', 'formulas']
                    }
                  },
                  takeaway: { type: Type.STRING }
                },
                required: ['title', 'goal', 'cards', 'takeaway']
              }
            }
          },
          required: ['title', 'summary', 'tags', 'learningPath']
        }
      }
    );

    return sanitizeFormulaPayload({ ...parsed, formula: latex });
  } catch (error: any) {
    console.error('Generate Formula From Latex Error:', error);
    throw new Error(error?.message || 'Formelkarte konnte nicht erzeugt werden.');
  }
};

export const generateFormulaFromPrompt = async (
  question: string
): Promise<FormulaGenerationPayload> => {
  try {
    const prompt = question.trim();
    if (!prompt) {
      throw new Error('Bitte gib eine Frage ein.');
    }

    const ai = new GoogleGenAI({ apiKey: getApiKey() });
    const modelId = 'gemini-3-pro-preview';

    const parsed = await generateStructuredJson(
      ai,
      modelId,
      {
        role: 'user',
        parts: [{ text: prompt }]
      },
      {
        systemInstruction: FORMULA_FROM_PROMPT_PROMPT,
        thinkingConfig: { thinkingBudget: 4096 },
        maxOutputTokens: 12288,
        responseMimeType: 'application/json',
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            formula: { type: Type.STRING },
            title: { type: Type.STRING },
            summary: { type: Type.STRING },
            tags: { type: Type.ARRAY, items: { type: Type.STRING } },
            learningPath: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  title: { type: Type.STRING },
                  goal: { type: Type.STRING },
                  cards: {
                    type: Type.ARRAY,
                    items: {
                      type: Type.OBJECT,
                      properties: {
                        title: { type: Type.STRING },
                        explanation: { type: Type.STRING },
                        formulas: { type: Type.ARRAY, items: { type: Type.STRING } }
                      },
                      required: ['title', 'explanation', 'formulas']
                    }
                  },
                  takeaway: { type: Type.STRING }
                },
                required: ['title', 'goal', 'cards', 'takeaway']
              }
            }
          },
          required: ['formula', 'title', 'summary', 'tags', 'learningPath']
        }
      }
    );

    return sanitizeFormulaPayload(parsed);
  } catch (error: any) {
    console.error('Generate Formula From Prompt Error:', error);
    throw new Error(error?.message || 'Formel konnte aus der Frage nicht erzeugt werden.');
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
  const sectionWarnings: string[] = [];

  for (let i = 0; i < limitedSections.length; i++) {
    const section = limitedSections[i];
    let lesson: TutorSectionContent;
    let generationError: string | undefined;
    try {
      lesson = await generateTutorSection(
        ai,
        modelId,
        topic,
        outline,
        section,
        i,
        limitedSections.length,
        takeaways.slice(-3)
      );
    } catch (error: any) {
      const reason = error?.message || 'Unbekannter Fehler';
      sectionWarnings.push(`Lektion ${i + 1}: ${reason}`);
      generationError = reason;
      lesson = buildTutorSectionFallback(section.title, i, reason);
    }

    const lessonSubsteps = toLessonSubsteps(lesson.substeps);
    const takeaway = typeof lesson.takeaway === 'string' && lesson.takeaway.trim() !== ''
      ? lesson.takeaway
      : `Lektion ${i + 1} abgeschlossen.`;

    steps[i] = {
      title: lesson.title,
      explanation: takeaway,
      formulas: [],
      substeps: lessonSubsteps,
      loading: false,
      generationError
    };

    takeaways.push(takeaway);
    onProgress({ steps: [...steps], finalAnswer: initialSolution.finalAnswer });
  }

  const mastery = outline.masteryChecklist.length
    ? outline.masteryChecklist.map((point, idx) => `${idx + 1}. ${point}`).join('\n')
    : 'Arbeite die Lektionen erneut durch und löse zusätzliche Transferaufgaben.';

  const warningNote = sectionWarnings.length
    ? `\n\n**Technischer Hinweis:** ${sectionWarnings.length} Lektion(en) wurden als Platzhalter eingefuegt, weil die KI-Antwort dort ungueltiges JSON geliefert hat.`
    : '';

  const finalAnswer = `
**Lernpfad abgeschlossen: ${outline.courseTitle}**

Du hast jetzt einen vollständigen Lernpfad von den Grundlagen bis zu Spezialfällen.

**Mastery-Checkliste:**
${mastery}

${warningNote}

**Wiederholen & später ansehen:**
Dieser Lernpfad wurde in deinem Verlauf gespeichert. Öffne ihn jederzeit erneut und arbeite die Lektionen Schritt für Schritt durch.
`;

  const completeSolution: MathSolution = { steps, finalAnswer };
  onProgress(completeSolution);
  return completeSolution;
};

const isRetryableTutorStep = (step: SolutionStep | undefined): boolean => {
  if (!step) return true;
  const generationError = typeof step.generationError === 'string' ? step.generationError.trim() : '';
  return step.loading === true || generationError.length > 0;
};

const sanitizeFormulas = (value: unknown): string[] =>
  Array.isArray(value) ? value.filter((entry): entry is string => typeof entry === 'string') : [];

const sanitizeSubsteps = (substeps: SolutionStep[] | undefined): SolutionStep[] | undefined => {
  if (!Array.isArray(substeps)) return undefined;
  return substeps.map((substep, index) => ({
    title: typeof substep.title === 'string' && substep.title.trim() !== '' ? substep.title : `Schritt ${index + 1}`,
    explanation: typeof substep.explanation === 'string' ? substep.explanation : '',
    formulas: sanitizeFormulas(substep.formulas),
    substeps: sanitizeSubsteps(substep.substeps),
    loading: substep.loading === true,
    generationError: typeof substep.generationError === 'string' ? substep.generationError : undefined
  }));
};

const normalizeTutorSteps = (steps: SolutionStep[]): SolutionStep[] =>
  steps.map((step, index) => ({
    title: typeof step.title === 'string' && step.title.trim() !== '' ? step.title : `Lektion ${index + 1}`,
    explanation: typeof step.explanation === 'string' ? step.explanation : '',
    formulas: sanitizeFormulas(step.formulas),
    substeps: sanitizeSubsteps(step.substeps),
    loading: step.loading === true,
    generationError: typeof step.generationError === 'string' ? step.generationError : undefined
  }));

const buildTutorFinalAnswerFromTopic = (topic: string, steps: SolutionStep[]): string => {
  const stepTitles = steps
    .map((step) => (typeof step.title === 'string' ? step.title.trim() : ''))
    .filter((title) => title.length > 0)
    .slice(0, 8);

  const coveredLessons = stepTitles.length
    ? stepTitles.map((title, index) => `${index + 1}. ${title}`).join('\n')
    : '1. Grundlagen\n2. Standardverfahren\n3. Vertiefung und Transfer';

  return `
**Lernpfad abgeschlossen: ${topic}**

Du hast die wichtigsten Inhalte in einer aufeinander aufbauenden Reihenfolge durchgearbeitet - von den Grundlagen bis zu fortgeschrittenen Anwendungen.

**Behandelte Lektionen:**
${coveredLessons}

Gehe fuer nachhaltiges Verstaendnis die Lektionen erneut durch und loese zusaetzliche Uebungsaufgaben.
`.trim();
};

export const resumeTutorSolution = async (
  topic: string,
  existingSolution: MathSolution,
  options?: SolveMathOptions
): Promise<MathSolution> => {
  const ai = new GoogleGenAI({ apiKey: getApiKey() });
  const modelId = 'gemini-3-pro-preview';

  const existingSteps = normalizeTutorSteps(Array.isArray(existingSolution.steps) ? existingSolution.steps : []);
  if (!existingSteps.length) {
    return await generateTutorLearningPathProgressive(ai, modelId, topic, (partial) => {
      options?.onTutorProgress?.(partial);
    });
  }

  const firstRetryIndex = existingSteps.findIndex((step) => isRetryableTutorStep(step));
  if (firstRetryIndex === -1) {
    return existingSolution;
  }

  const steps: SolutionStep[] = [...existingSteps];
  const outline: TutorOutline = {
    courseTitle: `Lernpfad: ${topic}`,
    learnerProfile: 'Fortsetzung eines bereits begonnenen Tutor-Lernpfads.',
    sections: steps.map((step, idx) => ({
      id: `resume-${idx + 1}`,
      title: step.title || `Lektion ${idx + 1}`,
      goals: [],
      focusLevel: 'Fortsetzung',
      specialCases: []
    })),
    masteryChecklist: []
  };

  const takeaways = steps
    .slice(0, firstRetryIndex)
    .map((step) => (typeof step.explanation === 'string' ? step.explanation.trim() : ''))
    .filter((entry) => entry.length > 0);

  const interimFinalAnswer =
    existingSolution.finalAnswer && existingSolution.finalAnswer.trim() !== ''
      ? existingSolution.finalAnswer
      : 'Lernpfad wird fortgesetzt...';

  options?.onTutorProgress?.({ steps: [...steps], finalAnswer: interimFinalAnswer });

  for (let i = firstRetryIndex; i < steps.length; i++) {
    if (!isRetryableTutorStep(steps[i])) {
      const takeaway = steps[i].explanation?.trim();
      if (takeaway) {
        takeaways.push(takeaway);
      }
      continue;
    }

    let lesson: TutorSectionContent;
    let generationError: string | undefined;

    try {
      lesson = await generateTutorSection(
        ai,
        modelId,
        topic,
        outline,
        outline.sections[i],
        i,
        steps.length,
        takeaways.slice(-3)
      );
    } catch (error: any) {
      const reason = error?.message || 'Unbekannter Fehler';
      generationError = reason;
      lesson = buildTutorSectionFallback(steps[i].title, i, reason);
    }

    const takeaway = typeof lesson.takeaway === 'string' && lesson.takeaway.trim() !== ''
      ? lesson.takeaway
      : `Lektion ${i + 1} abgeschlossen.`;
    const lessonSubsteps = toLessonSubsteps(lesson.substeps);

    steps[i] = {
      title: lesson.title || steps[i].title || `Lektion ${i + 1}`,
      explanation: takeaway,
      formulas: [],
      substeps: lessonSubsteps,
      loading: false,
      generationError
    };

    takeaways.push(takeaway);
    options?.onTutorProgress?.({ steps: [...steps], finalAnswer: interimFinalAnswer });
  }

  const existingFinalAnswer = typeof existingSolution.finalAnswer === 'string'
    ? existingSolution.finalAnswer.trim()
    : '';
  const existingLooksTechnical =
    /lernpfad aktualisiert|fortgesetzt|technischer hinweis|wird erstellt/i.test(existingFinalAnswer);
  const finalAnswer = existingFinalAnswer && !existingLooksTechnical
    ? existingFinalAnswer
    : buildTutorFinalAnswerFromTopic(topic, steps);

  const completeSolution: MathSolution = { steps, finalAnswer };
  options?.onTutorProgress?.(completeSolution);
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
Du bist ein hilfreicher Mathe-Tutor, der einem Schueler bei einer spezifischen Aufgabe hilft.
Der Schueler befindet sich gerade in einer Schritt-fuer-Schritt-Loesung.

KONTEXT:
Urspruengliche Aufgabe: "${context.initialPrompt}"

Aktueller Schritt (${context.stepIndex + 1}/${context.allSteps.length}):
Titel: ${context.currentStep.title}
Erklaerung: ${context.currentStep.explanation}
Formeln: ${context.currentStep.formulas.join(', ')}

Deine Aufgabe ist es, Fragen des Schuelers zu diesem spezifischen Schritt oder zum Gesamtverstaendnis zu beantworten.
- Antworte freundlich, geduldig und paedagogisch wertvoll.
- Nutze Markdown fuer die Formatierung (Fettgedruckt fuer wichtiges).
- Nutze LaTeX fuer mathematische Formeln.
  - WICHTIG: Umschliesse ALLE mathematischen Ausdruecke mit einfachen Dollarzeichen ($...$).
  - Beispiel: "Die Ableitung von $x^2$ ist $2x$."
${GRAPH_INSTRUCTIONS}
- Wenn der Nutzer nach dem naechsten Schritt fragt, kannst du einen Hinweis geben, aber verrate nicht sofort alles, wenn es dem Lernprozess schadet.
- Halte die Antworten praegnant, aber verstaendlich.
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
