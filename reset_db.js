// reset_db.js: drops ALL collections in the database.
// Run this manually when you need a clean slate during development.

import mongoose from "mongoose";

const MONGO_URI = "mongodb://localhost:27017/novasketch";

const reset = async () => {
  await mongoose.connect(MONGO_URI);
  const collections = await mongoose.connection.db.listCollections().toArray();

  for (const col of collections) {
    await mongoose.connection.db.dropCollection(col.name);
    console.log(`Dropped: ${col.name}`);
  }

  console.log("Database reset complete.");
  process.exit(0);
};

reset();