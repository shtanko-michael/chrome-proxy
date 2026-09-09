let proxies = [];
let selectedProxyId = "";
let enabled = false;

document.addEventListener("DOMContentLoaded", initialize);

async function initialize() {
    const [syncConfig, localConfig] = await Promise.all([
        chrome.storage.sync.get({ proxies: [] }),
        chrome.storage.local.get({ enabled: false, activeProxyId: "" })
    ]);
    proxies = Array.isArray(syncConfig.proxies) ? syncConfig.proxies : [];
    const storedProxyExists = proxies.some((proxy) => proxy.id === localConfig.activeProxyId);
    selectedProxyId = storedProxyExists ? localConfig.activeProxyId : (proxies[0]?.id || "");
    enabled = !!localConfig.enabled && storedProxyExists;

    const toggle = document.getElementById("proxyToggle");
    toggle.checked = enabled;
    toggle.disabled = proxies.length === 0;
    renderProxyList();
    updateState();

    if (!proxies.length) {
        showHint("Добавьте хотя бы один сервер в настройках.");
    } else {
        showHint("Кликните по серверу, чтобы сразу подключиться.");
        if (!storedProxyExists) {
            await chrome.runtime.sendMessage({ action: "setActiveProxy", proxyId: selectedProxyId });
        }
    }

    toggle.addEventListener("change", toggleProxy);
    document.getElementById("settings").addEventListener("click", () => chrome.runtime.openOptionsPage());
}

async function toggleProxy() {
    const toggle = document.getElementById("proxyToggle");
    const requestedState = toggle.checked;
    setControlsBusy(true);
    const response = await sendMessage(requestedState
        ? { action: "selectProxy", proxyId: selectedProxyId }
        : { action: "disableProxy" });
    setControlsBusy(false);

    if (!response.ok) {
        toggle.checked = !requestedState;
        showHint(response.error, true);
        return;
    }
    enabled = requestedState;
    updateState();
    showHint(enabled ? "Прокси включен." : "Прокси выключен.");
}

async function selectProxy(proxyId) {
    if (proxyId === selectedProxyId && enabled) return;
    const previousId = selectedProxyId;
    selectedProxyId = proxyId;
    renderProxyList();
    setControlsBusy(true);
    const response = await sendMessage({ action: "selectProxy", proxyId });
    setControlsBusy(false);

    if (!response.ok) {
        selectedProxyId = previousId;
        renderProxyList();
        showHint(response.error, true);
        return;
    }
    enabled = true;
    document.getElementById("proxyToggle").checked = true;
    updateState();
    showHint("Подключение переключено.");
}

function renderProxyList() {
    const list = document.getElementById("proxyList");
    list.replaceChildren();
    if (!proxies.length) {
        const empty = document.createElement("div");
        empty.className = "empty-list";
        empty.textContent = "Серверы не настроены";
        list.appendChild(empty);
        return;
    }

    for (const proxy of proxies) {
        const button = document.createElement("button");
        button.type = "button";
        button.className = "proxy-item";
        button.classList.toggle("selected", proxy.id === selectedProxyId);
        button.classList.toggle("active", enabled && proxy.id === selectedProxyId);
        button.dataset.proxyId = proxy.id;

        const name = document.createElement("span");
        name.className = "proxy-name";
        name.textContent = proxy.name;
        const state = document.createElement("span");
        state.className = "proxy-state";
        state.textContent = enabled && proxy.id === selectedProxyId
            ? "Подключен"
            : (proxy.id === selectedProxyId ? "Выбран" : "Подключить");
        button.append(name, state);
        button.addEventListener("click", () => selectProxy(proxy.id));
        list.appendChild(button);
    }
}

function setControlsBusy(busy) {
    document.getElementById("proxyToggle").disabled = busy || proxies.length === 0;
    for (const button of document.querySelectorAll(".proxy-item")) button.disabled = busy;
}

function updateState() {
    const selected = proxies.find((proxy) => proxy.id === selectedProxyId);
    document.getElementById("status").textContent = enabled && selected
        ? `Подключен: ${selected.name}`
        : "Прокси выключен";
    document.getElementById("indicator").classList.toggle("active", enabled && !!selected);
    renderProxyList();
}

async function sendMessage(message) {
    try {
        const response = await chrome.runtime.sendMessage(message);
        return response?.ok ? response : { ok: false, error: response?.error || "Не удалось изменить подключение" };
    } catch (error) {
        return { ok: false, error: error.message || "Не удалось связаться с расширением" };
    }
}

function showHint(message, isError = false) {
    const hint = document.getElementById("hint");
    hint.textContent = message;
    hint.className = isError ? "hint error" : "hint";
}
