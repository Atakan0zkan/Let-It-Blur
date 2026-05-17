# Let It Blur - Screen Privacy

A lightweight Chrome Manifest V3 extension that places a local blur curtain over web page content when the user clicks the toolbar action or when the computer becomes idle.

## Chrome Web Store description

Chrome Web Store summary:

> Blur Chrome page content with a local privacy curtain when you step away.

Let It Blur - Screen Privacy is a free, fast and clean way to hide sensitive browser content from your Chrome toolbar.

Open the popup to blur the current web page when you step away from your keyboard at work, in a cafe, in a library or in any shared space.

What you get:

1. One-click privacy blur for normal web pages
2. Adjustable blur and dim levels
3. Auto Away Timer for idle moments
4. Editable keyboard shortcut for fast toggling
5. Clean popup with dark mode, English fallback and browser-language support

No account, no analytics, no remote servers, no personal data collection.

Let It Blur keeps things simple: click, blur the page, step away with confidence, and get back to what you were doing.

This extension is 100% open source and designed to be privacy-focused.
https://github.com/Atakan0zkan/Let-It-Blur

Free to use.

## What it does

- Opens a compact toolbar popup for the privacy curtain controls.
- Toggles a full-page blur overlay from the popup or keyboard shortcut.
- Shows only the Let It Blur logo on the blurred page instead of a warning bar.
- Provides blur and dim sliders in the popup.
- Opens in dark mode by default and provides an icon-only light/dark toggle.
- Provides an ENG fallback button for returning popup copy to English.
- Provides a popup power button that pauses the extension and dims the controls.
- Shows shortcut information directly in the popup.
- Blocks pointer and keyboard interaction with the page while the curtain is active.
- Saves blur, dim, auto-away, theme, language fallback, and shortcut settings locally with `chrome.storage`.
- Supports a default in-page keyboard shortcut: `Alt+Shift+X`.
- Lets users edit the in-page shortcut from the popup by pressing a new key combination.
- Lets users edit the Auto Away Timer with custom values from 15 seconds to 60 minutes.
- Uses the browser UI language automatically and includes popup localization for 55 Chrome Web Store locales.
- Optionally blurs open web pages after an idle timer using `chrome.idle`.
- Shows a red popup warning on browser-owned pages that extensions cannot edit.

## What it does not do

Chrome extensions cannot blur the operating system desktop, Chrome toolbar, address bar, other apps, PDFs opened in the browser viewer, extension pages, or browser-owned pages such as `chrome://` and `brave://` URLs. This extension protects scriptable HTTP and HTTPS web page content only, and the popup explains when the current tab is restricted.

## Load locally

1. Open `chrome://extensions`.
2. Enable Developer mode.
3. Click Load unpacked.
4. Select this project folder.
5. Pin the extension and click the toolbar action to open the Let It Blur popup.

## Package for Chrome Web Store

Run `package-extension-store.bat` from the project root. It creates a store-ready ZIP in `dist/` with `manifest.json` at the ZIP root and excludes local agent memory, test profiles, generated promo assets, and development-only scripts.

The package summary is localized through `_locales/<locale>/messages.json` using the `extensionDescription` key. The manifest version remains `1.0.0`.

## Validation and security

- No remote servers, analytics, telemetry, or account system.
- No `eval`, dynamic function creation, external messaging, or network fetches in the runtime extension.
- The blur curtain is rendered locally in a Shadow DOM overlay.
- Runtime settings are stored only in `chrome.storage.local`.
- The extension requests HTTP/HTTPS host access so the editable shortcut and Auto Away Timer can work on normal web pages.
- Browser-owned pages, extension pages, Chrome Web Store pages, and browser PDF viewer pages are not modified; the popup shows a restricted-page warning instead.

## Privacy

Let It Blur - Screen Privacy does not collect, transmit, or analyze page content. The content script exists only to render the local curtain and respond to extension messages.
