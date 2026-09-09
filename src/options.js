let proxies = [];
let editingId = "";

document.addEventListener("DOMContentLoaded", initialize);

async function initialize() {
    const [syncConfig, localConfig] = await Promise.all([
        chrome.storage.sync.get({ proxies: [] }),
        chrome.storage.local.get({ allowedDomains: [] })
    ]);
    proxies = Array.isArray(syncConfig.proxies) ? syncConfig.proxies : [];
    renderProxyList();
    renderDomainList(localConfig.allowedDomains || []);

    document.getElementById("saveProxy").addEventListener("click", saveProxy);
    document.getElementById("cancelEdit").addEventListener("click", resetProxyForm);
    document.getElementById("addDomain").addEventListener("click", addDomain);
    document.getElementById("domainInput").addEventListener("keydown", (event) => {
        if (event.key === "Enter") addDomain();
    });
    for (const id of ["proxyName", "proxyUrl"]) {
        document.getElementById(id).addEventListener("keydown", (event) => {
            if (event.key === "Enter") saveProxy();
        });
    }
}

async function saveProxy() {
    const name = document.getElementById("proxyName").value.trim();
    const url = document.getElementById("proxyUrl").value.trim();
    if (!name) return showStatus("Введите название сервера", "error");
    if (!parseProxyUrl(url)) return showStatus("Адрес должен иметь вид socks5://host:port", "error");

    const wasEditing = !!editingId;
    if (wasEditing) {
        proxies = proxies.map((proxy) => proxy.id === editingId ? { ...proxy, name, url } : proxy);
    } else {
        proxies.push({ id: createId(), name, url });
    }
    await chrome.storage.sync.set({ proxies });
    renderProxyList();
    resetProxyForm();
    showStatus(wasEditing ? "Сервер обновлен" : "Сервер добавлен", "success");
}

function editProxy(id) {
    const proxy = proxies.find((item) => item.id === id);
    if (!proxy) return;
    editingId = id;
    document.getElementById("proxyName").value = proxy.name;
    document.getElementById("proxyUrl").value = proxy.url;
    document.getElementById("saveProxy").textContent = "Сохранить изменения";
    document.getElementById("cancelEdit").hidden = false;
    document.getElementById("proxyName").focus();
}

async function removeProxy(id) {
    proxies = proxies.filter((proxy) => proxy.id !== id);
    await chrome.storage.sync.set({ proxies });
    if (editingId === id) resetProxyForm();
    renderProxyList();
    showStatus("Сервер удален", "success");
}

function resetProxyForm() {
    editingId = "";
    document.getElementById("proxyName").value = "";
    document.getElementById("proxyUrl").value = "";
    document.getElementById("saveProxy").textContent = "Добавить сервер";
    document.getElementById("cancelEdit").hidden = true;
}

function renderProxyList() {
    const list = document.getElementById("proxyList");
    list.replaceChildren();
    if (!proxies.length) return list.appendChild(emptyItem("Серверы пока не добавлены"));

    for (const proxy of proxies) {
        const item = document.createElement("li");
        const info = document.createElement("div");
        info.className = "server-info";
        const name = document.createElement("span");
        name.className = "server-name";
        name.textContent = proxy.name;
        const url = document.createElement("span");
        url.className = "server-url";
        url.textContent = proxy.url;
        info.append(name, url);

        const actions = document.createElement("div");
        actions.className = "item-actions";
        actions.append(
            makeButton("Изменить", "secondary", () => editProxy(proxy.id)),
            makeButton("Удалить", "danger", () => removeProxy(proxy.id))
        );
        item.append(info, actions);
        list.appendChild(item);
    }
}

async function addDomain() {
    const input = document.getElementById("domainInput");
    const normalized = normalizeDomain(input.value);
    if (!normalized) return showStatus("Введите корректный домен", "error");
    const current = await chrome.storage.local.get({ allowedDomains: [] });
    const domains = Array.from(new Set([...(current.allowedDomains || []), normalized]));
    await chrome.storage.local.set({ allowedDomains: domains });
    input.value = "";
    renderDomainList(domains);
    showStatus("Домен добавлен", "success");
}

async function removeDomain(domain) {
    const current = await chrome.storage.local.get({ allowedDomains: [] });
    const domains = (current.allowedDomains || []).filter((item) => item !== domain);
    await chrome.storage.local.set({ allowedDomains: domains });
    renderDomainList(domains);
    showStatus("Домен удален", "success");
}

function renderDomainList(domains) {
    const list = document.getElementById("domainList");
    list.replaceChildren();
    if (!domains.length) return list.appendChild(emptyItem("Список пуст"));
    for (const domain of [...domains].sort()) {
        const item = document.createElement("li");
        const name = document.createElement("span");
        name.className = "domain";
        name.textContent = domain;
        item.append(name, makeButton("Удалить", "danger", () => removeDomain(domain)));
        list.appendChild(item);
    }
}

function makeButton(text, className, handler) {
    const button = document.createElement("button");
    button.type = "button";
    button.textContent = text;
    button.className = className;
    button.addEventListener("click", handler);
    return button;
}

function emptyItem(text) {
    const item = document.createElement("li");
    item.className = "muted";
    item.textContent = text;
    return item;
}

function createId() {
    return `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function parseProxyUrl(value) {
    try {
        const parsed = new URL(value);
        const scheme = parsed.protocol.replace(":", "");
        const port = Number(parsed.port);
        return ["socks5", "socks5h", "http", "https"].includes(scheme)
            && !!parsed.hostname && Number.isInteger(port) && port >= 1 && port <= 65535;
    } catch (e) {
        return false;
    }
}

function normalizeDomain(value) {
    const raw = (value || "").trim().toLowerCase();
    if (!raw) return "";
    const cleaned = raw.replace(/^https?:\/\//, "").split("/")[0];
    return !cleaned || cleaned.includes(" ") ? "" : cleaned;
}

function showStatus(message, type) {
    const status = document.getElementById("status");
    status.textContent = message;
    status.className = type;
    clearTimeout(showStatus.timer);
    showStatus.timer = setTimeout(() => {
        status.textContent = "";
        status.className = "";
    }, 3000);
}
