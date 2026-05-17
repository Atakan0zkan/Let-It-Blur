const puppeteer = require('puppeteer');
const path = require('path');
const fs = require('fs');

async function generate() {
    console.log('Launching browser...');
    const browser = await puppeteer.launch({ headless: 'new' });
    const page = await browser.newPage();
    
    const htmlPath = path.resolve(__dirname, 'store-assets.html');
    console.log(`Loading ${htmlPath}...`);
    await page.goto(`file://${htmlPath}`, { waitUntil: 'networkidle0' });

    // Wait for fonts to load
    await page.evaluateHandle('document.fonts.ready');

    const outDir = path.resolve(__dirname, 'store-assets');
    if (!fs.existsSync(outDir)) {
        fs.mkdirSync(outDir);
    }

    const configs = [
        { id: 'shot1', name: '01_PrivacyInClick.png', width: 1280, height: 800 },
        { id: 'shot2', name: '02_InstantBlur.png', width: 1280, height: 800 },
        { id: 'shot3', name: '03_Adjustable.png', width: 1280, height: 800 },
        { id: 'shot4', name: '04_AutoAway.png', width: 1280, height: 800 },
        { id: 'shot5', name: '05_Shortcuts.png', width: 1280, height: 800 },
        { id: 'small_promo', name: 'CanvasSmall_440x280.png', width: 440, height: 280 },
        { id: 'marquee_promo', name: 'Marquee_1400x560.png', width: 1400, height: 560 },
    ];

    for (const config of configs) {
        console.log(`Capturing ${config.name}...`);
        await page.setViewport({ width: config.width, height: config.height, deviceScaleFactor: 1 });
        const element = await page.$(`#${config.id}`);
        await element.screenshot({ path: path.join(outDir, config.name) });
        console.log(`Saved ${config.name}`);
    }

    await browser.close();
    console.log('All screenshots generated successfully!');
}

generate().catch(err => {
    console.error('Error generating assets:', err);
    process.exit(1);
});
