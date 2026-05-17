const DEFAULT_SETTINGS = {
  blurAmount: 16,
  tintOpacity: 0.28,
  autoAwayEnabled: false,
  autoAwaySeconds: 60,
  popupTheme: "dark",
  popupLanguage: "auto",
  customShortcut: "Alt+Shift+X",
  extensionEnabled: true,
  settingsSchemaVersion: 4
};

const LIMITS = {
  blurAmount: { min: 2, max: 40 },
  tintOpacityPercent: { min: 0, max: 65 },
  autoAwaySeconds: { min: 15, max: 3600 }
};

const DEFAULT_TIMER_OPTIONS = [15, 30, 60, 120, 300, 600];

const EN_MESSAGES = {
  popupTitle: "Screen Privacy",
  ready: "Ready",
  restrictedFallback: "This page can't be blurred because the browser doesn't allow extensions to edit it.",
  blurPage: "Blur page",
  unblurPage: "Unblur page",
  notAvailable: "Not available",
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
  save: "Save",
  cancel: "Cancel",
  seconds: "seconds",
  second: "second",
  minutes: "minutes",
  minute: "minute",
  powerOn: "Turn extension on",
  powerOff: "Turn extension off",
  darkMode: "Turn dark mode on",
  lightMode: "Turn light mode on"
};

const elements = {
  restrictedNotice: document.getElementById("restrictedNotice"),
  restrictedText: document.getElementById("restrictedText"),
  pageControls: document.getElementById("pageControls"),
  toggleBlur: document.getElementById("toggleBlur"),
  toggleLabel: document.getElementById("toggleLabel"),
  blurAmount: document.getElementById("blurAmount"),
  blurAmountValue: document.getElementById("blurAmountValue"),
  tintOpacity: document.getElementById("tintOpacity"),
  tintOpacityValue: document.getElementById("tintOpacityValue"),
  autoAwayEnabled: document.getElementById("autoAwayEnabled"),
  autoAwaySeconds: document.getElementById("autoAwaySeconds"),
  timerSectionToggle: document.getElementById("timerSectionToggle"),
  timerSectionBody: document.getElementById("timerSectionBody"),
  timerEdit: document.getElementById("timerEdit"),
  timerEditor: document.getElementById("timerEditor"),
  timerValue: document.getElementById("timerValue"),
  timerUnit: document.getElementById("timerUnit"),
  timerSave: document.getElementById("timerSave"),
  timerCancel: document.getElementById("timerCancel"),
  themeToggle: document.getElementById("themeToggle"),
  englishFallback: document.getElementById("englishFallback"),
  powerToggle: document.getElementById("powerToggle"),
  popupTitle: document.getElementById("popupTitle"),
  blurLabel: document.getElementById("blurLabel"),
  dimLabel: document.getElementById("dimLabel"),
  autoAwayLabel: document.getElementById("autoAwayLabel"),
  afterLabel: document.getElementById("afterLabel"),
  shortcutSectionToggle: document.getElementById("shortcutSectionToggle"),
  shortcutSectionBody: document.getElementById("shortcutSectionBody"),
  shortcutLabel: document.getElementById("shortcutLabel"),
  shortcutEdit: document.getElementById("shortcutEdit"),
  shortcutCancel: document.getElementById("shortcutCancel"),
  shortcutKeys: document.getElementById("shortcutKeys"),
  shortcutNote: document.getElementById("shortcutNote"),
  saveStatus: document.getElementById("saveStatus"),
  versionNumber: document.getElementById("versionNumber")
};

let active = false;
let scriptable = false;
let extensionEnabled = DEFAULT_SETTINGS.extensionEnabled;
let saveTimer = null;
let popupTheme = DEFAULT_SETTINGS.popupTheme;
let popupLanguage = DEFAULT_SETTINGS.popupLanguage;
let customShortcut = DEFAULT_SETTINGS.customShortcut;
let recordingShortcut = false;
let editingTimer = false;

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
  renderLanguageDirection();
  renderExtensionEnabled();
  renderPageState();
}

function attachListeners() {
  elements.powerToggle.addEventListener("click", async () => {
    const nextEnabled = !extensionEnabled;
    const response = await sendMessage({
      type: "SET_EXTENSION_ENABLED",
      enabled: nextEnabled
    });

    if (!response?.ok) {
      elements.saveStatus.textContent = getCopy("ready");
      return;
    }

    extensionEnabled = nextEnabled;
    if (!extensionEnabled) {
      active = false;
      stopShortcutRecording(false);
      stopTimerEdit(false);
    }

    renderExtensionEnabled();
    renderPageState();
    showSavedStatus();
  });

  elements.toggleBlur.addEventListener("click", async () => {
    if (!extensionEnabled || !scriptable) {
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
    }
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
  elements.timerSectionToggle.addEventListener("click", () => toggleAccordion("timer"));
  elements.timerEdit.addEventListener("click", startTimerEdit);
  elements.timerSave.addEventListener("click", saveTimerEdit);
  elements.timerCancel.addEventListener("click", () => stopTimerEdit(false));
  elements.shortcutSectionToggle.addEventListener("click", () => toggleAccordion("shortcut"));
  elements.shortcutEdit.addEventListener("click", startShortcutRecording);
  elements.shortcutCancel.addEventListener("click", () => stopShortcutRecording(false));

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
    renderLanguageDirection();
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
      elements.shortcutNote.textContent = getCopy("invalidShortcut");
      return;
    }

    customShortcut = nextShortcut;
    renderShortcut();
    stopShortcutRecording(true);
    queueSave();
  }, true);
}

function renderSettings(settings) {
  const blurAmount = clampNumber(
    settings.blurAmount,
    LIMITS.blurAmount.min,
    LIMITS.blurAmount.max,
    DEFAULT_SETTINGS.blurAmount
  );
  const tintPercent = Math.round(
    clampNumber(settings.tintOpacity, 0, 0.65, DEFAULT_SETTINGS.tintOpacity) * 100
  );
  const autoAwaySeconds = clampNumber(
    settings.autoAwaySeconds,
    LIMITS.autoAwaySeconds.min,
    LIMITS.autoAwaySeconds.max,
    DEFAULT_SETTINGS.autoAwaySeconds
  );

  elements.blurAmount.value = String(blurAmount);
  elements.blurAmountValue.value = `${blurAmount}px`;
  elements.blurAmountValue.textContent = `${blurAmount}px`;

  elements.tintOpacity.value = String(tintPercent);
  elements.tintOpacityValue.value = `${tintPercent}%`;
  elements.tintOpacityValue.textContent = `${tintPercent}%`;

  elements.autoAwayEnabled.checked = Boolean(settings.autoAwayEnabled);
  renderTimerOptions(autoAwaySeconds);
  customShortcut = normalizeShortcutString(settings.customShortcut);
  renderShortcut();
}

function renderPageState() {
  renderToggle();

  if (!extensionEnabled) {
    elements.restrictedNotice.hidden = true;
    elements.pageControls.hidden = false;
    return;
  }

  if (scriptable) {
    elements.restrictedNotice.hidden = true;
    elements.pageControls.hidden = false;
    elements.toggleBlur.disabled = false;
    return;
  }

  elements.pageControls.hidden = true;
  elements.restrictedNotice.hidden = false;
  elements.restrictedText.textContent = getCopy("restrictedFallback");
  elements.toggleBlur.disabled = true;
}

function renderToggle() {
  elements.toggleBlur.setAttribute("aria-pressed", String(active));
  elements.toggleLabel.textContent = scriptable
    ? active ? getCopy("unblurPage") : getCopy("blurPage")
    : getCopy("notAvailable");
}

function renderTheme() {
  const isDark = popupTheme === "dark";
  document.body.classList.toggle("theme-dark", isDark);
  elements.themeToggle.setAttribute("aria-pressed", String(isDark));
  elements.themeToggle.setAttribute(
    "aria-label",
    isDark ? getCopy("lightMode") : getCopy("darkMode")
  );
}

function renderLanguageDirection() {
  const locale = popupLanguage === "en" ? "en" : chrome.i18n.getUILanguage();
  const language = locale.replace("_", "-");
  const direction = /^(ar|fa|he)(-|$)/i.test(language) ? "rtl" : "ltr";

  document.documentElement.lang = language;
  document.documentElement.dir = direction;
}

function renderExtensionEnabled() {
  document.body.classList.toggle("extension-off", !extensionEnabled);
  elements.powerToggle.setAttribute("aria-pressed", String(extensionEnabled));
  elements.powerToggle.setAttribute(
    "aria-label",
    extensionEnabled ? getCopy("powerOff") : getCopy("powerOn")
  );

  for (const control of getDisableableControls()) {
    control.disabled = !extensionEnabled;
  }
}

function renderText() {
  elements.popupTitle.textContent = getCopy("popupTitle");
  elements.blurLabel.textContent = getCopy("blur");
  elements.dimLabel.textContent = getCopy("dim");
  elements.autoAwayLabel.textContent = getCopy("autoAway");
  elements.afterLabel.textContent = getCopy("after");
  elements.timerEdit.textContent = getCopy("edit");
  elements.timerSave.textContent = getCopy("save");
  elements.timerCancel.textContent = getCopy("cancel");
  elements.shortcutLabel.textContent = getCopy("shortcut");
  elements.shortcutEdit.textContent = recordingShortcut ? getCopy("pressShortcut") : getCopy("edit");
  elements.shortcutCancel.setAttribute("aria-label", getCopy("cancel"));
  elements.shortcutCancel.hidden = !recordingShortcut;
  elements.shortcutNote.textContent = recordingShortcut ? getCopy("pressShortcut") : getCopy("shortcutNote");
  elements.saveStatus.textContent = getCopy("ready");
  renderVersion();
  elements.englishFallback.textContent = "ENG";
  elements.restrictedText.textContent = getCopy("restrictedFallback");
  renderTimerUnits();
  renderTimerOptions(Number(elements.autoAwaySeconds.value) || DEFAULT_SETTINGS.autoAwaySeconds);
  renderShortcut();
  renderTheme();
  renderToggle();
  renderExtensionEnabled();
}

function renderTimerOptions(selectedSeconds) {
  const selected = clampNumber(
    selectedSeconds,
    LIMITS.autoAwaySeconds.min,
    LIMITS.autoAwaySeconds.max,
    DEFAULT_SETTINGS.autoAwaySeconds
  );
  const options = [...new Set([...DEFAULT_TIMER_OPTIONS, selected])].sort((a, b) => a - b);

  elements.autoAwaySeconds.replaceChildren(
    ...options.map((seconds) => new Option(formatDuration(seconds), String(seconds)))
  );
  elements.autoAwaySeconds.value = String(selected);
}

function renderTimerUnits() {
  elements.timerUnit.replaceChildren(
    new Option(getCopy("seconds"), "seconds"),
    new Option(getCopy("minutes"), "minutes")
  );
}

function startTimerEdit() {
  if (!extensionEnabled) {
    return;
  }

  setAccordionExpanded("timer", true);
  const seconds = Number(elements.autoAwaySeconds.value) || DEFAULT_SETTINGS.autoAwaySeconds;
  const useMinutes = seconds >= 60 && seconds % 60 === 0;

  editingTimer = true;
  elements.timerEditor.hidden = false;
  elements.timerValue.value = String(useMinutes ? seconds / 60 : seconds);
  elements.timerUnit.value = useMinutes ? "minutes" : "seconds";
  elements.timerValue.focus();
}

function saveTimerEdit() {
  const rawValue = Math.max(1, Math.round(Number(elements.timerValue.value)));
  if (!Number.isFinite(rawValue)) {
    elements.timerValue.focus();
    return;
  }

  const seconds = elements.timerUnit.value === "minutes" ? rawValue * 60 : rawValue;
  const clamped = clampNumber(
    seconds,
    LIMITS.autoAwaySeconds.min,
    LIMITS.autoAwaySeconds.max,
    DEFAULT_SETTINGS.autoAwaySeconds
  );

  renderTimerOptions(clamped);
  stopTimerEdit(true);
  queueSave();
}

function stopTimerEdit(saved) {
  editingTimer = false;
  elements.timerEditor.hidden = true;
  if (saved) {
    showSavedStatus();
  }
}

function formatDuration(seconds) {
  if (seconds >= 60 && seconds % 60 === 0) {
    const minutes = seconds / 60;
    return `${minutes} ${getCopy(minutes === 1 ? "minute" : "minutes")}`;
  }

  return `${seconds} ${getCopy(seconds === 1 ? "second" : "seconds")}`;
}

function queueSave() {
  if (!extensionEnabled) {
    return;
  }

  window.clearTimeout(saveTimer);
  elements.saveStatus.textContent = getCopy("saving");
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
    autoAwaySeconds: clampNumber(
      elements.autoAwaySeconds.value,
      LIMITS.autoAwaySeconds.min,
      LIMITS.autoAwaySeconds.max,
      DEFAULT_SETTINGS.autoAwaySeconds
    ),
    popupTheme,
    popupLanguage,
    customShortcut,
    extensionEnabled,
    settingsSchemaVersion: DEFAULT_SETTINGS.settingsSchemaVersion
  };

  chrome.storage.local.set(payload, showSavedStatus);
}

function showSavedStatus() {
  elements.saveStatus.textContent = getCopy("saved");
  window.setTimeout(() => {
    elements.saveStatus.textContent = getCopy("ready");
  }, 900);
}

function getDisableableControls() {
  return [
    elements.englishFallback,
    elements.themeToggle,
    elements.toggleBlur,
    elements.blurAmount,
    elements.tintOpacity,
    elements.autoAwayEnabled,
    elements.autoAwaySeconds,
    elements.timerSectionToggle,
    elements.timerEdit,
    elements.timerValue,
    elements.timerUnit,
    elements.timerSave,
    elements.timerCancel,
    elements.shortcutSectionToggle,
    elements.shortcutEdit,
    elements.shortcutCancel
  ];
}

function startShortcutRecording() {
  if (!extensionEnabled) {
    return;
  }

  setAccordionExpanded("shortcut", true);
  recordingShortcut = true;
  elements.shortcutEdit.textContent = getCopy("pressShortcut");
  elements.shortcutCancel.hidden = false;
  elements.shortcutNote.textContent = getCopy("pressShortcut");
  elements.shortcutEdit.focus();
}

function toggleAccordion(section) {
  const accordion = getAccordion(section);
  const isExpanded = accordion.toggle.getAttribute("aria-expanded") === "true";
  setAccordionExpanded(section, !isExpanded);
}

function setAccordionExpanded(section, expanded) {
  const accordion = getAccordion(section);
  accordion.toggle.setAttribute("aria-expanded", String(expanded));
  accordion.body.hidden = !expanded;
}

function getAccordion(section) {
  if (section === "timer") {
    return {
      toggle: elements.timerSectionToggle,
      body: elements.timerSectionBody
    };
  }

  return {
    toggle: elements.shortcutSectionToggle,
    body: elements.shortcutSectionBody
  };
}

function stopShortcutRecording(saved) {
  recordingShortcut = false;
  elements.shortcutEdit.textContent = getCopy("edit");
  elements.shortcutCancel.hidden = true;
  elements.shortcutNote.textContent = saved ? getCopy("saved") : getCopy("shortcutNote");
}

function renderVersion() {
  const version = chrome.runtime.getManifest?.().version;
  elements.versionNumber.textContent = version ? `v${version}` : "";
}

function renderShortcut() {
  elements.shortcutKeys.textContent = customShortcut.replaceAll("+", " + ");
}

function getCopy(key) {
  if (popupLanguage === "en") {
    return EN_MESSAGES[key] || key;
  }

  return chrome.i18n.getMessage(key) || EN_MESSAGES[key] || key;
}

function normalizeTheme(theme) {
  return theme === "dark" ? "dark" : "light";
}

function normalizeLanguage(language) {
  return language === "en" ? "en" : "auto";
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
