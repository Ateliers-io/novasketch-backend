import mongoose from 'mongoose';

export const connect = async () => {
    const uri = process.env.MONGO_URI;
    if (mongoose.connection.readyState === 0) {
        await mongoose.connect(uri);
    }
};

export const closeDatabase = async () => {
    await mongoose.connection.dropDatabase();
    await mongoose.connection.close();
};

export const clearDatabase = async () => {
    const collections = mongoose.connection.collections;
    for (const key in collections) {
        const collection = collections[key];
        await collection.deleteMany();
    }
};
