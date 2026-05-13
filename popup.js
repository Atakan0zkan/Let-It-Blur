const DEFAULT_SETTINGS = {
  blurAmount: 16,
  tintOpacity: 0.28,
  autoAwayEnabled: false,
  autoAwaySeconds: 60,
  popupTheme: "dark",
  popupLanguage: "en",
  customShortcut: "Alt+Shift+X",
  extensionEnabled: true,
  settingsSchemaVersion: 3
};

const LIMITS = {
  blurAmount: { min: 2, max: 40 },
  tintOpacityPercent: { min: 0, max: 65 }
};

const TEXT = {
  en: {
    title: "Screen Privacy",
    ready: "Ready",
    openCurtain: "Open Curtain Tab",
    restrictedFallback: "This page cannot be blurred directly.",
    blurPage: "Blur page",
    unblurPage: "Unblur page",
    blur: "Blur",
    dim: "Dim",
    autoAway: "Auto Away Timer",
    after: "After",
    shortcut: "Shortcut",
    edit: "Edit",
    pressShortcut: "Press keys",
    shortcutNote: "Works while a web page is focused.",
    invalidShortcut: "Use at least one modifier plus one key.",
    saving: "Saving",
    saved: "Saved",
    powerOn: "Turn extension on",
    powerOff: "Turn extension off",
    darkMode: "Turn dark mode on",
    lightMode: "Turn light mode on"
  }
};

const elements = {
  restrictedNotice: document.getElementById("restrictedNotice"),
  restrictedText: document.getElementById("restrictedText"),
  openCurtain: document.getElementById("openCurtain"),
  pageControls: document.getElementById("pageControls"),
  toggleBlur: document.getElementById("toggleBlur"),
  toggleLabel: document.getElementById("toggleLabel"),
  blurAmount: document.getElementById("blurAmount"),
  blurAmountValue: document.getElementById("blurAmountValue"),
  tintOpacity: document.getElementById("tintOpacity"),
  tintOpacityValue: document.getElementById("tintOpacityValue"),
  autoAwayEnabled: document.getElementById("autoAwayEnabled"),
  autoAwaySeconds: document.getElementById("autoAwaySeconds"),
  themeToggle: document.getElementById("themeToggle"),
  englishFallback: document.getElementById("englishFallback"),
  powerToggle: document.getElementById("powerToggle"),
  popupTitle: document.getElementById("popupTitle"),
  contentShell: document.getElementById("contentShell"),
  blurLabel: document.getElementById("blurLabel"),
  dimLabel: document.getElementById("dimLabel"),
  autoAwayLabel: document.getElementById("autoAwayLabel"),
  afterLabel: document.getElementById("afterLabel"),
  shortcutLabel: document.getElementById("shortcutLabel"),
  shortcutEdit: document.getElementById("shortcutEdit"),
  shortcutKeys: document.getElementById("shortcutKeys"),
  shortcutNote: document.getElementById("shortcutNote"),
  saveStatus: document.getElementById("saveStatus")
};

let active = false;
let scriptable = false;
let extensionEnabled = DEFAULT_SETTINGS.extensionEnabled;
let saveTimer = null;
let popupTheme = DEFAULT_SETTINGS.popupTheme;
let popupLanguage = DEFAULT_SETTINGS.popupLanguage;
let customShortcut = DEFAULT_SETTINGS.customShortcut;
let recordingShortcut = false;

init();

async function init() {
  attachListeners();
  const state = await sendMessage({ type: "GET_POPUP_STATE" });
  const settings = { ...DEFAULT_SETTINGS, ...(state?.settings || {}) };

  active = Boolean(state?.active);
  scriptable = Boolean(state?.tab?.scriptable);
  extensionEnabled = Boolean(settings.extensionEnabled);
  popupTheme = normalizeTheme(settings.popupTheme);
  popupLanguage = normalizeLanguage(settings.popupLanguage);
  customShortcut = normalizeShortcutString(settings.customShortcut);

  renderSettings(settings);
  renderText();
  renderTheme();
  renderExtensionEnabled();
  renderPageState(state);
}

function attachListeners() {
  elements.powerToggle.addEventListener("click", async () => {
    const nextEnabled = !extensionEnabled;
    const response = await sendMessage({
      type: "SET_EXTENSION_ENABLED",
      enabled: nextEnabled
    });

    if (!response?.ok) {
      elements.saveStatus.textContent = getCopy().ready;
      return;
    }

    extensionEnabled = nextEnabled;
    if (!extensionEnabled) {
      active = false;
    }

    renderExtensionEnabled();
    renderPageState();
    elements.saveStatus.textContent = getCopy().saved;
    window.setTimeout(() => {
      elements.saveStatus.textContent = getCopy().ready;
    }, 900);
  });

  elements.toggleBlur.addEventListener("click", async () => {
    if (!extensionEnabled) {
      return;
    }

    if (!scriptable) {
      await sendMessage({ type: "OPEN_CURTAIN_TAB" });
      window.close();
      return;
    }

    const nextActive = !active;
    const response = await sendMessage({
      type: "SET_ACTIVE_TAB_BLUR",
      active: nextActive
    });

    if (response?.ok) {
      active = nextActive;
      renderToggle();
      renderPageState();
    }
  });

  elements.openCurtain.addEventListener("click", async () => {
    if (!extensionEnabled) {
      return;
    }

    await sendMessage({ type: "OPEN_CURTAIN_TAB" });
    window.close();
  });

  elements.blurAmount.addEventListener("input", () => {
    elements.blurAmountValue.value = `${elements.blurAmount.value}px`;
    elements.blurAmountValue.textContent = `${elements.blurAmount.value}px`;
    queueSave();
  });

  elements.tintOpacity.addEventListener("input", () => {
    elements.tintOpacityValue.value = `${elements.tintOpacity.value}%`;
    elements.tintOpacityValue.textContent = `${elements.tintOpacity.value}%`;
    queueSave();
  });

  elements.autoAwayEnabled.addEventListener("change", queueSave);
  elements.autoAwaySeconds.addEventListener("change", queueSave);
  elements.shortcutEdit.addEventListener("click", startShortcutRecording);

  elements.themeToggle.addEventListener("click", () => {
    if (!extensionEnabled) {
      return;
    }

    popupTheme = popupTheme === "dark" ? "light" : "dark";
    renderTheme();
    queueSave();
  });

  elements.englishFallback.addEventListener("click", () => {
    if (!extensionEnabled) {
      return;
    }

    popupLanguage = "en";
    renderText();
    queueSave();
  });

  window.addEventListener("keydown", (event) => {
    if (!recordingShortcut) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();

    if (event.key === "Escape") {
      stopShortcutRecording(false);
      return;
    }

    const nextShortcut = normalizeShortcutEvent(event);
    if (!isValidShortcut(nextShortcut)) {
      elements.shortcutNote.textContent = getCopy().invalidShortcut;
      return;
    }

    customShortcut = nextShortcut;
    renderShortcut();
    stopShortcutRecording(true);
    queueSave();
  }, true);
}

function renderSettings(settings) {
  elements.blurAmount.value = String(settings.blurAmount);
  elements.blurAmountValue.value = `${settings.blurAmount}px`;
  elements.blurAmountValue.textContent = `${settings.blurAmount}px`;

  const tintPercent = Math.round(Number(settings.tintOpacity) * 100);
  elements.tintOpacity.value = String(tintPercent);
  elements.tintOpacityValue.value = `${tintPercent}%`;
  elements.tintOpacityValue.textContent = `${tintPercent}%`;

  elements.autoAwayEnabled.checked = Boolean(settings.autoAwayEnabled);
  elements.autoAwaySeconds.value = String(settings.autoAwaySeconds);
  customShortcut = normalizeShortcutString(settings.customShortcut);
  renderShortcut();
}

function renderPageState(state = null) {
  renderToggle();
  const copy = getCopy();

  if (!extensionEnabled) {
    elements.restrictedNotice.hidden = true;
    elements.pageControls.hidden = false;
    return;
  }

  if (scriptable) {
    elements.restrictedNotice.hidden = true;
    elements.pageControls.hidden = false;
    return;
  }

  elements.pageControls.hidden = true;
  elements.restrictedNotice.hidden = false;
  elements.restrictedText.textContent =
    state?.tab?.restrictedReason || copy.restrictedFallback;
}

function renderToggle() {
  const copy = getCopy();
  elements.toggleBlur.setAttribute("aria-pressed", String(active));
  elements.toggleLabel.textContent = active ? copy.unblurPage : copy.blurPage;
}

function renderTheme() {
  const isDark = popupTheme === "dark";
  const copy = getCopy();
  document.body.classList.toggle("theme-dark", isDark);
  elements.themeToggle.setAttribute("aria-pressed", String(isDark));
  elements.themeToggle.setAttribute("aria-label", isDark ? copy.lightMode : copy.darkMode);
}

function renderExtensionEnabled() {
  const copy = getCopy();
  document.body.classList.toggle("extension-off", !extensionEnabled);
  elements.powerToggle.setAttribute("aria-pressed", String(extensionEnabled));
  elements.powerToggle.setAttribute(
    "aria-label",
    extensionEnabled ? copy.powerOff : copy.powerOn
  );

  for (const control of getDisableableControls()) {
    control.disabled = !extensionEnabled;
  }
}

function renderText() {
  const copy = getCopy();
  elements.popupTitle.textContent = copy.title;
  elements.openCurtain.textContent = copy.openCurtain;
  elements.blurLabel.textContent = copy.blur;
  elements.dimLabel.textContent = copy.dim;
  elements.autoAwayLabel.textContent = copy.autoAway;
  elements.afterLabel.textContent = copy.after;
  elements.shortcutLabel.textContent = copy.shortcut;
  elements.shortcutEdit.textContent = recordingShortcut ? copy.pressShortcut : copy.edit;
  elements.shortcutNote.textContent = recordingShortcut ? copy.pressShortcut : copy.shortcutNote;
  elements.saveStatus.textContent = copy.ready;
  elements.englishFallback.textContent = "ENG";
  renderShortcut();
  renderTheme();
  renderToggle();
  renderExtensionEnabled();
}

function queueSave() {
  if (!extensionEnabled) {
    return;
  }

  window.clearTimeout(saveTimer);
  elements.saveStatus.textContent = getCopy().saving;
  saveTimer = window.setTimeout(save, 120);
}

function save() {
  const payload = {
    blurAmount: clampNumber(
      elements.blurAmount.value,
      LIMITS.blurAmount.min,
      LIMITS.blurAmount.max,
      DEFAULT_SETTINGS.blurAmount
    ),
    tintOpacity:
      clampNumber(
        elements.tintOpacity.value,
        LIMITS.tintOpacityPercent.min,
        LIMITS.tintOpacityPercent.max,
        DEFAULT_SETTINGS.tintOpacity * 100
      ) / 100,
    autoAwayEnabled: elements.autoAwayEnabled.checked,
    autoAwaySeconds: Number(elements.autoAwaySeconds.value),
    popupTheme,
    popupLanguage,
    customShortcut,
    extensionEnabled,
    settingsSchemaVersion: DEFAULT_SETTINGS.settingsSchemaVersion
  };

  chrome.storage.local.set(payload, () => {
    elements.saveStatus.textContent = getCopy().saved;
    window.setTimeout(() => {
      elements.saveStatus.textContent = getCopy().ready;
    }, 900);
  });
}

function getDisableableControls() {
  return [
    elements.englishFallback,
    elements.themeToggle,
    elements.openCurtain,
    elements.toggleBlur,
    elements.blurAmount,
    elements.tintOpacity,
    elements.autoAwayEnabled,
    elements.autoAwaySeconds,
    elements.shortcutEdit
  ];
}

function startShortcutRecording() {
  if (!extensionEnabled) {
    return;
  }

  recordingShortcut = true;
  elements.shortcutEdit.textContent = getCopy().pressShortcut;
  elements.shortcutNote.textContent = getCopy().pressShortcut;
  elements.shortcutEdit.focus();
}

function stopShortcutRecording(saved) {
  recordingShortcut = false;
  elements.shortcutEdit.textContent = getCopy().edit;
  elements.shortcutNote.textContent = saved ? getCopy().saved : getCopy().shortcutNote;
}

function renderShortcut() {
  elements.shortcutKeys.textContent = customShortcut.replaceAll("+", " + ");
}

function getCopy() {
  return TEXT[popupLanguage] || TEXT.en;
}

function normalizeTheme(theme) {
  return theme === "dark" ? "dark" : "light";
}

function normalizeLanguage(language) {
  return TEXT[language] ? language : "en";
}

function normalizeShortcutString(shortcut) {
  if (typeof shortcut !== "string" || !shortcut.trim()) {
    return DEFAULT_SETTINGS.customShortcut;
  }

  return shortcut
    .split("+")
    .map((part) => part.trim())
    .filter(Boolean)
    .join("+") || DEFAULT_SETTINGS.customShortcut;
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

function isValidShortcut(shortcut) {
  const parts = shortcut.split("+").filter(Boolean);
  if (parts.length < 2) {
    return false;
  }

  const modifierCount = parts.filter((part) =>
    ["Ctrl", "Alt", "Shift", "Command"].includes(part)
  ).length;

  return modifierCount > 0 && modifierCount < parts.length;
}

function clampNumber(value, min, max, fallback) {
  const number = Number(value);
  if (!Number.isFinite(number)) {
    return fallback;
  }

  return Math.min(max, Math.max(min, number));
}

function sendMessage(message) {
  return new Promise((resolve) => {
    chrome.runtime.sendMessage(message, (response) => {
      const error = chrome.runtime.lastError;
      resolve(error ? { ok: false, error: error.message } : response || null);
    });
  });
}
