let enabled = false;
let config = {
    proxyUrl: ""
};
let excludedDomains = [];
const CONTEXT_MENU_ID = "toggle-domain-exclusion";
const HAS_CONTEXT_MENUS = !!(chrome.contextMenus && chrome.contextMenus.create);
const HAS_TABS = !!(chrome.tabs && chrome.tabs.query);
let proxyConfig = null;

chrome.storage.sync.get(config, (saved) => {
    config = saved;
    proxyConfig = parseProxyUrl(config.proxyUrl);
});
chrome.storage.local.get({ excludedDomains: [] }, (saved) => {
    excludedDomains = saved.excludedDomains || [];
});

function ensureContextMenu() {
    if (!HAS_CONTEXT_MENUS) return;
    chrome.contextMenus.removeAll(() => {
        chrome.contextMenus.create({
            id: CONTEXT_MENU_ID,
            title: "Добавить текущий домен в исключение",
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
            const parsed = new URL(url);
            callback(parsed.hostname || "");
        } catch (e) {
            callback("");
        }
    });
}

function updateContextMenuTitle(domain) {
    if (!HAS_CONTEXT_MENUS) return;
    const inList = domain && excludedDomains.includes(domain);
    const title = inList
        ? "Удалить домен из исключений"
        : "Добавить текущий домен в исключение";
    chrome.contextMenus.update(CONTEXT_MENU_ID, { title });
}

function refreshMenuForActiveTab() {
    getActiveTabDomain((domain) => {
        updateContextMenuTitle(domain);
    });
}

function buildBypassList() {
    return Array.from(new Set(excludedDomains));
}

function enableProxy() {
    const parsed = proxyConfig || parseProxyUrl(config.proxyUrl);
    if (!parsed) {
        disableProxy();
        return;
    }
    chrome.proxy.settings.set({
        value: {
            mode: "fixed_servers",
            rules: {
                singleProxy: {
                    scheme: parsed.scheme,
                    host: parsed.host,
                    port: parsed.port
                },
                bypassList: buildBypassList()
            }
        },
        scope: "regular"
    }, () => {
        chrome.action.setBadgeText({ text: "ON" });
        chrome.action.setBadgeBackgroundColor({ color: "#00aa00" });
    });
}

function disableProxy() {
    chrome.proxy.settings.set({
        value: { mode: "direct" },
        scope: "regular"
    }, () => {
        chrome.action.setBadgeText({ text: "" });
    });
}

chrome.action.onClicked.addListener(() => {
    if (!config.proxyUrl || !proxyConfig) {
        chrome.runtime.openOptionsPage();
        return;
    }
    enabled = !enabled;
    enabled ? enableProxy() : disableProxy();
});

chrome.runtime.onInstalled.addListener(() => {
    ensureContextMenu();
});
chrome.runtime.onStartup.addListener(() => {
    ensureContextMenu();
});

if (HAS_CONTEXT_MENUS) {
    if (chrome.contextMenus.onShown) {
        chrome.contextMenus.onShown.addListener(() => {
            refreshMenuForActiveTab();
        });
    }

    chrome.contextMenus.onClicked.addListener((info) => {
        if (info.menuItemId !== CONTEXT_MENU_ID) return;
        getActiveTabDomain((domain) => {
            if (!domain) return;
            chrome.storage.local.get({ excludedDomains: [] }, (saved) => {
                const current = saved.excludedDomains || [];
                const exists = current.includes(domain);
                const next = exists
                    ? current.filter((item) => item !== domain)
                    : [...current, domain];
                chrome.storage.local.set({ excludedDomains: next }, () => {
                    excludedDomains = next;
                    updateContextMenuTitle(domain);
                });
            });
        });
    });
}

if (HAS_TABS) {
    chrome.tabs.onActivated.addListener(() => {
        refreshMenuForActiveTab();
    });
    chrome.tabs.onUpdated.addListener((tabId, changeInfo) => {
        if (changeInfo.status === "complete") {
            refreshMenuForActiveTab();
        }
    });
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message && message.action === "reloadProxy") {
        if (enabled) enableProxy();
        sendResponse({ ok: true });
    }
});

chrome.storage.onChanged.addListener((changes, areaName) => {
    if (areaName === "sync") {
        const updated = {};
        for (const key of ["proxyUrl"]) {
            if (changes[key]) updated[key] = changes[key].newValue;
        }
        if (Object.keys(updated).length > 0) {
            config = { ...config, ...updated };
            proxyConfig = parseProxyUrl(config.proxyUrl);
            if (enabled) enableProxy();
        }
    }

    if (areaName === "local" && changes.excludedDomains) {
        excludedDomains = changes.excludedDomains.newValue || [];
        if (enabled) enableProxy();
    }
});

function parseProxyUrl(value) {
    if (!value) return null;
    try {
        const parsed = new URL(value);
        const scheme = parsed.protocol.replace(":", "");
        if (!["socks5", "socks5h", "http", "https"].includes(scheme)) return null;
        const host = parsed.hostname;
        const port = parsed.port ? parseInt(parsed.port, 10) : NaN;
        if (!host || !port) return null;
        return { scheme, host, port };
    } catch (e) {
        return null;
    }
}
