# Chrome Proxy Extension

Simple Chrome extension that manages multiple named proxy servers
(SOCKS5/HTTP/HTTPS) and lets you define the domains that should use them.

## Features
- Add, edit and remove multiple named proxy servers.
- Switch servers with one click in the popup and turn the proxy off with a dedicated toggle.
- Store the server list in sync storage.
- Optionally limit proxying to an allowed domain list; an empty list proxies all traffic.
- Context menu item to add/remove current domain.

## How It Works
- The background service worker reads the selected proxy and applies it via
  `chrome.proxy.settings`.
- Allowed domains are stored in `chrome.storage.local` and used to build
  a PAC script. With no domains configured, the selected proxy handles all traffic.
- The options page lets you set the proxy URL and manage the domain list.

## Setup
1. Open Chrome and go to `chrome://extensions`.
2. Enable **Developer mode**.
3. Click **Load unpacked** and select the `src` folder.
4. Open the extension **Options** page and add one or more named proxy servers.
5. Click the extension icon and choose a server from the list.

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
- `src/options.html` / `src/options.js` — server and domain management.
- `src/popup.html` / `src/popup.js` — active server selection.
- `src/manifest.json` — Chrome extension manifest.

## License
MIT. See `LICENSE`.
