import { useCallback, useEffect, useRef, useState } from "react";

function getRecognitionConstructor(): (new () => SpeechRecognition) | null {
  if (typeof window === "undefined") return null;
  const w = window as Window & {
    SpeechRecognition?: new () => SpeechRecognition;
    webkitSpeechRecognition?: new () => SpeechRecognition;
  };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

const ERROR_MESSAGES: Record<string, string> = {
  "not-allowed": "Разрешите доступ к микрофону для голосового ввода",
  "audio-capture": "Микрофон недоступен",
  network: "Ошибка сети при распознавании речи",
  "service-not-allowed": "Распознавание речи недоступно в этом окружении"
};

export type UseVoiceDictationOptions = {
  lang?: string;
  onNotify?: (message: string) => void;
};

export type UseVoiceDictationResult = {
  supported: boolean;
  listening: boolean;
  toggle: () => void;
};

export function useVoiceDictation(
  onFinalTranscript: (text: string) => void,
  options?: UseVoiceDictationOptions
): UseVoiceDictationResult {
  const lang = options?.lang ?? "ru-RU";
  const onNotify = options?.onNotify;
  const [supported, setSupported] = useState(false);
  const [listening, setListening] = useState(false);
  const recognitionRef = useRef<SpeechRecognition | null>(null);
  const onFinalRef = useRef(onFinalTranscript);
  onFinalRef.current = onFinalTranscript;
  const onNotifyRef = useRef(onNotify);
  onNotifyRef.current = onNotify;

  useEffect(() => {
    const Ctor = getRecognitionConstructor();
    setSupported(!!Ctor);
    if (!Ctor) return;

    const rec = new Ctor();
    rec.continuous = true;
    rec.interimResults = true;
    rec.lang = lang;

    rec.onresult = (event: SpeechRecognitionEvent) => {
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const row = event.results[i];
        const alt = row?.[0];
        if (!alt) continue;
        if (row.isFinal) {
          const transcript = alt.transcript.trim();
          if (transcript) onFinalRef.current(transcript);
        }
      }
    };

    rec.onerror = (event: SpeechRecognitionErrorEvent) => {
      if (event.error === "aborted" || event.error === "no-speech") return;
      const msg = ERROR_MESSAGES[event.error] ?? `Распознавание речи: ${event.error}`;
      onNotifyRef.current?.(msg);
    };

    rec.onstart = () => setListening(true);
    rec.onend = () => setListening(false);

    recognitionRef.current = rec;

    return () => {
      try {
        rec.stop();
      } catch {
        /* уже остановлено */
      }
      recognitionRef.current = null;
    };
  }, [lang]);

  const toggle = useCallback(() => {
    const rec = recognitionRef.current;
    if (!rec) return;
    try {
      if (listening) {
        rec.stop();
      } else {
        rec.start();
      }
    } catch {
      setListening(false);
    }
  }, [listening]);

  return { supported, listening, toggle };
}
