require('dotenv').config();
const puppeteer = require('puppeteer');
const { MongoClient } = require('mongodb');

// MongoDB Configuration
const uri = process.env.MONGODB_URI;
const client = new MongoClient(uri);
const dbName = 'car_scraper';
const collectionName = 'inventory';

async function scrape() {
    let browser;
    try {
        console.log('Connecting to MongoDB...');
        await client.connect();
        const db = client.db(dbName);
        const collection = db.collection(collectionName);

        console.log('Launching browser...');
        browser = await puppeteer.launch({ headless: "new" });
        const page = await browser.newPage();

        // Emulate desktop for better loading
        await page.setViewport({ width: 1280, height: 800 });

        console.log('Navigating to used inventory...');
        await page.goto('https://www.repentignychevrolet.com/en/used-inventory', { waitUntil: 'networkidle2', timeout: 60000 });

        // Wait for inventory items to load
        const itemSelector = '.listing-tile-wrapper';

        console.log('Waiting for inventory items...');
        let hasItems = true;
        try {
            await page.waitForSelector(itemSelector, { timeout: 15000 });
        } catch (e) {
            console.log('No inventory items found on current page within timeout.');
            hasItems = false;
        }

        const scrapedData = [];
        const websiteUrl = 'https://www.repentignychevrolet.com';

        if (hasItems) {
            const items = await page.$$(itemSelector);
            console.log(`Found ${items.length} items.`);

            for (let i = 0; i < items.length; i++) {
                const item = items[i];
                const data = await page.evaluate((el, webUrl) => {
                    const getText = (selector) => el.querySelector(selector)?.innerText.trim() || null;

                    const title = getText('.car-name');
                    const priceRaw = getText('.price');
                    const price = priceRaw ? priceRaw.replace(/[^0-9]/g, '') : null;

                    // VIN is in .car-meta, need to find the one starting with VIN
                    const metas = Array.from(el.querySelectorAll('.car-meta'));
                    const vinMeta = metas.find(m => m.innerText.includes('VIN'));
                    const vin = vinMeta ? vinMeta.innerText.replace('VIN ', '').trim() : null;

                    const yearMatch = title ? title.match(/\b(19|20)\d{2}\b/) : null;
                    const year = yearMatch ? yearMatch[0] : null;

                    // Specs from the icons section
                    const mileageRaw = getText('.listing-tile-km p');
                    const mileage = mileageRaw ? mileageRaw.replace(/[^0-9]/g, '') : null;

                    const transmission = getText('.listing-tile-transmission p');

                    // Fuel Type isn't explicitly shown in the snippet, but might be in metas or icons
                    const fuelType = null;

                    // Listing URL - using the ID to construct if not found
                    const vehicleId = el.id;
                    const listingUrl = vehicleId ? `${webUrl}/en/used-inventory/vehicle-id${vehicleId}` : null;

                    return {
                        title,
                        vin,
                        price: price ? parseInt(price) : null,
                        mileage: mileage ? parseInt(mileage) : null,
                        year: year ? parseInt(year) : null,
                        fuelType,
                        transmission,
                        listing_url: listingUrl,
                        website_url: webUrl
                    };
                }, item, websiteUrl);

                if (data.vin) {
                    scrapedData.push(data);
                }
            }
        } else {
            // Check if there's a "0 Vehicles" message to confirm it's actually empty
            const noVehicles = await page.evaluate(() => document.body.innerText.includes('0 Vehicles') || document.body.innerText.includes('filtering criteria do not match'));
            if (noVehicles) {
                console.log('Confirmed: Inventory is currently empty.');
            }
        }

        const now = new Date();
        const activeVins = scrapedData.map(d => d.vin).filter(Boolean);

        console.log(`Processing ${scrapedData.length} vehicles...`);

        // Update/Insert found vehicles
        for (const car of scrapedData) {
            await collection.updateOne(
                { vin: car.vin },
                {
                    $set: {
                        ...car,
                        last_seen: now,
                        status: 'active'
                    },
                    $setOnInsert: {
                        data_scraped: now
                    }
                },
                { upsert: true }
            );
        }

        // Mark missing vehicles as removed
        if (activeVins.length > 0) {
            const result = await collection.updateMany(
                { vin: { $nin: activeVins }, status: 'active' },
                { $set: { status: 'removed', last_seen: now } }
            );
            console.log(`Marked ${result.modifiedCount} vehicles as removed.`);
        }

        console.log('Scraping completed successfully.');

    } catch (error) {
        console.error('Scraping failed:', error);
    } finally {
        if (browser) await browser.close();
        await client.close();
    }
}

scrape();
