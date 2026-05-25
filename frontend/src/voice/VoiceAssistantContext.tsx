import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode
} from "react";
import { useNavigate } from "react-router-dom";
import { useVoiceDictation } from "../hooks/useVoiceDictation";
import {
  getAlwaysListenEnabled,
  setAlwaysListenEnabled,
  VOICE_SETTINGS_CHANGED_EVENT
} from "../utils/voiceSettings";

type VoiceAssistantContextValue = {
  supported: boolean;
  listening: boolean;
  wakeListening: boolean;
  alwaysListenEnabled: boolean;
  setAlwaysListenEnabled: (enabled: boolean) => void;
  toggleAssistant: () => void;
  registerTranscriptHandler: (handler: ((text: string) => void) | null) => void;
};

const VoiceAssistantContext = createContext<VoiceAssistantContextValue | undefined>(
  undefined
);

export function VoiceAssistantProvider({ children }: { children: ReactNode }) {
  const navigate = useNavigate();
  const [alwaysListenEnabled, setAlwaysListenState] = useState(getAlwaysListenEnabled);
  const [status, setStatus] = useState<string | null>(null);
  const handlerRef = useRef<((text: string) => void) | null>(null);

  const showStatus = useCallback((message: string, timeout = 4000) => {
    setStatus(message);
    if (timeout > 0) {
      window.setTimeout(() => setStatus(null), timeout);
    }
  }, []);

  useEffect(() => {
    const sync = () => setAlwaysListenState(getAlwaysListenEnabled());
    window.addEventListener(VOICE_SETTINGS_CHANGED_EVENT, sync);
    return () => window.removeEventListener(VOICE_SETTINGS_CHANGED_EVENT, sync);
  }, []);

  const setAlwaysListen = useCallback((enabled: boolean) => {
    setAlwaysListenEnabled(enabled);
    setAlwaysListenState(enabled);
  }, []);

  const routeTranscript = useCallback((text: string) => {
    handlerRef.current?.(text);
  }, []);

  const { supported, listening, wakeListening, toggle } = useVoiceDictation(routeTranscript, {
    lang: "ru-RU",
    alwaysListen: alwaysListenEnabled,
    onNotify: showStatus,
    onWake: () => {
      if (!handlerRef.current) {
        navigate("/app");
      }
    }
  });

  const registerTranscriptHandler = useCallback(
    (handler: ((text: string) => void) | null) => {
      handlerRef.current = handler;
    },
    []
  );

  const value = useMemo(
    () => ({
      supported,
      listening,
      wakeListening,
      alwaysListenEnabled,
      setAlwaysListenEnabled: setAlwaysListen,
      toggleAssistant: toggle,
      registerTranscriptHandler
    }),
    [
      supported,
      listening,
      wakeListening,
      alwaysListenEnabled,
      setAlwaysListen,
      toggle,
      registerTranscriptHandler
    ]
  );

  return (
    <VoiceAssistantContext.Provider value={value}>
      {children}
      {status && (
        <div className="toast">
          <span>{status}</span>
        </div>
      )}
    </VoiceAssistantContext.Provider>
  );
}

export function useVoiceAssistant() {
  const ctx = useContext(VoiceAssistantContext);
  if (!ctx) {
    throw new Error("useVoiceAssistant must be used within VoiceAssistantProvider");
  }
  return ctx;
}
