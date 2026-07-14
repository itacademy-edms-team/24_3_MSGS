import { describe, expect, it } from "vitest";
import { containsWakePhrase, stripWakePhrase } from "./voiceWakePhrase";

describe("voiceWakePhrase", () => {
  it("находит фразу активации", () => {
    expect(containsWakePhrase("Голосовой ввод, создай заметку")).toBe(true);
    expect(containsWakePhrase("голосовой помощник")).toBe(true);
    expect(containsWakePhrase("привет")).toBe(false);
  });

  it("убирает wake-фразу из текста", () => {
    expect(stripWakePhrase("Голосовой ввод, открой заметку Тест")).toBe(
      ", открой заметку Тест"
    );
    expect(stripWakePhrase("Голосовой ввод открой заметку Тест")).toBe(
      "открой заметку Тест"
    );
  });
});
