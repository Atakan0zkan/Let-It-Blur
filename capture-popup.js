const puppeteer = require('puppeteer');
const path = require('path');
const fs = require('fs');

async function capture() {
    console.log('Launching browser to capture popup...');
    const browser = await puppeteer.launch({ headless: 'new' });
    const page = await browser.newPage();
    
    // Set a transparent background for the page so the popup can have its own rounded corners
    await page.setViewport({ width: 500, height: 800, deviceScaleFactor: 2 });
    
    // Mock the chrome extension APIs so popup.js runs without crashing
    await page.evaluateOnNewDocument(() => {
        window.chrome = {
            runtime: {
                getManifest: () => ({ version: "1.0.0" }),
                sendMessage: (msg, cb) => cb && cb({ active: false, tab: { scriptable: true } }),
                lastError: null,
                onMessage: { addListener: () => {} }
            },
            i18n: {
                getUILanguage: () => "en",
                getMessage: (key) => null // Falls back to English
            },
            storage: {
                local: {
                    get: (keys, cb) => {
                        const fallback = {
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
                        setTimeout(() => cb(fallback), 0);
                    },
                    set: (payload, cb) => {
                        if(cb) cb();
                    }
                }
            },
            tabs: {
                query: (query, cb) => {
                    setTimeout(() => cb([{ id: 1, url: 'https://example.com' }]), 0);
                }
            }
        };
    });

    const htmlPath = path.resolve(__dirname, 'popup.html');
    console.log(`Loading ${htmlPath}...`);
    await page.goto(`file://${htmlPath}`, { waitUntil: 'networkidle0' });

    // Wait for popup.js to finish setting up UI
    await new Promise(r => setTimeout(r, 500));

    const outDir = path.resolve(__dirname, 'store-assets');
    if (!fs.existsSync(outDir)) {
        fs.mkdirSync(outDir);
    }

    await page.evaluate(() => {
        const shell = document.getElementById('contentShell');
        if (shell) shell.hidden = false;
        const pageControls = document.getElementById('pageControls');
        if (pageControls) pageControls.hidden = false;

        const timerPanel = document.querySelector('.timer-panel');
        const shortcutPanel = document.querySelector('.shortcut-panel');
        if (timerPanel) timerPanel.hidden = false;
        if (shortcutPanel) shortcutPanel.hidden = false;
        
        // ensure bodies are expanded
        const timerBody = document.getElementById('timerSectionBody');
        if (timerBody) timerBody.hidden = false;
        const shortcutBody = document.getElementById('shortcutSectionBody');
        if (shortcutBody) shortcutBody.hidden = false;
    });

    await new Promise(r => setTimeout(r, 100));

    // Capture specific elements
    // Full Popup (the body)
    const bodyElement = await page.$('body');
    await bodyElement.screenshot({ path: path.join(outDir, 'dark-popup-full.png') });
    console.log('Saved dark-popup-full.png');

    // Blur and Dim panel
    const slidersPanel = await page.$('#pageControls');
    if (slidersPanel) {
        await slidersPanel.screenshot({ path: path.join(outDir, 'dark-popup-blur.png') });
        console.log('Saved dark-popup-blur.png');
    }

    // Auto Away Timer panel
    const timerAccordion = await page.$('.timer-panel');
    if (timerAccordion) {
        await timerAccordion.screenshot({ path: path.join(outDir, 'dark-popup-timer.png') });
        console.log('Saved dark-popup-timer.png');
    }

    // Shortcut panel
    const shortcutAccordion = await page.$('.shortcut-panel');
    if (shortcutAccordion) {
        await shortcutAccordion.screenshot({ path: path.join(outDir, 'dark-popup-shortcut.png') });
        console.log('Saved dark-popup-shortcut.png');
    }

    await browser.close();
}

capture().catch(err => {
    console.error('Error generating assets:', err);
    process.exit(1);
});
