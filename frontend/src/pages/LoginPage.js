import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../auth/AuthContext";
export default function LoginPage() {
    const { login } = useAuth();
    const navigate = useNavigate();
    const [form, setForm] = useState({ email: "", password: "" });
    const [error, setError] = useState(null);
    const [loading, setLoading] = useState(false);
    const handleSubmit = async (event) => {
        event.preventDefault();
        setLoading(true);
        setError(null);
        try {
            await login(form);
            navigate("/app");
        }
        catch (err) {
            setError(err instanceof Error ? err.message : "Не удалось войти");
        }
        finally {
            setLoading(false);
        }
    };
    return (_jsx("div", { className: "auth-screen", children: _jsxs("div", { className: "auth-card", children: [_jsx("h1", { children: "\u0414\u043E\u0431\u0440\u043E \u043F\u043E\u0436\u0430\u043B\u043E\u0432\u0430\u0442\u044C \uD83D\uDC4B" }), _jsx("p", { children: "\u0412\u043E\u0439\u0434\u0438\u0442\u0435, \u0447\u0442\u043E\u0431\u044B \u043F\u0440\u043E\u0434\u043E\u043B\u0436\u0438\u0442\u044C \u0440\u0430\u0431\u043E\u0442\u0443 \u0441 \u0437\u0430\u043C\u0435\u0442\u043A\u0430\u043C\u0438." }), _jsxs("form", { onSubmit: handleSubmit, className: "auth-form", children: [_jsxs("label", { children: ["Email", _jsx("input", { type: "email", value: form.email, onChange: (e) => setForm((prev) => ({ ...prev, email: e.target.value })), required: true })] }), _jsxs("label", { children: ["\u041F\u0430\u0440\u043E\u043B\u044C", _jsx("input", { type: "password", value: form.password, onChange: (e) => setForm((prev) => ({ ...prev, password: e.target.value })), required: true })] }), error && _jsx("p", { className: "form-error", children: error }), _jsx("button", { type: "submit", className: "btn primary", disabled: loading, children: loading ? "Входим..." : "Войти" })] }), _jsxs("p", { className: "auth-hint", children: ["\u041D\u0435\u0442 \u0430\u043A\u043A\u0430\u0443\u043D\u0442\u0430? ", _jsx(Link, { to: "/register", children: "\u0421\u043E\u0437\u0434\u0430\u0442\u044C \u0430\u043A\u043A\u0430\u0443\u043D\u0442" })] })] }) }));
}
