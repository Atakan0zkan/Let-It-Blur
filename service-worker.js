const DEFAULT_SETTINGS = {
  blurAmount: 16,
  tintOpacity: 0.28,
  autoAwayEnabled: false,
  autoAwaySeconds: 60,
  popupTheme: "dark",
  popupLanguage: "auto",
  customShortcut: "Alt+Shift+X",
  extensionEnabled: true,
  settingsSchemaVersion: 5,
  awayLocked: false,
  muteOnBlur: false,
  dblclickUnblur: false
};

const SETTING_KEYS = Object.keys(DEFAULT_SETTINGS);
const MUTE_STATE_KEY = "extensionMutedTabs";
let muteUpdateQueue = Promise.resolve();

chrome.runtime.onInstalled.addListener(() => {
  ensureDefaults().then(configureIdleFromStorage).catch(logError);
});

chrome.runtime.onStartup.addListener(() => {
  ensureDefaults().then(configureIdleFromStorage).catch(logError);
});

chrome.idle.onStateChanged.addListener(async (state) => {
  try {
    if (state !== "idle" && state !== "locked") {
      return;
    }

    const settings = await getSettings();
    if (!settings.extensionEnabled || !settings.autoAwayEnabled) {
      return;
    }

    await storageSet({ awayLocked: true });
    await setBlurOnAllTabs(true, "autoAway");
  } catch (error) {
    logError(error);
  }
});

chrome.storage.onChanged.addListener((changes, areaName) => {
  if (areaName !== "local") {
    return;
  }

  if (changes.autoAwayEnabled || changes.autoAwaySeconds) {
    configureIdleFromStorage().catch(logError);
  }

  if (changes.extensionEnabled?.newValue === false) {
    storageSet({ awayLocked: false }).catch(logError);
    setBlurOnAllTabs(false, "extensionDisabled").catch(logError);
    restoreAllExtensionMutedTabs().catch(logError);
  }

  if (changes.muteOnBlur?.newValue === false) {
    restoreAllExtensionMutedTabs().catch(logError);
  }

  if (changes.autoAwayEnabled?.newValue === false) {
    storageSet({ awayLocked: false }).catch(logError);
    setBlurOnAllTabs(false, "autoAwayDisabled").catch(logError);
  }
});

chrome.tabs.onRemoved.addListener((tabId) => {
  forgetExtensionMutedTab(tabId).catch(logError);
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (!message || typeof message.type !== "string") {
    return false;
  }

  if (message.type === "TAB_BLUR_STATE_CHANGED") {
    if (sender?.tab?.id) {
      return respondWith(
        sendResponse,
        handleTabBlurStateChanged(sender.tab.id, message.active).then(() => ({ ok: true }))
      );
    } else {
      sendResponse({ ok: false });
    }
    return false;
  }

  if (message.type === "GET_POPUP_STATE") {
    return respondWith(sendResponse, getPopupState());
  }

  if (message.type === "SET_ACTIVE_TAB_BLUR") {
    return respondWith(sendResponse, setActiveTabBlur(Boolean(message.active)));
  }

  if (message.type === "SET_EXTENSION_ENABLED") {
    return respondWith(sendResponse, setExtensionEnabled(Boolean(message.enabled)));
  }

  if (message.type === "CLEAR_AWAY_LOCK") {
    return respondWith(
      sendResponse,
      storageSet({ awayLocked: false }).then(() => ({ ok: true }))
    );
  }

  if (message.type === "UNBLUR_ALL_TABS") {
    return respondWith(
      sendResponse,
      storageSet({ awayLocked: false })
        .then(() => setBlurOnAllTabs(false, "manualUnlock"))
        .then(() => ({ ok: true }))
    );
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
  return new Promise((resolve, reject) => {
    chrome.storage.local.get(keys, (items) => {
      const error = chrome.runtime.lastError;
      if (error) {
        reject(new Error(error.message));
        return;
      }

      resolve(items || {});
    });
  });
}

function storageSet(items) {
  return new Promise((resolve, reject) => {
    chrome.storage.local.set(items, () => {
      const error = chrome.runtime.lastError;
      if (error) {
        reject(new Error(error.message));
        return;
      }

      resolve();
    });
  });
}

function sessionStorageGet(key) {
  return new Promise((resolve, reject) => {
    chrome.storage.session.get(key, (items) => {
      const error = chrome.runtime.lastError;
      if (error) {
        reject(new Error(error.message));
        return;
      }

      resolve(items?.[key] || {});
    });
  });
}

function sessionStorageSet(items) {
  return new Promise((resolve, reject) => {
    chrome.storage.session.set(items, () => {
      const error = chrome.runtime.lastError;
      if (error) {
        reject(new Error(error.message));
        return;
      }

      resolve();
    });
  });
}

function queryTabs(queryInfo) {
  return new Promise((resolve, reject) => {
    chrome.tabs.query(queryInfo, (tabs) => {
      const error = chrome.runtime.lastError;
      if (error) {
        reject(new Error(error.message));
        return;
      }

      resolve(tabs || []);
    });
  });
}

function getTabById(tabId) {
  return new Promise((resolve) => {
    chrome.tabs.get(tabId, (tab) => {
      const error = chrome.runtime.lastError;
      resolve(error ? null : tab || null);
    });
  });
}

function updateTabMuted(tabId, muted) {
  return new Promise((resolve, reject) => {
    chrome.tabs.update(tabId, { muted }, (tab) => {
      const error = chrome.runtime.lastError;
      if (error) {
        reject(new Error(error.message));
        return;
      }

      resolve(tab || null);
    });
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

function respondWith(sendResponse, promise) {
  Promise.resolve(promise)
    .then((response) => sendResponse(response))
    .catch((error) => {
      logError(error);
      sendResponse({
        ok: false,
        error: error?.message || "Unexpected extension error."
      });
    });

  return true;
}

function logError(error) {
  console.warn("Let It Blur background error:", error?.message || error);
}

function enqueueMuteUpdate(task) {
  const operation = muteUpdateQueue.then(task, task);
  muteUpdateQueue = operation.catch(() => {});
  return operation;
}

function getExtensionMutedTabs() {
  return sessionStorageGet(MUTE_STATE_KEY).then((stored) =>
    stored && typeof stored === "object" && !Array.isArray(stored) ? stored : {}
  );
}

function saveExtensionMutedTabs(tabs) {
  return sessionStorageSet({ [MUTE_STATE_KEY]: tabs });
}

async function muteTabForBlur(tabId) {
  const settings = await getSettings();
  if (!settings.extensionEnabled || !settings.muteOnBlur) {
    return;
  }

  const trackedTabs = await getExtensionMutedTabs();
  const key = String(tabId);
  if (trackedTabs[key]) {
    return;
  }

  const tab = await getTabById(tabId);
  if (!tab || tab.mutedInfo?.muted) {
    return;
  }

  trackedTabs[key] = true;
  await saveExtensionMutedTabs(trackedTabs);

  try {
    await updateTabMuted(tabId, true);
  } catch (error) {
    delete trackedTabs[key];
    await saveExtensionMutedTabs(trackedTabs);
    throw error;
  }
}

async function restoreExtensionMutedTab(tabId) {
  const trackedTabs = await getExtensionMutedTabs();
  const key = String(tabId);
  if (!trackedTabs[key]) {
    return;
  }

  const tab = await getTabById(tabId);
  const mutedByThisExtension =
    tab?.mutedInfo?.muted &&
    tab.mutedInfo.reason === "extension" &&
    tab.mutedInfo.extensionId === chrome.runtime.id;

  if (mutedByThisExtension) {
    await updateTabMuted(tabId, false);
  }

  delete trackedTabs[key];
  await saveExtensionMutedTabs(trackedTabs);
}

function restoreAllExtensionMutedTabs() {
  return enqueueMuteUpdate(async () => {
    const trackedTabs = await getExtensionMutedTabs();

    for (const key of Object.keys(trackedTabs)) {
      const tabId = Number(key);
      const tab = Number.isInteger(tabId) ? await getTabById(tabId) : null;
      const mutedByThisExtension =
        tab?.mutedInfo?.muted &&
        tab.mutedInfo.reason === "extension" &&
        tab.mutedInfo.extensionId === chrome.runtime.id;

      if (mutedByThisExtension) {
        await updateTabMuted(tabId, false);
      }

      delete trackedTabs[key];
    }

    await saveExtensionMutedTabs(trackedTabs);
  });
}

function forgetExtensionMutedTab(tabId) {
  return enqueueMuteUpdate(async () => {
    const trackedTabs = await getExtensionMutedTabs();
    const key = String(tabId);
    if (!trackedTabs[key]) {
      return;
    }

    delete trackedTabs[key];
    await saveExtensionMutedTabs(trackedTabs);
  });
}

function handleTabBlurStateChanged(tabId, active) {
  return enqueueMuteUpdate(() =>
    active ? muteTabForBlur(tabId) : restoreExtensionMutedTab(tabId)
  );
}
