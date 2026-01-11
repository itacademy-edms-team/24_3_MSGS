import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../auth/AuthContext";
import { api } from "../services/api";
export default function FriendsPage() {
    const { user, token } = useAuth();
    const [friends, setFriends] = useState([]);
    const [pendingRequests, setPendingRequests] = useState([]);
    const [sentRequests, setSentRequests] = useState([]);
    const [usernameInput, setUsernameInput] = useState("");
    const [loading, setLoading] = useState(true);
    const [status, setStatus] = useState(null);
    const showStatus = (message, timeout = 4000) => {
        setStatus(message);
        if (timeout > 0) {
            setTimeout(() => setStatus(null), timeout);
        }
    };
    const loadData = useCallback(async () => {
        if (!token)
            return;
        try {
            const [friendsData, pendingData, allFriendships] = await Promise.all([
                api.getFriends(token),
                api.getPendingRequests(token),
                api.getFriendships(token)
            ]);
            setFriends(friendsData);
            setPendingRequests(pendingData);
            setSentRequests(allFriendships.filter((f) => f.status === "pending" && f.requesterId === user?.id));
        }
        catch (error) {
            showStatus(error instanceof Error ? error.message : "Ошибка загрузки данных", 6000);
        }
        finally {
            setLoading(false);
        }
    }, [token, user?.id]);
    useEffect(() => {
        setLoading(true);
        loadData();
    }, [loadData]);
    const handleSendRequest = async () => {
        if (!token || !usernameInput.trim())
            return;
        try {
            await api.sendFriendRequest(token, { username: usernameInput.trim() });
            setUsernameInput("");
            showStatus("Заявка отправлена");
            loadData();
        }
        catch (error) {
            showStatus(error instanceof Error ? error.message : "Ошибка отправки заявки", 6000);
        }
    };
    const handleAccept = async (id) => {
        if (!token)
            return;
        try {
            await api.acceptFriendRequest(token, id);
            showStatus("Заявка принята");
            loadData();
        }
        catch (error) {
            showStatus(error instanceof Error ? error.message : "Ошибка принятия заявки", 6000);
        }
    };
    const handleReject = async (id) => {
        if (!token)
            return;
        try {
            await api.rejectFriendRequest(token, id);
            showStatus("Заявка отклонена");
            loadData();
        }
        catch (error) {
            showStatus(error instanceof Error ? error.message : "Ошибка отклонения заявки", 6000);
        }
    };
    const handleDelete = async (id) => {
        if (!token)
            return;
        if (!confirm("Удалить из друзей?"))
            return;
        try {
            await api.deleteFriendship(token, id);
            showStatus("Удалено из друзей");
            loadData();
        }
        catch (error) {
            showStatus(error instanceof Error ? error.message : "Ошибка удаления", 6000);
        }
    };
    if (loading) {
        return (_jsxs("div", { className: "fullscreen-center", children: [_jsx("div", { className: "spinner" }), _jsx("p", { children: "\u0417\u0430\u0433\u0440\u0443\u0436\u0430\u0435\u043C \u0434\u0430\u043D\u043D\u044B\u0435..." })] }));
    }
    return (_jsxs("div", { className: "dashboard", children: [_jsxs("aside", { className: "sidebar", children: [_jsxs("div", { className: "user-card", children: [_jsxs("div", { children: [_jsx("p", { className: "user-name", children: user?.username }), _jsx("p", { className: "user-email", children: user?.email })] }), _jsxs("div", { style: { display: "flex", flexDirection: "column", gap: "0.5rem" }, children: [_jsx(Link, { to: "/app", className: "btn ghost", style: { textDecoration: "none", textAlign: "center" }, children: "\u0417\u0430\u043C\u0435\u0442\u043A\u0438" }), _jsx(Link, { to: "/chat", className: "btn ghost", style: { textDecoration: "none", textAlign: "center" }, children: "\u0427\u0430\u0442\u044B" })] })] }), _jsxs("div", { className: "sidebar-section", children: [_jsxs("div", { className: "section-header", children: [_jsx("h3", { children: "\u0414\u0440\u0443\u0437\u044C\u044F" }), _jsx("span", { className: "badge", children: friends.length })] }), _jsxs("div", { className: "folder-form", children: [_jsx("input", { type: "text", placeholder: "Username \u043F\u043E\u043B\u044C\u0437\u043E\u0432\u0430\u0442\u0435\u043B\u044F", value: usernameInput, onChange: (e) => setUsernameInput(e.target.value), onKeyPress: (e) => e.key === "Enter" && handleSendRequest() }), _jsx("button", { type: "button", className: "btn primary", onClick: handleSendRequest, children: "\u0414\u043E\u0431\u0430\u0432\u0438\u0442\u044C \u0432 \u0434\u0440\u0443\u0437\u044C\u044F" })] })] })] }), _jsxs("section", { className: "notes-panel", style: { width: "100%" }, children: [_jsx("header", { className: "panel-header", children: _jsx("div", { children: _jsx("h2", { children: "\u0414\u0440\u0443\u0437\u044C\u044F \u0438 \u0437\u0430\u044F\u0432\u043A\u0438" }) }) }), _jsxs("div", { style: { padding: "1.5rem", display: "flex", flexDirection: "column", gap: "2rem" }, children: [pendingRequests.length > 0 && (_jsxs("div", { children: [_jsxs("h3", { style: { marginBottom: "1rem", color: "#4c3df7" }, children: ["\u0412\u0445\u043E\u0434\u044F\u0449\u0438\u0435 \u0437\u0430\u044F\u0432\u043A\u0438 (", pendingRequests.length, ")"] }), _jsx("ul", { className: "notes-list", children: pendingRequests.map((request) => (_jsxs("li", { children: [_jsxs("div", { children: [_jsx("p", { className: "note-title", children: request.requesterUsername }), _jsxs("p", { className: "note-meta", children: ["\u0417\u0430\u044F\u0432\u043A\u0430 \u043E\u0442\u043F\u0440\u0430\u0432\u043B\u0435\u043D\u0430 ", new Date(request.createdAt).toLocaleString()] })] }), _jsxs("div", { style: { display: "flex", gap: "0.5rem" }, children: [_jsx("button", { className: "btn success", onClick: () => handleAccept(request.id), children: "\u041F\u0440\u0438\u043D\u044F\u0442\u044C" }), _jsx("button", { className: "btn ghost", onClick: () => handleReject(request.id), children: "\u041E\u0442\u043A\u043B\u043E\u043D\u0438\u0442\u044C" })] })] }, request.id))) })] })), sentRequests.length > 0 && (_jsxs("div", { children: [_jsxs("h3", { style: { marginBottom: "1rem", color: "#4c3df7" }, children: ["\u0418\u0441\u0445\u043E\u0434\u044F\u0449\u0438\u0435 \u0437\u0430\u044F\u0432\u043A\u0438 (", sentRequests.length, ")"] }), _jsx("ul", { className: "notes-list", children: sentRequests.map((request) => (_jsxs("li", { children: [_jsxs("div", { children: [_jsx("p", { className: "note-title", children: request.addresseeUsername }), _jsxs("p", { className: "note-meta", children: ["\u0417\u0430\u044F\u0432\u043A\u0430 \u043E\u0442\u043F\u0440\u0430\u0432\u043B\u0435\u043D\u0430 ", new Date(request.createdAt).toLocaleString()] })] }), _jsx("button", { className: "btn ghost", onClick: () => handleDelete(request.id), children: "\u041E\u0442\u043C\u0435\u043D\u0438\u0442\u044C" })] }, request.id))) })] })), _jsxs("div", { children: [_jsxs("h3", { style: { marginBottom: "1rem", color: "#4c3df7" }, children: ["\u0414\u0440\u0443\u0437\u044C\u044F (", friends.length, ")"] }), friends.length === 0 ? (_jsx("p", { className: "empty-state", children: "\u0423 \u0432\u0430\u0441 \u043F\u043E\u043A\u0430 \u043D\u0435\u0442 \u0434\u0440\u0443\u0437\u0435\u0439" })) : (_jsx("ul", { className: "notes-list", children: friends.map((friend) => {
                                            const friendship = [...pendingRequests, ...sentRequests].find((f) => (f.requesterId === friend.id || f.addresseeId === friend.id) &&
                                                f.status === "accepted");
                                            return (_jsxs("li", { children: [_jsxs("div", { children: [_jsx("p", { className: "note-title", children: friend.username }), _jsx("p", { className: "note-meta", children: friend.email })] }), _jsx("button", { className: "btn ghost", onClick: () => friendship && handleDelete(friendship.id), children: "\u0423\u0434\u0430\u043B\u0438\u0442\u044C" })] }, friend.id));
                                        }) }))] })] })] }), status && (_jsx("div", { className: "toast", children: _jsx("span", { children: status }) }))] }));
}
