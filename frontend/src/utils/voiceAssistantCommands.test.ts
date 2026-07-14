import { describe, expect, it } from "vitest";
import {
  findNoteByTitle,
  looksLikeVoiceCommand,
  parseVoiceAssistantCommand,
  splitListItems
} from "./voiceAssistantCommands";
import type { Note } from "../types";

const sampleNotes: Note[] = [
  {
    id: 1,
    title: "Покупки",
    content: "",
    createdAt: "2026-01-01T00:00:00Z",
    updatedAt: "2026-01-02T00:00:00Z",
    folderId: null
  },
  {
    id: 2,
    title: "Покупки",
    content: "",
    createdAt: "2026-01-01T00:00:00Z",
    updatedAt: "2026-01-10T00:00:00Z",
    folderId: null
  }
];

describe("parseVoiceAssistantCommand", () => {
  it("распознаёт создание заметки", () => {
    const cmd = parseVoiceAssistantCommand('Создай заметку "Отчёт"');
    expect(cmd).toEqual({ type: "create", title: "Отчет" });
  });

  it("распознаёт открытие заметки", () => {
    const cmd = parseVoiceAssistantCommand("Открой заметку Покупки");
    expect(cmd).toEqual({ type: "open", title: "Покупки" });
  });

  it("распознаёт маркированный список", () => {
    const cmd = parseVoiceAssistantCommand("Добавь список молоко, хлеб, сыр");
    expect(cmd).toEqual({
      type: "bulletList",
      items: ["молоко", "хлеб", "сыр"]
    });
  });

  it("распознаёт жирный текст", () => {
    const cmd = parseVoiceAssistantCommand("Выдели жирным важное");
    expect(cmd).toEqual({ type: "bold", text: "важное" });
  });

  it("возвращает null для обычной фразы", () => {
    expect(parseVoiceAssistantCommand("просто текст без команды")).toBeNull();
  });
});

describe("looksLikeVoiceCommand", () => {
  it("определяет вероятную команду", () => {
    expect(looksLikeVoiceCommand("создай заметку")).toBe(true);
    expect(looksLikeVoiceCommand("привет мир")).toBe(false);
  });
});

describe("splitListItems", () => {
  it("разбивает пункты по запятой", () => {
    expect(splitListItems("один, два; три")).toEqual(["один", "два", "три"]);
  });
});

describe("findNoteByTitle", () => {
  it("выбирает недавно изменённую при одинаковых названиях", () => {
    const found = findNoteByTitle(sampleNotes, "Покупки");
    expect(found?.id).toBe(2);
  });

  it("возвращает null если не найдено", () => {
    expect(findNoteByTitle(sampleNotes, "Несуществующая")).toBeNull();
  });
});
