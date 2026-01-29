import mongoose from "mongoose";

// Your Connection String
const MONGO_URI = "mongodb+srv://kurapatikushalnarasimha95_db_user:yEm04oUnfCLuYD6E@cluster0.sqnkvlt.mongodb.net/?appName=Cluster0";

async function wipeDB() {
  try {
    console.log("🔌 Connecting to MongoDB...");
    await mongoose.connect(MONGO_URI);
    
    console.log("🔥 Wiping database...");
    await mongoose.connection.db.dropDatabase();
    
    console.log("✅ Database successfully wiped clean!");
    process.exit(0);
  } catch (err) {
    console.error("❌ Error:", err);
    process.exit(1);
  }
}

wipeDB();