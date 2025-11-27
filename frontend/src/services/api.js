const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? "https://localhost:7000/api";
async function request(path, options = {}) {
    const headers = {
        Accept: "application/json"
    };
    if (options.body) {
        headers["Content-Type"] = "application/json";
    }
    if (options.token) {
        headers.Authorization = `Bearer ${options.token}`;
    }
    const response = await fetch(`${API_BASE_URL}${path}`, {
        method: options.method ?? "GET",
        headers,
        body: options.body ? JSON.stringify(options.body) : undefined
    });
    if (response.status === 204) {
        return null;
    }
    if (!response.ok) {
        const message = await response.text();
        throw new Error(message || response.statusText);
    }
    return (await response.json());
}
export const api = {
    login: (payload) => request("/users/login", {
        method: "POST",
        body: payload
    }),
    register: (payload) => request("/users/register", {
        method: "POST",
        body: payload
    }),
    getNotes: (token) => request("/notes", {
        token
    }),
    createNote: (token, payload) => request("/notes", {
        method: "POST",
        token,
        body: payload
    }),
    updateNote: (token, id, payload) => request("/notes/" + id, {
        method: "PUT",
        token,
        body: {
            id,
            ...payload
        }
    }),
    deleteNote: (token, id) => request("/notes/" + id, {
        method: "DELETE",
        token
    }),
    getFolders: (token) => request("/folders", {
        token
    }),
    createFolder: (token, payload) => request("/folders", {
        method: "POST",
        token,
        body: payload
    }),
    updateFolder: (token, id, payload) => request("/folders/" + id, {
        method: "PUT",
        token,
        body: payload
    }),
    deleteFolder: (token, id) => request("/folders/" + id, {
        method: "DELETE",
        token
    })
};
