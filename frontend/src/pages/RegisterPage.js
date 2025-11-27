import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../auth/AuthContext";
export default function RegisterPage() {
    const { register } = useAuth();
    const navigate = useNavigate();
    const [form, setForm] = useState({ username: "", email: "", password: "" });
    const [error, setError] = useState(null);
    const [loading, setLoading] = useState(false);
    const handleSubmit = async (event) => {
        event.preventDefault();
        setLoading(true);
        setError(null);
        try {
            await register(form);
            navigate("/app");
        }
        catch (err) {
            setError(err instanceof Error ? err.message : "Не удалось создать аккаунт");
        }
        finally {
            setLoading(false);
        }
    };
    return (_jsx("div", { className: "auth-screen", children: _jsxs("div", { className: "auth-card", children: [_jsx("h1", { children: "\u0420\u0435\u0433\u0438\u0441\u0442\u0440\u0430\u0446\u0438\u044F \u2728" }), _jsx("p", { children: "\u0421\u043E\u0437\u0434\u0430\u0439\u0442\u0435 \u0443\u0447\u0435\u0442\u043D\u0443\u044E \u0437\u0430\u043F\u0438\u0441\u044C, \u0447\u0442\u043E\u0431\u044B \u0443\u043F\u0440\u0430\u0432\u043B\u044F\u0442\u044C \u0437\u0430\u043C\u0435\u0442\u043A\u0430\u043C\u0438." }), _jsxs("form", { onSubmit: handleSubmit, className: "auth-form", children: [_jsxs("label", { children: ["\u0418\u043C\u044F \u043F\u043E\u043B\u044C\u0437\u043E\u0432\u0430\u0442\u0435\u043B\u044F", _jsx("input", { type: "text", value: form.username, onChange: (e) => setForm((prev) => ({ ...prev, username: e.target.value })), required: true })] }), _jsxs("label", { children: ["Email", _jsx("input", { type: "email", value: form.email, onChange: (e) => setForm((prev) => ({ ...prev, email: e.target.value })), required: true })] }), _jsxs("label", { children: ["\u041F\u0430\u0440\u043E\u043B\u044C", _jsx("input", { type: "password", value: form.password, onChange: (e) => setForm((prev) => ({ ...prev, password: e.target.value })), required: true, minLength: 6 })] }), error && _jsx("p", { className: "form-error", children: error }), _jsx("button", { type: "submit", className: "btn primary", disabled: loading, children: loading ? "Создаём..." : "Зарегистрироваться" })] }), _jsxs("p", { className: "auth-hint", children: ["\u0423\u0436\u0435 \u0435\u0441\u0442\u044C \u0430\u043A\u043A\u0430\u0443\u043D\u0442? ", _jsx(Link, { to: "/login", children: "\u0412\u043E\u0439\u0442\u0438" })] })] }) }));
}
