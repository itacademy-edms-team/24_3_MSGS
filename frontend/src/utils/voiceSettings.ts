const STORAGE_KEY = "notes-app-voice-always-listen";

export const VOICE_SETTINGS_CHANGED_EVENT = "notes-voice-settings-changed";

export function getAlwaysListenEnabled(): boolean {
  if (typeof window === "undefined") return false;
  return localStorage.getItem(STORAGE_KEY) === "true";
}

export function setAlwaysListenEnabled(enabled: boolean): void {
  if (typeof window === "undefined") return;
  localStorage.setItem(STORAGE_KEY, enabled ? "true" : "false");
  window.dispatchEvent(new CustomEvent(VOICE_SETTINGS_CHANGED_EVENT));
}
