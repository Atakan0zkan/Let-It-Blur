const DEFAULT_SETTINGS = {
  blurAmount: 16,
  tintOpacity: 0.28,
  autoAwayEnabled: false,
  autoAwaySeconds: 60,
  popupTheme: "dark",
  popupLanguage: "auto",
  customShortcut: "Alt+Shift+X",
  extensionEnabled: true,
  settingsSchemaVersion: 4,
  awayLocked: false
};

const SETTING_KEYS = Object.keys(DEFAULT_SETTINGS);

chrome.runtime.onInstalled.addListener(() => {
  ensureDefaults().then(configureIdleFromStorage);
});

chrome.runtime.onStartup.addListener(() => {
  ensureDefaults().then(configureIdleFromStorage);
});

chrome.idle.onStateChanged.addListener(async (state) => {
  if (state !== "idle" && state !== "locked") {
    return;
  }

  const settings = await getSettings();
  if (!settings.extensionEnabled || !settings.autoAwayEnabled) {
    return;
  }

  await storageSet({ awayLocked: true });
  await setBlurOnAllTabs(true, "autoAway");
});

chrome.storage.onChanged.addListener((changes, areaName) => {
  if (areaName !== "local") {
    return;
  }

  if (changes.autoAwayEnabled || changes.autoAwaySeconds) {
    configureIdleFromStorage();
  }

  if (changes.extensionEnabled?.newValue === false) {
    storageSet({ awayLocked: false });
    setBlurOnAllTabs(false, "extensionDisabled");
  }

  if (changes.autoAwayEnabled?.newValue === false) {
    storageSet({ awayLocked: false });
    setBlurOnAllTabs(false, "autoAwayDisabled");
  }
});

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (!message || typeof message.type !== "string") {
    return false;
  }

  if (message.type === "GET_POPUP_STATE") {
    getPopupState().then(sendResponse);
    return true;
  }

  if (message.type === "SET_ACTIVE_TAB_BLUR") {
    setActiveTabBlur(Boolean(message.active)).then(sendResponse);
    return true;
  }

  if (message.type === "SET_EXTENSION_ENABLED") {
    setExtensionEnabled(Boolean(message.enabled)).then(sendResponse);
    return true;
  }

  if (message.type === "CLEAR_AWAY_LOCK") {
    storageSet({ awayLocked: false }).then(() => sendResponse({ ok: true }));
    return true;
  }

  if (message.type === "UNBLUR_ALL_TABS") {
    storageSet({ awayLocked: false })
      .then(() => setBlurOnAllTabs(false, "manualUnlock"))
      .then(() => sendResponse({ ok: true }));
    return true;
  }

  return false;
});

async function getPopupState() {
  await ensureDefaults();
  const [settings, tab] = await Promise.all([getSettings(), getActiveTab()]);
  const scriptable = Boolean(tab?.id && isScriptableUrl(tab.url));
  let active = false;

  if (settings.extensionEnabled && scriptable) {
    const status = await sendToTab(tab.id, { type: "GET_BLUR_STATE" }, false);
    active = Boolean(status.response?.active);
  }

  return {
    ok: true,
    tab: {
      id: tab?.id,
      title: tab?.title || "",
      url: tab?.url || "",
      scriptable,
      restrictedReason: scriptable ? "" : getRestrictedReason()
    },
    settings,
    active
  };
}

async function setActiveTabBlur(active) {
  const settings = await getSettings();
  if (!settings.extensionEnabled) {
    return { ok: false, error: "Extension is off." };
  }

  const tab = await getActiveTab();
  if (!tab?.id) {
    return { ok: false, error: "No active tab found." };
  }

  if (!isScriptableUrl(tab.url)) {
    return {
      ok: false,
      error: getRestrictedReason()
    };
  }

  const result = await sendToTab(
    tab.id,
    { type: "SET_BLUR_ACTIVE", active, reason: "popup" },
    true
  );

  return {
    ok: result.ok,
    active,
    error: result.error || ""
  };
}

async function setExtensionEnabled(enabled) {
  await storageSet({
    extensionEnabled: enabled,
    awayLocked: false
  });

  if (!enabled) {
    await setBlurOnAllTabs(false, "extensionDisabled");
  }

  return { ok: true, extensionEnabled: enabled };
}

async function ensureDefaults() {
  const stored = await storageGet(SETTING_KEYS);
  const updates = {};

  for (const [key, value] of Object.entries(DEFAULT_SETTINGS)) {
    if (stored[key] === undefined) {
      updates[key] = value;
    }
  }

  if (stored.settingsSchemaVersion !== DEFAULT_SETTINGS.settingsSchemaVersion) {
    updates.popupTheme = DEFAULT_SETTINGS.popupTheme;
    updates.popupLanguage = DEFAULT_SETTINGS.popupLanguage;
    updates.settingsSchemaVersion = DEFAULT_SETTINGS.settingsSchemaVersion;
  }

  if (Object.keys(updates).length > 0) {
    await storageSet(updates);
  }
}

async function getSettings() {
  const stored = await storageGet(SETTING_KEYS);
  return { ...DEFAULT_SETTINGS, ...stored };
}

async function configureIdleFromStorage() {
  const settings = await getSettings();
  chrome.idle.setDetectionInterval(clampTimer(settings.autoAwaySeconds));
}

async function setBlurOnAllTabs(active, reason) {
  const tabs = await queryTabs({});
  await Promise.all(
    tabs.map((tab) => {
      if (!tab.id || !isScriptableUrl(tab.url)) {
        return Promise.resolve();
      }

      return sendToTab(
        tab.id,
        { type: "SET_BLUR_ACTIVE", active, reason },
        active
      );
    })
  );
}

async function getActiveTab() {
  const tabs = await queryTabs({ active: true, currentWindow: true });
  return tabs[0] || null;
}

async function sendToTab(tabId, message, allowInjection) {
  const firstAttempt = await tabsSendMessage(tabId, message);
  if (firstAttempt.ok || !allowInjection) {
    return firstAttempt;
  }

  const injected = await executeContentScript(tabId);
  if (!injected.ok) {
    return injected;
  }

  return tabsSendMessage(tabId, message);
}

function isScriptableUrl(url = "") {
  return url.startsWith("http://") || url.startsWith("https://");
}

function getRestrictedReason() {
  return "This page can't be blurred because the browser doesn't allow extensions to edit it.";
}

function clampTimer(value) {
  const seconds = Number(value);
  if (!Number.isFinite(seconds)) {
    return DEFAULT_SETTINGS.autoAwaySeconds;
  }

  return Math.min(3600, Math.max(15, Math.round(seconds)));
}

function storageGet(keys) {
  return new Promise((resolve) => {
    chrome.storage.local.get(keys, (items) => resolve(items || {}));
  });
}

function storageSet(items) {
  return new Promise((resolve) => {
    chrome.storage.local.set(items, resolve);
  });
}

function queryTabs(queryInfo) {
  return new Promise((resolve) => {
    chrome.tabs.query(queryInfo, (tabs) => resolve(tabs || []));
  });
}

function tabsSendMessage(tabId, message) {
  return new Promise((resolve) => {
    chrome.tabs.sendMessage(tabId, message, (response) => {
      const error = chrome.runtime.lastError;
      resolve({
        ok: !error,
        response,
        error: error?.message
      });
    });
  });
}

function executeContentScript(tabId) {
  return new Promise((resolve) => {
    chrome.scripting.executeScript(
      {
        target: { tabId },
        files: ["content-script.js"]
      },
      () => {
        const error = chrome.runtime.lastError;
        resolve({
          ok: !error,
          error: error?.message
        });
      }
    );
  });
}
