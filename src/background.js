let enabled = false;
let config = {
    proxyUrl: ""
};
let allowedDomains = [];
const CONTEXT_MENU_ID = "toggle-domain-exclusion";
const HAS_CONTEXT_MENUS = !!(chrome.contextMenus && chrome.contextMenus.create);
const HAS_TABS = !!(chrome.tabs && chrome.tabs.query);
let proxyConfig = null;

chrome.storage.sync.get(config, (saved) => {
    config = saved;
    proxyConfig = parseProxyUrl(config.proxyUrl);
});
chrome.storage.local.get({ allowedDomains: [], enabled: false }, (saved) => {
    allowedDomains = saved.allowedDomains || [];
    enabled = !!saved.enabled;
    if (enabled) {
        enableProxy();
    } else {
        disableProxy();
    }
});

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
            const parsed = new URL(url);
            callback(parsed.hostname || "");
        } catch (e) {
            callback("");
        }
    });
}

function updateContextMenuTitle(domain) {
    if (!HAS_CONTEXT_MENUS) return;
    const inList = domain && allowedDomains.includes(domain);
    const title = inList
        ? "Удалить домен из списка прокси"
        : "Добавить текущий домен в список прокси";
    chrome.contextMenus.update(CONTEXT_MENU_ID, { title });
}

function refreshMenuForActiveTab() {
    getActiveTabDomain((domain) => {
        updateContextMenuTitle(domain);
    });
}

function buildPacScript(parsed) {
    const domains = Array.from(new Set(allowedDomains.map((item) => String(item).toLowerCase())));
    const proxyMap = {
        socks5: "SOCKS5",
        socks5h: "SOCKS5",
        http: "PROXY",
        https: "HTTPS"
    };
    const proxyDirective = `${proxyMap[parsed.scheme]} ${parsed.host}:${parsed.port}`;
    const listJson = JSON.stringify(domains);
    return `
function FindProxyForURL(url, host) {
    var list = ${listJson};
    host = (host || "").toLowerCase();
    for (var i = 0; i < list.length; i++) {
        var d = list[i];
        if (host === d || host.endsWith("." + d)) {
            return "${proxyDirective}";
        }
    }
    return "DIRECT";
}
`.trim();
}

function enableProxy() {
    const parsed = proxyConfig || parseProxyUrl(config.proxyUrl);
    if (!parsed) {
        disableProxy();
        return;
    }
    chrome.proxy.settings.set({
        value: {
            mode: "pac_script",
            pacScript: {
                data: buildPacScript(parsed)
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
    chrome.storage.local.set({ enabled });
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
            chrome.storage.local.get({ allowedDomains: [] }, (saved) => {
                const current = saved.allowedDomains || [];
                const exists = current.includes(domain);
                const next = exists
                    ? current.filter((item) => item !== domain)
                    : [...current, domain];
                chrome.storage.local.set({ allowedDomains: next }, () => {
                    allowedDomains = next;
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

    if (areaName === "local") {
        if (changes.allowedDomains) {
            allowedDomains = changes.allowedDomains.newValue || [];
            if (enabled) enableProxy();
        }
        if (changes.enabled) {
            enabled = !!changes.enabled.newValue;
            enabled ? enableProxy() : disableProxy();
        }
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
