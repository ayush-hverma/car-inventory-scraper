require('dotenv').config();
const { MongoClient } = require('mongodb');
const fs = require('fs');
const path = require('path');

const uri = process.env.MONGODB_URI;
if (!uri) {
  console.error('Error: MONGODB_URI is not set in environment.');
  process.exit(1);
}

const client = new MongoClient(uri);
const dbName = 'car_scraper';
const collectionName = 'inventory';

async function exportDb() {
  try {
    console.log('Connecting to MongoDB...');
    await client.connect();
    const db = client.db(dbName);
    const collection = db.collection(collectionName);

    console.log('Fetching documents...');
    const docs = await collection.find({}).toArray();

    const outDir = path.resolve(process.cwd(), 'exports');
    if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });

    const filename = `inventory_export_${new Date().toISOString().replace(/[:.]/g, '-')}.json`;
    const filePath = path.join(outDir, filename);

    fs.writeFileSync(filePath, JSON.stringify(docs, null, 2), 'utf8');

    console.log(`Exported ${docs.length} documents to ${filePath}`);
  } catch (err) {
    console.error('Export failed:', err);
    process.exitCode = 1;
  } finally {
    await client.close();
  }
}

exportDb();
