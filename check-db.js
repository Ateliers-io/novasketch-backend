import mongoose from 'mongoose';
import History from './src/models/History.js';
import dotenv from 'dotenv';
dotenv.config();

await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/novasketch');

try {
    const docs = await History.find().sort({ timestamp: 1 });
    console.log(`Found ${docs.length} snapshots`);
    for (let i = 0; i < docs.length; i++) {
        const doc = docs[i];
        console.log(`Snapshot ${i + 1}: ${doc.update.length} bytes, time: ${doc.timestamp}`);
    }
} catch (e) {
    console.error(e);
}
process.exit(0);
