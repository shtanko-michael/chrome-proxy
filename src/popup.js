let proxies = [];
let selectedProxyId = "";
let enabled = false;
let excludedDomainCount = 0;

document.addEventListener("DOMContentLoaded", initialize);

async function initialize() {
    const [syncConfig, localConfig] = await Promise.all([
        chrome.storage.sync.get({ proxies: [] }),
        chrome.storage.local.get({ enabled: false, activeProxyId: "", excludedDomains: [] })
    ]);
    proxies = Array.isArray(syncConfig.proxies) ? syncConfig.proxies : [];
    const storedProxyExists = proxies.some((proxy) => proxy.id === localConfig.activeProxyId);
    selectedProxyId = storedProxyExists ? localConfig.activeProxyId : (proxies[0]?.id || "");
    enabled = !!localConfig.enabled && storedProxyExists;
    excludedDomainCount = Array.isArray(localConfig.excludedDomains) ? localConfig.excludedDomains.length : 0;

    const toggle = document.getElementById("proxyToggle");
    toggle.checked = enabled;
    toggle.disabled = proxies.length === 0;
    renderProxyList();
    updateState();
    document.getElementById("exclusionsLabel").textContent = formatExclusions(excludedDomainCount);

    if (!proxies.length) {
        showHint("Добавьте хотя бы один маршрут в настройках.");
    } else {
        showHint("");
        if (!storedProxyExists) {
            await chrome.runtime.sendMessage({ action: "setActiveProxy", proxyId: selectedProxyId });
        }
    }

    toggle.addEventListener("change", toggleProxy);
    document.getElementById("settings").addEventListener("click", () => chrome.runtime.openOptionsPage());
    document.getElementById("exclusions").addEventListener("click", () => chrome.runtime.openOptionsPage());
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
    showHint("");
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
    showHint("");
}

function renderProxyList() {
    const list = document.getElementById("proxyList");
    list.replaceChildren();
    if (!proxies.length) {
        const empty = document.createElement("div");
        empty.className = "empty-list";
        empty.textContent = "Маршруты не настроены";
        list.appendChild(empty);
        return;
    }

    for (const proxy of proxies) {
        const button = document.createElement("button");
        button.type = "button";
        button.className = "route-card";
        button.classList.toggle("selected", proxy.id === selectedProxyId);
        button.classList.toggle("active", enabled && proxy.id === selectedProxyId);
        button.dataset.proxyId = proxy.id;

        const icon = createRouteIcon();

        const info = document.createElement("span");
        info.className = "route-info";
        const name = document.createElement("span");
        name.className = "route-name";
        name.textContent = proxy.name;
        const state = document.createElement("span");
        state.className = "route-state";
        const isActive = enabled && proxy.id === selectedProxyId;
        const stateText = isActive ? "Активен" : (proxy.id === selectedProxyId ? "Выбран" : "Не выбран");
        if (isActive) {
            const dot = document.createElement("span");
            dot.className = "state-dot";
            state.appendChild(dot);
        }
        state.appendChild(document.createTextNode(stateText));
        info.append(name, state);

        const action = document.createElement("span");
        action.className = "route-action";
        action.textContent = isActive ? "" : "Выбрать";
        action.classList.toggle("is-active", isActive);

        button.append(icon, info, action);
        button.addEventListener("click", () => selectProxy(proxy.id));
        list.appendChild(button);
    }
}

function setControlsBusy(busy) {
    document.getElementById("proxyToggle").disabled = busy || proxies.length === 0;
    for (const button of document.querySelectorAll(".route-card")) button.disabled = busy;
}

function updateState() {
    const selected = proxies.find((proxy) => proxy.id === selectedProxyId);
    document.getElementById("status").textContent = enabled && selected
        ? `Активный маршрут: ${selected.name}`
        : "Маршрутизация выключена";
    document.getElementById("toggleState").textContent = enabled ? "Включено" : "Выключено";
    renderProxyList();
}

function formatExclusions(count) {
    const remainder = count % 100;
    const lastDigit = count % 10;
    const word = remainder >= 11 && remainder <= 14
        ? "доменов"
        : (lastDigit === 1 ? "домен" : (lastDigit >= 2 && lastDigit <= 4 ? "домена" : "доменов"));
    return `Исключения: ${count} ${word}`;
}

function createRouteIcon() {
    const namespace = "http://www.w3.org/2000/svg";
    const icon = document.createElementNS(namespace, "svg");
    icon.setAttribute("class", "route-symbol");
    icon.setAttribute("viewBox", "0 0 24 24");
    icon.setAttribute("aria-hidden", "true");

    for (const [tag, attributes] of [
        ["circle", { cx: "6", cy: "6", r: "2.5" }],
        ["circle", { cx: "18", cy: "12", r: "2.5" }],
        ["circle", { cx: "7", cy: "18", r: "2.5" }],
        ["path", { d: "M8 7.5 15.8 10.7M7 8.5v7M9.2 17.2l6.6-3.8" }]
    ]) {
        const element = document.createElementNS(namespace, tag);
        for (const [name, value] of Object.entries(attributes)) element.setAttribute(name, value);
        icon.appendChild(element);
    }
    return icon;
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
