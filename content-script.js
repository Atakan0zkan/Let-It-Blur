(() => {
  if (window.__screenBlurLoaded) {
    return;
  }

  window.__screenBlurLoaded = true;

  const DEFAULT_SETTINGS = {
    blurAmount: 16,
    tintOpacity: 0.28,
    autoAwayEnabled: false,
    autoAwaySeconds: 60,
    customShortcut: "Alt+Shift+X",
    extensionEnabled: true,
    awayLocked: false
  };

  const ROOT_ID = "screen-blur-root";
  const KEY_EVENTS = ["keydown", "keyup", "keypress"];
  const POINTER_EVENTS = [
    "click",
    "dblclick",
    "mousedown",
    "mouseup",
    "pointerdown",
    "pointerup",
    "touchstart",
    "touchend",
    "wheel"
  ];

  let settings = { ...DEFAULT_SETTINGS };
  let active = false;
  let root = null;
  let shadow = null;
  let elements = null;

  init();

  async function init() {
    settings = await loadSettings();
    attachEventShields();

    if (settings.extensionEnabled && settings.awayLocked && settings.autoAwayEnabled) {
      setActive(true, "autoAway");
    }

    chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
      if (!message || typeof message.type !== "string") {
        return false;
      }

      if (message.type === "TOGGLE_BLUR") {
        if (!settings.extensionEnabled) {
          sendResponse({ ok: false, active });
          return false;
        }

        setActive(!active, message.source || "manual");
        sendResponse({ ok: true, active });
        return false;
      }

      if (message.type === "SET_BLUR_ACTIVE") {
        if (!settings.extensionEnabled && message.active) {
          sendResponse({ ok: false, active });
          return false;
        }

        setActive(Boolean(message.active), message.reason || "manual");
        sendResponse({ ok: true, active });
        return false;
      }

      if (message.type === "GET_BLUR_STATE") {
        sendResponse({ ok: true, active });
        return false;
      }

      return false;
    });

    chrome.storage.onChanged.addListener((changes, areaName) => {
      if (areaName !== "local") {
        return;
      }

      for (const key of Object.keys(DEFAULT_SETTINGS)) {
        if (changes[key]) {
          settings[key] = changes[key].newValue;
        }
      }

      applySettings();

      if (changes.extensionEnabled?.newValue === false) {
        setActive(false, "extensionDisabled");
        return;
      }

      if (changes.awayLocked?.newValue && settings.extensionEnabled && settings.autoAwayEnabled) {
        setActive(true, "autoAway");
      }
    });
  }

  async function loadSettings() {
    return new Promise((resolve) => {
      chrome.storage.local.get(Object.keys(DEFAULT_SETTINGS), (stored) => {
        resolve({ ...DEFAULT_SETTINGS, ...(stored || {}) });
      });
    });
  }

  function ensureOverlay() {
    if (root && shadow && elements) {
      return;
    }

    root = document.getElementById(ROOT_ID);
    if (!root) {
      root = document.createElement("div");
      root.id = ROOT_ID;
      root.style.pointerEvents = "none";
      document.documentElement.appendChild(root);
    }

    shadow = root.shadowRoot || root.attachShadow({ mode: "open" });
    shadow.innerHTML = `
      <style>
        :host {
          all: initial;
        }

        .curtain {
          align-items: center;
          background: rgba(8, 12, 18, var(--screen-blur-tint, 0.28));
          backdrop-filter: blur(var(--screen-blur-amount, 16px));
          -webkit-backdrop-filter: blur(var(--screen-blur-amount, 16px));
          box-sizing: border-box;
          color: #f7fafc;
          display: none;
          font: 13px/1.4 Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
          inset: 0;
          justify-content: center;
          pointer-events: auto;
          position: fixed;
          z-index: 2147483647;
        }

        .curtain.is-active {
          display: flex;
        }

        .control-bar {
          align-items: center;
          background: rgba(13, 18, 26, 0.86);
          border: 1px solid rgba(255, 255, 255, 0.18);
          border-radius: 8px;
          bottom: 24px;
          box-shadow: 0 18px 48px rgba(0, 0, 0, 0.32);
          box-sizing: border-box;
          display: grid;
          gap: 12px;
          grid-template-columns: 1fr auto;
          left: 50%;
          max-width: min(420px, calc(100vw - 32px));
          padding: 12px;
          position: fixed;
          transform: translateX(-50%);
          width: min(420px, calc(100vw - 32px));
        }

        .label {
          color: rgba(247, 250, 252, 0.82);
          font-size: 13px;
          min-width: 0;
        }

        button {
          appearance: none;
          background: rgba(255, 255, 255, 0.1);
          border: 1px solid rgba(255, 255, 255, 0.18);
          border-radius: 7px;
          color: #f7fafc;
          cursor: pointer;
          font: inherit;
          min-height: 34px;
          padding: 0 12px;
          white-space: nowrap;
        }

        button:hover,
        button:focus-visible {
          background: rgba(255, 255, 255, 0.18);
          outline: none;
        }

        .unlock {
          background: #5eead4;
          border-color: #5eead4;
          color: #06211f;
          font-weight: 700;
        }

        .unlock:hover,
        .unlock:focus-visible {
          background: #99f6e4;
        }

        @media (max-width: 420px) {
          .control-bar {
            grid-template-columns: 1fr;
          }
        }
      </style>

      <div class="curtain" role="dialog" aria-modal="true" aria-label="Screen blurred">
        <div class="control-bar">
          <div class="label">Screen hidden. Use the extension popup for controls.</div>
          <button class="unlock" type="button">Unlock</button>
        </div>
      </div>
    `;

    elements = {
      curtain: shadow.querySelector(".curtain"),
      unlock: shadow.querySelector(".unlock")
    };

    elements.unlock.addEventListener("click", () => {
      setActive(false, "manualUnlock");
      chrome.runtime.sendMessage({ type: "UNBLUR_ALL_TABS" });
    });

    applySettings();
  }

  function setActive(nextActive, reason) {
    ensureOverlay();
    active = Boolean(nextActive);

    root.style.pointerEvents = active ? "auto" : "none";
    elements.curtain.classList.toggle("is-active", active);
    elements.curtain.dataset.reason = reason || "manual";

    if (active) {
      window.setTimeout(() => elements.unlock.focus(), 0);
      return;
    }

    if (reason !== "extensionDisabled" && reason !== "autoAwayDisabled") {
      chrome.runtime.sendMessage({ type: "CLEAR_AWAY_LOCK" });
    }
  }

  function applySettings() {
    if (!elements) {
      return;
    }

    const blurAmount = clampNumber(settings.blurAmount, 2, 40, DEFAULT_SETTINGS.blurAmount);
    const tintOpacity = clampNumber(settings.tintOpacity, 0, 0.65, DEFAULT_SETTINGS.tintOpacity);

    elements.curtain.style.setProperty("--screen-blur-amount", `${blurAmount}px`);
    elements.curtain.style.setProperty("--screen-blur-tint", String(tintOpacity));
  }

  function attachEventShields() {
    window.addEventListener("keydown", handleShortcutKeydown, true);

    for (const eventName of POINTER_EVENTS) {
      window.addEventListener(eventName, shieldEvent, true);
    }

    for (const eventName of KEY_EVENTS) {
      window.addEventListener(eventName, shieldKeyEvent, true);
    }
  }

  function handleShortcutKeydown(event) {
    if (!settings.extensionEnabled || event.repeat || event.isComposing) {
      return;
    }

    const shortcut = normalizeShortcutEvent(event);
    if (!shortcut || shortcut !== settings.customShortcut) {
      return;
    }

    event.preventDefault();
    event.stopImmediatePropagation();
    setActive(!active, "shortcut");
  }

  function shieldEvent(event) {
    if (!active || isOverlayEvent(event)) {
      return;
    }

    event.preventDefault();
    event.stopImmediatePropagation();
  }

  function shieldKeyEvent(event) {
    if (!active || isOverlayEvent(event)) {
      return;
    }

    if (event.key === "Escape" && event.type === "keydown") {
      setActive(false, "escape");
    }

    event.preventDefault();
    event.stopImmediatePropagation();
  }

  function isOverlayEvent(event) {
    if (!root) {
      return false;
    }

    return event.composedPath().includes(root);
  }

  function clampNumber(value, min, max, fallback) {
    const number = Number(value);
    if (!Number.isFinite(number)) {
      return fallback;
    }

    return Math.min(max, Math.max(min, number));
  }

  function normalizeShortcutEvent(event) {
    const key = normalizeKey(event.key);
    if (!key || key === "Control" || key === "Alt" || key === "Shift" || key === "Meta") {
      return "";
    }

    const parts = [];
    if (event.ctrlKey) {
      parts.push("Ctrl");
    }
    if (event.altKey) {
      parts.push("Alt");
    }
    if (event.shiftKey) {
      parts.push("Shift");
    }
    if (event.metaKey) {
      parts.push("Command");
    }

    if (parts.length === 0) {
      return "";
    }

    parts.push(key);
    return parts.join("+");
  }

  function normalizeKey(key) {
    if (!key) {
      return "";
    }

    if (key.length === 1) {
      return key.toUpperCase();
    }

    const aliases = {
      " ": "Space",
      Esc: "Escape",
      Del: "Delete",
      Left: "ArrowLeft",
      Right: "ArrowRight",
      Up: "ArrowUp",
      Down: "ArrowDown"
    };

    return aliases[key] || key;
  }
})();
