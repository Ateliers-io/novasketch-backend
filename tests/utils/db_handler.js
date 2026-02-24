import mongoose from 'mongoose';

export const connect = async () => {
    // If we want to use in-memory:
    mongo = await MongoMemoryServer.create();
    const uri = mongo.getUri();

    // Using local test DB as per setup.js:
    // const uri = process.env.MONGO_URI || 'mongodb://localhost:27017/novasketch-test';

    // Ensure we don't connect if already connected (for multi-test runs sharing connection, although usually Jest isolates files)
    if (mongoose.connection.readyState === 0) {
        await mongoose.connect(uri);
    }
};

export const closeDatabase = async () => {
    await mongoose.connection.dropDatabase();
    await mongoose.connection.close();
    if (mongo) {
        await mongo.stop();
    }
};

export const clearDatabase = async () => {
    const collections = mongoose.connection.collections;
    for (const key in collections) {
        const collection = collections[key];
        await collection.deleteMany();
    }
};
