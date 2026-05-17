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
      document.documentElement.appendChild(root);
    }

    applyRootStyles(false);
    shadow = root.shadowRoot || root.attachShadow({ mode: "open" });
    shadow.replaceChildren(createOverlayStyles(), createCurtain());

    elements = {
      curtain: shadow.querySelector(".curtain")
    };

    applySettings();
  }

  function setActive(nextActive, reason) {
    ensureOverlay();
    active = Boolean(nextActive);

    applyRootStyles(active);
    elements.curtain.classList.toggle("is-active", active);
    elements.curtain.dataset.reason = reason || "manual";

    if (!active && reason !== "extensionDisabled" && reason !== "autoAwayDisabled") {
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

  function applyRootStyles(isActive) {
    const importantStyles = {
      all: "initial",
      display: "block",
      height: "100%",
      inset: "0",
      pointerEvents: isActive ? "auto" : "none",
      position: "fixed",
      visibility: "visible",
      width: "100%",
      zIndex: "2147483647"
    };

    for (const [property, value] of Object.entries(importantStyles)) {
      root.style.setProperty(toKebabCase(property), value, "important");
    }
  }

  function createOverlayStyles() {
    const style = document.createElement("style");
    style.textContent = `
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

      .privacy-mark {
        align-items: center;
        bottom: 24px;
        border-radius: 14px;
        box-shadow: 0 18px 48px rgba(0, 0, 0, 0.28);
        box-sizing: border-box;
        display: flex;
        height: 56px;
        justify-content: center;
        left: 50%;
        pointer-events: none;
        position: fixed;
        transform: translateX(-50%);
        width: 56px;
      }

      .privacy-mark svg {
        display: block;
        height: 56px;
        width: 56px;
      }
    `;
    return style;
  }

  function createCurtain() {
    const curtain = document.createElement("div");
    curtain.className = "curtain";
    curtain.setAttribute("aria-label", "Screen blurred");

    const mark = document.createElement("div");
    mark.className = "privacy-mark";
    mark.setAttribute("role", "img");
    mark.setAttribute("aria-label", "Let It Blur");
    mark.append(createLogoSvg());

    curtain.append(mark);
    return curtain;
  }

  function createLogoSvg() {
    const svg = createSvgElement("svg", {
      "aria-hidden": "true",
      viewBox: "0 0 128 128"
    });
    const defs = createSvgElement("defs");
    const gradient = createSvgElement("linearGradient", {
      gradientUnits: "userSpaceOnUse",
      id: "screen-blur-logo-bg",
      x1: "22",
      x2: "108",
      y1: "14",
      y2: "116"
    });
    gradient.append(
      createSvgElement("stop", { offset: "0", "stop-color": "#2563eb" }),
      createSvgElement("stop", { offset: "1", "stop-color": "#06b6d4" })
    );
    defs.append(gradient);
    svg.append(
      defs,
      createSvgElement("rect", {
        fill: "url(#screen-blur-logo-bg)",
        height: "128",
        rx: "30",
        width: "128"
      }),
      createSvgElement("path", {
        d: "M35 48H93M27 64H101M39 80H89",
        fill: "none",
        stroke: "#f8fbff",
        "stroke-linecap": "round",
        "stroke-width": "9"
      })
    );
    return svg;
  }

  function createSvgElement(tagName, attributes = {}) {
    const element = document.createElementNS("http://www.w3.org/2000/svg", tagName);
    for (const [name, value] of Object.entries(attributes)) {
      element.setAttribute(name, value);
    }
    return element;
  }

  function toKebabCase(value) {
    return value.replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`);
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
