import { GoogleGenAI } from "@google/genai";

export const speakText = async (text: string): Promise<HTMLAudioElement> => {
  const getApiKey = () => {
    if (typeof window !== 'undefined') {
      const savedKey = localStorage.getItem('GEMINI_API_KEY');
      if (savedKey) return savedKey;

      const runtimeKey = (window as any).__APP_CONFIG__?.GEMINI_API_KEY;
      if (runtimeKey) return runtimeKey;
    }

    return import.meta.env.VITE_GEMINI_API_KEY || '';
  };

  const apiKey = getApiKey();
  if (!apiKey) {
    throw new Error("Kein API Key gefunden. Bitte API Key eingeben oder im Container als GEMINI_API_KEY setzen.");
  }

  // Clean Markdown for speech
  // Remove **bold**, *italic*, $latex$, headers, etc.
  const cleanText = text
    .replace(/\$\$(.*?)\$\$/g, 'Formel') // Replace complex display math with "Formel"
    .replace(/\$(.*?)\$/g, '$1') // Inline math might be readable if simple variables
    .replace(/\*\*(.*?)\*\*/g, '$1') // Bold
    .replace(/\*(.*?)\*/g, '$1') // Italic
    .replace(/#{1,6}\s/g, '') // Headers
    .replace(/\[(.*?)\]\(.*?\)/g, '$1') // Links
    .replace(/`/g, '') // Code ticks
    .trim();

  try {
    const ai = new GoogleGenAI({ apiKey });

    // Use Gemini 2.5 Flash TTS model
    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash-preview-tts",
      contents: [
        {
          parts: [
            { 
              text: `Sprich den folgenden Text auf freundliche, klare und pädagogische Weise auf Deutsch:\n\n${cleanText}` 
            }
          ]
        }
      ],
      config: {
        responseModalities: ["AUDIO"],
        speechConfig: {
          voiceConfig: {
            prebuiltVoiceConfig: {
              voiceName: 'Aoede' // Friendly, breezy German voice
            }
          }
        }
      }
    });

    // Extract audio data from response
    const audioData = response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
    
    if (!audioData) {
      throw new Error("Keine Audio-Daten in der API-Antwort erhalten.");
    }

    // Create audio element from base64 WAV data
    // The Gemini TTS API returns PCM audio at 24kHz, 16-bit, mono
    const audio = new Audio();
    
    // Convert base64 to blob for better handling
    const binaryString = atob(audioData);
    const bytes = new Uint8Array(binaryString.length);
    for (let i = 0; i < binaryString.length; i++) {
      bytes[i] = binaryString.charCodeAt(i);
    }
    
    // Create WAV header for PCM data (24kHz, 16-bit, mono)
    const wavBlob = createWavBlob(bytes, 24000, 1, 16);
    const audioUrl = URL.createObjectURL(wavBlob);
    
    audio.src = audioUrl;
    
    // Clean up blob URL when audio ends
    audio.onended = () => {
      URL.revokeObjectURL(audioUrl);
    };

    return audio;

  } catch (error: any) {
    console.error("Gemini TTS Error:", error);
    throw new Error(`TTS Fehler: ${error.message || 'Unbekannter Fehler'}`);
  }
};

// Helper function to create WAV file from PCM data
function createWavBlob(pcmData: Uint8Array, sampleRate: number, channels: number, bitsPerSample: number): Blob {
  const dataLength = pcmData.length;
  const buffer = new ArrayBuffer(44 + dataLength);
  const view = new DataView(buffer);

  // WAV header
  writeString(view, 0, 'RIFF');
  view.setUint32(4, 36 + dataLength, true);
  writeString(view, 8, 'WAVE');
  writeString(view, 12, 'fmt ');
  view.setUint32(16, 16, true); // fmt chunk size
  view.setUint16(20, 1, true); // PCM format
  view.setUint16(22, channels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * channels * bitsPerSample / 8, true); // byte rate
  view.setUint16(32, channels * bitsPerSample / 8, true); // block align
  view.setUint16(34, bitsPerSample, true);
  writeString(view, 36, 'data');
  view.setUint32(40, dataLength, true);

  // Copy PCM data
  const pcmView = new Uint8Array(buffer, 44);
  pcmView.set(pcmData);

  return new Blob([buffer], { type: 'audio/wav' });
}

function writeString(view: DataView, offset: number, string: string) {
  for (let i = 0; i < string.length; i++) {
    view.setUint8(offset + i, string.charCodeAt(i));
  }
}
