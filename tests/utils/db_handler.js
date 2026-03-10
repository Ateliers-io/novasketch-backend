import mongoose from 'mongoose';
import crypto from 'node:crypto';

// Each Jest worker gets a fresh module registry, so this UUID is generated
// once per test file, giving every parallel suite its own isolated database.
// Parallel suites can therefore never read or stomp each other's data.
const DB_ID = crypto.randomUUID().replaceAll(/-/g, '').slice(0, 12);

// Build a unique connection URI for this test-file worker.
const getTestUri = () => {
    const base = process.env.MONGO_URI;
    if (!base) throw new Error('MONGO_URI is not set - check your .env file');
    const url = new URL(base);
    url.pathname = `/novasketch-test-${DB_ID}`;
    return url.toString();
};

export const clearDatabase = async () => {
    const collections = mongoose.connection.collections;
    for (const key in collections) {
        await collections[key].deleteMany({});
    }
};

export const connect = async () => {
    if (mongoose.connection.readyState === 0) {
        await mongoose.connect(getTestUri());
    }
    // Clean slate: remove any leftover data from a prior interrupted run.
    await clearDatabase();
};

export const closeDatabase = async () => {
    await mongoose.connection.dropDatabase();
    await mongoose.connection.close();
};
