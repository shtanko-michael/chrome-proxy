const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");

const backgroundSource = fs.readFileSync(path.join(__dirname, "..", "src", "background.js"), "utf8");

function event() {
    return { listeners: [], addListener(listener) { this.listeners.push(listener); } };
}

async function enableProxy(allowedDomains) {
    const onMessage = event();
    let appliedConfig;
    const chrome = {
        storage: {
            sync: {
                get: async (defaults) => ({
                    ...defaults,
                    proxies: [{ id: "main", name: "Main", url: "socks5://127.0.0.1:1080" }]
                }),
                set: async () => {}
            },
            local: {
                get: async (defaults) => ({ ...defaults, allowedDomains, enabled: false, activeProxyId: "main" }),
                set: async () => {}
            },
            onChanged: event()
        },
        proxy: { settings: { set: async ({ value }) => { appliedConfig = value; } } },
        action: {
            setBadgeText: async () => {},
            setBadgeBackgroundColor: async () => {},
            setTitle: async () => {}
        },
        contextMenus: {
            create() {},
            removeAll(callback) { callback(); },
            update() {},
            onShown: event(),
            onClicked: event()
        },
        tabs: { query() {}, onActivated: event(), onUpdated: event() },
        runtime: { onInstalled: event(), onStartup: event(), onMessage }
    };
    const context = vm.createContext({ chrome, URL, console });
    vm.runInContext(backgroundSource, context);
    await vm.runInContext("ready", context);
    const response = await new Promise((resolve) => {
        onMessage.listeners[0]({ action: "selectProxy", proxyId: "main" }, {}, resolve);
    });
    assert.equal(response.ok, true);
    assert.equal(appliedConfig.mode, "pac_script");
    return appliedConfig.pacScript.data;
}

function route(pacScript, host) {
    const context = vm.createContext({});
    vm.runInContext(pacScript, context);
    return vm.runInContext(`FindProxyForURL("https://${host}", "${host}")`, context);
}

test("an empty domain list proxies all traffic", async () => {
    const pacScript = await enableProxy([]);
    assert.equal(route(pacScript, "example.com"), "SOCKS5 127.0.0.1:1080");
});

test("a populated domain list proxies only matching domains", async () => {
    const pacScript = await enableProxy(["example.com"]);
    assert.equal(route(pacScript, "sub.example.com"), "SOCKS5 127.0.0.1:1080");
    assert.equal(route(pacScript, "other.test"), "DIRECT");
});
