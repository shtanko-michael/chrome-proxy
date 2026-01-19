const DEFAULTS = {
    proxyUrl: ""
};

document.addEventListener("DOMContentLoaded", async () => {
    // Load current settings
    const cfg = await new Promise(resolve => {
        chrome.storage.sync.get(DEFAULTS, resolve);
    });
    const localCfg = await new Promise(resolve => {
        chrome.storage.local.get({ allowedDomains: [] }, resolve);
    });

    document.getElementById("proxyUrl").value = cfg.proxyUrl || "";

    renderDomainList(localCfg.allowedDomains || []);

    document.getElementById("addDomain").onclick = addDomain;
    document.getElementById("domainInput").addEventListener("keydown", (event) => {
        if (event.key === "Enter") addDomain();
    });

    // Save on click
    document.getElementById("save").onclick = saveConfig;

    const modal = document.getElementById("readmeModal");
    document.getElementById("openReadme").onclick = () => {
        modal.style.display = "flex";
    };
    document.getElementById("closeReadme").onclick = () => {
        modal.style.display = "none";
    };
    modal.addEventListener("click", (event) => {
        if (event.target === modal) {
            modal.style.display = "none";
        }
    });
});

async function saveConfig() {
    const config = {
        proxyUrl: document.getElementById("proxyUrl").value.trim()
    };

    try {
        if (!config.proxyUrl) {
            showStatus("❌ Вставьте строку подключения", "error");
            return;
        }

        await new Promise(resolve => {
            chrome.storage.sync.set(config, resolve);
        });

        showStatus("✅ Настройки сохранены!", "success");

        // Reload proxy with new settings
        chrome.runtime.sendMessage({ action: "reloadProxy" });

    } catch (e) {
        showStatus("❌ Ошибка сохранения: " + e.message, "error");
    }
}

async function addDomain() {
    const input = document.getElementById("domainInput");
    const normalized = normalizeDomain(input.value);
    if (!normalized) {
        showStatus("Введите корректный домен", "error");
        return;
    }

    const current = await new Promise(resolve => {
        chrome.storage.local.get({ allowedDomains: [] }, resolve);
    });
    const list = new Set(current.allowedDomains || []);
    list.add(normalized);

    await new Promise(resolve => {
        chrome.storage.local.set({ allowedDomains: Array.from(list) }, resolve);
    });

    input.value = "";
    renderDomainList(Array.from(list));
    showStatus("Домен добавлен", "success");
}

async function removeDomain(domain) {
    const current = await new Promise(resolve => {
        chrome.storage.local.get({ allowedDomains: [] }, resolve);
    });
    const list = (current.allowedDomains || []).filter(item => item !== domain);

    await new Promise(resolve => {
        chrome.storage.local.set({ allowedDomains: list }, resolve);
    });

    renderDomainList(list);
    showStatus("Домен удален", "success");
}

function renderDomainList(domains) {
    const list = document.getElementById("domainList");
    list.innerHTML = "";

    if (!domains.length) {
        const empty = document.createElement("li");
        empty.className = "muted";
        empty.textContent = "Список пуст";
        list.appendChild(empty);
        return;
    }

    domains.sort().forEach(domain => {
        const item = document.createElement("li");
        const name = document.createElement("span");
        name.className = "domain";
        name.textContent = domain;

        const button = document.createElement("button");
        button.textContent = "Удалить";
        button.className = "secondary";
        button.onclick = () => removeDomain(domain);

        item.appendChild(name);
        item.appendChild(button);
        list.appendChild(item);
    });
}

function normalizeDomain(value) {
    const raw = (value || "").trim().toLowerCase();
    if (!raw) return "";
    const cleaned = raw.replace(/^https?:\/\//, "").split("/")[0];
    if (!cleaned || cleaned.includes(" ")) return "";
    return cleaned;
}

function showStatus(msg, type) {
    const status = document.getElementById("status");
    status.textContent = msg;
    status.className = type;
    setTimeout(() => {
        status.textContent = "";
        status.className = "";
    }, 3000);
}
