# Let It Blur - Screen Privacy

A lightweight Chrome Manifest V3 extension that places a local blur curtain over web page content when the user clicks the toolbar action or when the computer becomes idle.

## What it does

- Opens a compact toolbar popup for the privacy curtain controls.
- Toggles a full-page blur overlay from the popup or keyboard shortcut.
- Provides blur and dim sliders in the popup.
- Opens in dark mode by default and provides an icon-only light/dark toggle.
- Provides an ENG fallback button for returning popup copy to English.
- Provides a popup power button that pauses the extension and dims the controls.
- Shows shortcut information directly in the popup.
- Blocks pointer and keyboard interaction with the page while the curtain is active.
- Saves blur, dim, and auto-away settings locally with `chrome.storage`.
- Supports a default in-page keyboard shortcut: `Alt+Shift+X`.
- Lets users edit the in-page shortcut from the popup by pressing a new key combination.
- Optionally blurs open web pages after an idle timer using `chrome.idle`.
- Offers a fallback curtain tab for browser-owned pages such as Brave or Chrome new tab pages.

## What it does not do

Chrome extensions cannot blur the operating system desktop, Chrome toolbar, address bar, other apps, or browser-owned pages such as `chrome://` URLs. This extension protects scriptable HTTP and HTTPS web page content only.

## Load locally

1. Open `chrome://extensions`.
2. Enable Developer mode.
3. Click Load unpacked.
4. Select this project folder.
5. Pin the extension and click the toolbar action to open the Let It Blur popup.

## Privacy

Let It Blur - Screen Privacy does not collect, transmit, or analyze page content. The content script exists only to render the local curtain and respond to extension messages.
