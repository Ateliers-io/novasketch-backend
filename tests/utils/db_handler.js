import mongoose from 'mongoose';

export const clearDatabase = async () => {
    const collections = mongoose.connection.collections;
    for (const key in collections) {
        const collection = collections[key];
        await collection.deleteMany();
    }
};

export const connect = async () => {
    const uri = process.env.MONGO_URI;
    if (mongoose.connection.readyState === 0) {
        await mongoose.connect(uri);
    }
    // Defensive cleanup: ensure a clean slate even if a prior test run's
    // afterAll/dropDatabase didn't fully complete.
    await clearDatabase();
};

export const closeDatabase = async () => {
    await mongoose.connection.dropDatabase();
    await mongoose.connection.close();
};
