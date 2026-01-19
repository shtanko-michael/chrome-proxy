# Chrome Proxy Extension

Simple Chrome extension that enables a fixed proxy (SOCKS5/HTTP/HTTPS) and lets
you exclude specific domains from the proxy.

## Features
- Toggle proxy on/off from the extension action button.
- Store proxy URL in sync storage.
- Manage excluded domains list (bypass list).
- Context menu item to add/remove current domain.

## How It Works
- The background service worker reads the proxy URL and applies it via
  `chrome.proxy.settings`.
- Excluded domains are stored in `chrome.storage.local` and used as the
  bypass list.
- The options page lets you set the proxy URL and manage the domain list.

## Setup
1. Open Chrome and go to `chrome://extensions`.
2. Enable **Developer mode**.
3. Click **Load unpacked** and select the project root folder.
4. Open the extension **Options** page and set your proxy URL.

## Proxy URL Format
```
scheme://host:port
```
Supported schemes: `socks5`, `socks5h`, `http`, `https`.

Example:
```
socks5://127.0.0.1:1080
```

## Project Files
- `src/background.js` — service worker: proxy toggle and context menu.
- `src/options.html` / `src/options.js` — options page UI and logic.
- `src/manifest.json` — Chrome extension manifest.

## License
MIT. See `LICENSE`.
