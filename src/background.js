let proxies = [];
let enabled = false;
let activeProxyId = "";
let allowedDomains = [];

const CONTEXT_MENU_ID = "toggle-domain-exclusion";
const HAS_CONTEXT_MENUS = !!(chrome.contextMenus && chrome.contextMenus.create);
const HAS_TABS = !!(chrome.tabs && chrome.tabs.query);
const ready = initialize();

async function initialize() {
    const [syncConfig, localConfig] = await Promise.all([
        chrome.storage.sync.get({ proxies: [], proxyUrl: "" }),
        chrome.storage.local.get({ allowedDomains: [], enabled: false, activeProxyId: "" })
    ]);
    proxies = normalizeProxies(syncConfig.proxies);
    allowedDomains = localConfig.allowedDomains || [];
    enabled = !!localConfig.enabled;
    activeProxyId = localConfig.activeProxyId || "";

    if (!proxies.length && parseProxyUrl(syncConfig.proxyUrl)) {
        const migrated = { id: createId(), name: "Основной сервер", url: syncConfig.proxyUrl };
        proxies = [migrated];
        activeProxyId = migrated.id;
        await Promise.all([
            chrome.storage.sync.set({ proxies }),
            chrome.storage.local.set({ activeProxyId })
        ]);
    }

    if (enabled && getActiveProxy()) {
        await enableProxy();
    } else {
        if (enabled) {
            enabled = false;
            await chrome.storage.local.set({ enabled: false });
        }
        await disableProxy();
    }
}

function createId() {
    return `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function normalizeProxies(value) {
    if (!Array.isArray(value)) return [];
    return value.filter((item) =>
        item && typeof item.id === "string" && typeof item.name === "string" && parseProxyUrl(item.url)
    );
}

function getActiveProxy() {
    return proxies.find((proxy) => proxy.id === activeProxyId) || null;
}

function ensureContextMenu() {
    if (!HAS_CONTEXT_MENUS) return;
    chrome.contextMenus.removeAll(() => {
        chrome.contextMenus.create({
            id: CONTEXT_MENU_ID,
            title: "Добавить текущий домен в список прокси",
            contexts: ["action"]
        });
    });
}
ensureContextMenu();

function getActiveTabDomain(callback) {
    if (!HAS_TABS) return callback("");
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        const url = tabs && tabs[0] && tabs[0].url;
        if (!url) return callback("");
        try {
            callback(new URL(url).hostname || "");
        } catch (e) {
            callback("");
        }
    });
}

function updateContextMenuTitle(domain) {
    if (!HAS_CONTEXT_MENUS) return;
    const inList = domain && allowedDomains.includes(domain);
    chrome.contextMenus.update(CONTEXT_MENU_ID, {
        title: inList ? "Удалить домен из списка прокси" : "Добавить текущий домен в список прокси"
    });
}

function refreshMenuForActiveTab() {
    getActiveTabDomain(updateContextMenuTitle);
}

function buildPacScript(parsed) {
    const domains = Array.from(new Set(allowedDomains.map((item) => String(item).toLowerCase())));
    const proxyMap = { socks5: "SOCKS5", socks5h: "SOCKS5", http: "PROXY", https: "HTTPS" };
    const proxyDirective = `${proxyMap[parsed.scheme]} ${parsed.host}:${parsed.port}`;
    return `
function FindProxyForURL(url, host) {
    var list = ${JSON.stringify(domains)};
    if (list.length === 0) return "${proxyDirective}";
    host = (host || "").toLowerCase();
    for (var i = 0; i < list.length; i++) {
        var d = list[i];
        if (host === d || host.endsWith("." + d)) return "${proxyDirective}";
    }
    return "DIRECT";
}
`.trim();
}

async function enableProxy() {
    const proxy = getActiveProxy();
    const parsed = proxy && parseProxyUrl(proxy.url);
    if (!parsed) {
        enabled = false;
        await chrome.storage.local.set({ enabled: false });
        return disableProxy();
    }
    await chrome.proxy.settings.set({
        value: { mode: "pac_script", pacScript: { data: buildPacScript(parsed) } },
        scope: "regular"
    });
    await chrome.action.setBadgeText({ text: "ON" });
    await chrome.action.setBadgeBackgroundColor({ color: "#00aa00" });
    await chrome.action.setTitle({ title: `Прокси: ${proxy.name}` });
}

async function disableProxy() {
    await chrome.proxy.settings.set({ value: { mode: "direct" }, scope: "regular" });
    await chrome.action.setBadgeText({ text: "" });
    await chrome.action.setTitle({ title: "SOCKS5 Proxy — выключен" });
}

chrome.runtime.onInstalled.addListener(ensureContextMenu);
chrome.runtime.onStartup.addListener(ensureContextMenu);

if (HAS_CONTEXT_MENUS) {
    if (chrome.contextMenus.onShown) chrome.contextMenus.onShown.addListener(refreshMenuForActiveTab);
    chrome.contextMenus.onClicked.addListener((info) => {
        if (info.menuItemId !== CONTEXT_MENU_ID) return;
        getActiveTabDomain(async (domain) => {
            if (!domain) return;
            const current = (await chrome.storage.local.get({ allowedDomains: [] })).allowedDomains || [];
            const next = current.includes(domain)
                ? current.filter((item) => item !== domain)
                : [...current, domain];
            await chrome.storage.local.set({ allowedDomains: next });
            updateContextMenuTitle(domain);
        });
    });
}

if (HAS_TABS) {
    chrome.tabs.onActivated.addListener(refreshMenuForActiveTab);
    chrome.tabs.onUpdated.addListener((tabId, changeInfo) => {
        if (changeInfo.status === "complete") refreshMenuForActiveTab();
    });
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (!message) return false;
    if (message.action === "setActiveProxy") {
        ready.then(async () => {
            const proxy = proxies.find((item) => item.id === message.proxyId);
            if (!proxy) throw new Error("Сервер не найден");
            activeProxyId = proxy.id;
            await chrome.storage.local.set({ activeProxyId });
            sendResponse({ ok: true, proxy });
        }).catch((error) => sendResponse({ ok: false, error: error.message }));
        return true;
    }
    if (message.action === "selectProxy") {
        ready.then(async () => {
            const proxy = proxies.find((item) => item.id === message.proxyId);
            if (!proxy) throw new Error("Сервер не найден");
            activeProxyId = proxy.id;
            enabled = true;
            await chrome.storage.local.set({ activeProxyId, enabled: true });
            await enableProxy();
            sendResponse({ ok: true, proxy });
        }).catch((error) => sendResponse({ ok: false, error: error.message }));
        return true;
    }
    if (message.action === "disableProxy") {
        ready.then(async () => {
            enabled = false;
            await chrome.storage.local.set({ enabled: false });
            await disableProxy();
            sendResponse({ ok: true });
        }).catch((error) => sendResponse({ ok: false, error: error.message }));
        return true;
    }
    if (message.action === "reloadProxy") {
        ready.then(async () => {
            if (enabled) await enableProxy();
            sendResponse({ ok: true });
        }).catch((error) => sendResponse({ ok: false, error: error.message }));
        return true;
    }
    return false;
});

chrome.storage.onChanged.addListener((changes, areaName) => {
    ready.then(async () => {
        if (areaName === "sync" && changes.proxies) {
            proxies = normalizeProxies(changes.proxies.newValue);
            if (!getActiveProxy()) {
                activeProxyId = "";
                enabled = false;
                await chrome.storage.local.set({ activeProxyId: "", enabled: false });
                await disableProxy();
            } else if (enabled) await enableProxy();
        }
        if (areaName === "local") {
            if (changes.allowedDomains) {
                allowedDomains = changes.allowedDomains.newValue || [];
                if (enabled) await enableProxy();
            }
            if (changes.activeProxyId) activeProxyId = changes.activeProxyId.newValue || "";
            if (changes.enabled) enabled = !!changes.enabled.newValue;
        }
    });
});

function parseProxyUrl(value) {
    if (!value) return null;
    try {
        const parsed = new URL(value);
        const scheme = parsed.protocol.replace(":", "");
        if (!["socks5", "socks5h", "http", "https"].includes(scheme)) return null;
        const host = parsed.hostname;
        const port = parsed.port ? parseInt(parsed.port, 10) : NaN;
        if (!host || !port || port < 1 || port > 65535) return null;
        return { scheme, host, port };
    } catch (e) {
        return null;
    }
}
