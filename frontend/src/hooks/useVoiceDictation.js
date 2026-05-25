import { useCallback, useEffect, useRef, useState } from "react";
import { containsWakePhrase, stripWakePhrase } from "../utils/voiceWakePhrase";
function getRecognitionConstructor() {
    if (typeof window === "undefined")
        return null;
    const w = window;
    return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}
const ERROR_MESSAGES = {
    "not-allowed": "Разрешите доступ к микрофону для голосового ввода",
    "audio-capture": "Микрофон недоступен",
    network: "Ошибка сети при распознавании речи",
    "service-not-allowed": "Распознавание речи недоступно в этом окружении"
};
/** Пауза после последней распознанной фразы */
const SILENCE_AFTER_SPEECH_MS = 5000;
/** Время на начало речи после включения кнопки */
const INITIAL_LISTEN_MS = 12000;
const RESTART_DELAY_MS = 350;
export function useVoiceDictation(onFinalTranscript, options) {
    const lang = options?.lang ?? "ru-RU";
    const onNotify = options?.onNotify;
    const alwaysListen = options?.alwaysListen ?? false;
    const onWake = options?.onWake;
    const [supported, setSupported] = useState(false);
    const [listening, setListening] = useState(false);
    const [wakeListening, setWakeListening] = useState(false);
    const recognitionRef = useRef(null);
    const assistantActiveRef = useRef(false);
    const alwaysListenRef = useRef(alwaysListen);
    const intentionalStopRef = useRef(false);
    const pendingAssistantRestartRef = useRef(false);
    /** true после onstart, сбрасывается в onend — stop() без start() не вызывает onend */
    const recognitionRunningRef = useRef(false);
    const heardSpeechRef = useRef(false);
    const silenceTimerRef = useRef(null);
    const restartTimerRef = useRef(null);
    const onFinalRef = useRef(onFinalTranscript);
    onFinalRef.current = onFinalTranscript;
    const onNotifyRef = useRef(onNotify);
    onNotifyRef.current = onNotify;
    const onWakeRef = useRef(onWake);
    onWakeRef.current = onWake;
    alwaysListenRef.current = alwaysListen;
    const syncMicState = useCallback(() => {
        setListening(assistantActiveRef.current);
        setWakeListening(alwaysListenRef.current && !assistantActiveRef.current);
    }, []);
    const clearRestartTimer = useCallback(() => {
        if (restartTimerRef.current != null) {
            window.clearTimeout(restartTimerRef.current);
            restartTimerRef.current = null;
        }
    }, []);
    const clearSilenceTimer = useCallback(() => {
        if (silenceTimerRef.current != null) {
            window.clearTimeout(silenceTimerRef.current);
            silenceTimerRef.current = null;
        }
    }, []);
    const stopRecognition = useCallback(() => {
        const rec = recognitionRef.current;
        if (!rec)
            return;
        intentionalStopRef.current = true;
        try {
            rec.stop();
        }
        catch {
            intentionalStopRef.current = false;
        }
    }, []);
    const startRecognition = useCallback((wakeMode) => {
        const rec = recognitionRef.current;
        if (!rec)
            return;
        if (wakeMode && assistantActiveRef.current)
            return;
        if (!wakeMode && !assistantActiveRef.current)
            return;
        rec.continuous = true;
        try {
            rec.start();
        }
        catch {
            /* повторный start — перезапустим из onend */
        }
    }, []);
    const scheduleWakeRestart = useCallback(() => {
        if (!alwaysListenRef.current || assistantActiveRef.current)
            return;
        clearRestartTimer();
        restartTimerRef.current = window.setTimeout(() => {
            restartTimerRef.current = null;
            if (!alwaysListenRef.current || assistantActiveRef.current)
                return;
            startRecognition(true);
            syncMicState();
        }, RESTART_DELAY_MS);
    }, [clearRestartTimer, startRecognition, syncMicState]);
    const scheduleAssistantRestart = useCallback(() => {
        if (!assistantActiveRef.current)
            return;
        clearRestartTimer();
        restartTimerRef.current = window.setTimeout(() => {
            restartTimerRef.current = null;
            if (!assistantActiveRef.current)
                return;
            startRecognition(false);
        }, RESTART_DELAY_MS);
    }, [clearRestartTimer, startRecognition]);
    const endAssistantSession = useCallback((options) => {
        if (!assistantActiveRef.current)
            return;
        clearSilenceTimer();
        assistantActiveRef.current = false;
        heardSpeechRef.current = false;
        pendingAssistantRestartRef.current = false;
        syncMicState();
        if (options?.notify) {
            onNotifyRef.current?.("Голосовой ввод остановлен — нет речи");
        }
        if (alwaysListenRef.current) {
            if (options?.recognitionAlreadyStopped) {
                scheduleWakeRestart();
            }
            else {
                stopRecognition();
            }
        }
        else if (!options?.recognitionAlreadyStopped) {
            stopRecognition();
        }
    }, [clearSilenceTimer, scheduleWakeRestart, stopRecognition, syncMicState]);
    const armSilenceTimer = useCallback((ms) => {
        clearSilenceTimer();
        if (!assistantActiveRef.current)
            return;
        const delay = ms ?? (heardSpeechRef.current ? SILENCE_AFTER_SPEECH_MS : INITIAL_LISTEN_MS);
        silenceTimerRef.current = window.setTimeout(() => {
            silenceTimerRef.current = null;
            endAssistantSession({ notify: true });
        }, delay);
    }, [clearSilenceTimer, endAssistantSession]);
    const bumpSilenceTimer = useCallback(() => {
        if (assistantActiveRef.current) {
            heardSpeechRef.current = true;
            armSilenceTimer(SILENCE_AFTER_SPEECH_MS);
        }
    }, [armSilenceTimer]);
    const beginAssistantSession = useCallback((options) => {
        clearRestartTimer();
        heardSpeechRef.current = false;
        assistantActiveRef.current = true;
        syncMicState();
        if (options?.notifyWake !== false) {
            onWakeRef.current?.();
            onNotifyRef.current?.(options?.remainder
                ? "Голосовой помощник слушает команды…"
                : "Говорите — диктовка или команда…");
        }
        else {
            onNotifyRef.current?.("Диктовка включена");
        }
        armSilenceTimer(INITIAL_LISTEN_MS);
        const rec = recognitionRef.current;
        if (rec && recognitionRunningRef.current) {
            pendingAssistantRestartRef.current = true;
            intentionalStopRef.current = true;
            try {
                rec.stop();
            }
            catch {
                intentionalStopRef.current = false;
                pendingAssistantRestartRef.current = false;
                scheduleAssistantRestart();
            }
        }
        else {
            pendingAssistantRestartRef.current = false;
            scheduleAssistantRestart();
        }
        if (options?.remainder) {
            onFinalRef.current(options.remainder);
            heardSpeechRef.current = true;
            armSilenceTimer(SILENCE_AFTER_SPEECH_MS);
        }
    }, [armSilenceTimer, clearRestartTimer, scheduleAssistantRestart, syncMicState]);
    const activateAssistant = useCallback((remainder) => {
        if (!assistantActiveRef.current) {
            beginAssistantSession({ remainder, notifyWake: true });
        }
        else {
            bumpSilenceTimer();
            if (remainder) {
                onFinalRef.current(remainder);
                bumpSilenceTimer();
            }
        }
    }, [beginAssistantSession, bumpSilenceTimer]);
    const deactivateAssistant = useCallback(() => {
        endAssistantSession({ notify: false });
    }, [endAssistantSession]);
    useEffect(() => {
        const Ctor = getRecognitionConstructor();
        setSupported(!!Ctor);
        if (!Ctor)
            return;
        const rec = new Ctor();
        rec.continuous = true;
        rec.interimResults = true;
        rec.lang = lang;
        rec.onresult = (event) => {
            for (let i = event.resultIndex; i < event.results.length; i++) {
                const row = event.results[i];
                const alt = row?.[0];
                if (!alt)
                    continue;
                const transcript = alt.transcript.trim();
                if (!transcript)
                    continue;
                if (!assistantActiveRef.current) {
                    if (!alwaysListenRef.current)
                        continue;
                    if (!containsWakePhrase(transcript))
                        continue;
                    if (row.isFinal) {
                        const remainder = stripWakePhrase(transcript);
                        activateAssistant(remainder || undefined);
                    }
                    continue;
                }
                bumpSilenceTimer();
                if (row.isFinal) {
                    onFinalRef.current(transcript);
                }
            }
        };
        rec.onerror = (event) => {
            if (event.error === "aborted" || event.error === "no-speech")
                return;
            const msg = ERROR_MESSAGES[event.error] ?? `Распознавание речи: ${event.error}`;
            onNotifyRef.current?.(msg);
            if (event.error === "not-allowed") {
                intentionalStopRef.current = true;
                assistantActiveRef.current = false;
                heardSpeechRef.current = false;
                clearSilenceTimer();
                clearRestartTimer();
                syncMicState();
            }
        };
        rec.onstart = () => {
            recognitionRunningRef.current = true;
            intentionalStopRef.current = false;
            syncMicState();
            if (assistantActiveRef.current) {
                armSilenceTimer(heardSpeechRef.current ? SILENCE_AFTER_SPEECH_MS : INITIAL_LISTEN_MS);
            }
        };
        rec.onend = () => {
            recognitionRunningRef.current = false;
            if (intentionalStopRef.current) {
                intentionalStopRef.current = false;
                if (pendingAssistantRestartRef.current) {
                    pendingAssistantRestartRef.current = false;
                    scheduleAssistantRestart();
                    return;
                }
                if (alwaysListenRef.current && !assistantActiveRef.current) {
                    scheduleWakeRestart();
                }
                return;
            }
            if (assistantActiveRef.current) {
                scheduleAssistantRestart();
                return;
            }
            if (alwaysListenRef.current) {
                scheduleWakeRestart();
            }
            else {
                syncMicState();
            }
        };
        recognitionRef.current = rec;
        return () => {
            intentionalStopRef.current = true;
            pendingAssistantRestartRef.current = false;
            recognitionRunningRef.current = false;
            assistantActiveRef.current = false;
            heardSpeechRef.current = false;
            clearSilenceTimer();
            clearRestartTimer();
            try {
                rec.stop();
            }
            catch {
                /* уже остановлено */
            }
            recognitionRef.current = null;
        };
    }, [
        lang,
        activateAssistant,
        armSilenceTimer,
        bumpSilenceTimer,
        clearRestartTimer,
        clearSilenceTimer,
        endAssistantSession,
        scheduleAssistantRestart,
        scheduleWakeRestart,
        startRecognition,
        syncMicState
    ]);
    useEffect(() => {
        if (!supported)
            return;
        if (!alwaysListen) {
            clearRestartTimer();
            if (!assistantActiveRef.current) {
                stopRecognition();
                setWakeListening(false);
            }
            return;
        }
        if (!assistantActiveRef.current) {
            scheduleWakeRestart();
        }
        syncMicState();
    }, [alwaysListen, supported, scheduleWakeRestart, stopRecognition, syncMicState, clearRestartTimer]);
    const toggle = useCallback(() => {
        if (assistantActiveRef.current) {
            deactivateAssistant();
            return;
        }
        beginAssistantSession({ notifyWake: false });
    }, [beginAssistantSession, deactivateAssistant]);
    return { supported, listening, wakeListening, toggle };
}
