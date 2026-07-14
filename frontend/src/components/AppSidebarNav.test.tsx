import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import AppSidebarNav from "./AppSidebarNav";

vi.mock("../auth/AuthContext", () => ({
  useAuth: () => ({
    user: { username: "tester", email: "tester@example.com" },
    logout: vi.fn()
  })
}));

describe("AppSidebarNav", () => {
  it("показывает пользователя и основные разделы", () => {
    render(
      <MemoryRouter>
        <AppSidebarNav />
      </MemoryRouter>
    );

    expect(screen.getByText("tester")).toBeInTheDocument();
    expect(screen.getByText("tester@example.com")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Заметки" })).toHaveAttribute("href", "/app");
    expect(screen.getByRole("link", { name: "Профиль" })).toHaveAttribute("href", "/profile");
    expect(screen.getByRole("button", { name: "Выйти" })).toBeInTheDocument();
  });
});
