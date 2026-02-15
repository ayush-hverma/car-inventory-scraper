require('dotenv').config();
const { MongoClient } = require('mongodb');

async function verify() {
    const uri = process.env.MONGODB_URI;
    const client = new MongoClient(uri);
    try {
        await client.connect();
        const db = client.db('car_scraper');
        const collection = db.collection('inventory');

        const count = await collection.countDocuments();
        console.log(`Total documents in collection: ${count}`);

        const latest = await collection.find().limit(5).toArray();
        console.log('Latest 5 documents:', JSON.stringify(latest, null, 2));

    } finally {
        await client.close();
    }
}

verify();
