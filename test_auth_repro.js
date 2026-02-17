
import "dotenv/config";
import mongoose from "mongoose";
import { MongoMemoryServer } from "mongodb-memory-server";
import app from "./src/app.js";
import request from "supertest";

// Mock user data
const newUser = {
    name: "Test User",
    email: "testuser@example.com",
    password: "Password123!"
};

async function runTest() {
    let mongoServer;
    try {
        mongoServer = await MongoMemoryServer.create();
        const uri = mongoServer.getUri();
        await mongoose.connect(uri);

        console.log("Connected to in-memory DB");

        // Test Registration
        console.log("Attempting registration...");
        const res = await request(app)
            .post("/api/auth/register")
            .send(newUser);

        console.log("Registration Status:", res.status);
        console.log("Registration Body:", JSON.stringify(res.body, null, 2));

        if (res.status === 201) {
            console.log("Registration successful.");
        } else {
            console.error("Registration failed.");
        }

        // Test Login
        console.log("\nAttempting login...");
        const loginRes = await request(app)
            .post("/api/auth/login")
            .send({
                email: newUser.email,
                password: newUser.password
            });

        console.log("Login Status:", loginRes.status);
        console.log("Login Body:", JSON.stringify(loginRes.body, null, 2));

    } catch (err) {
        console.error("Test Error:", err);
    } finally {
        await mongoose.disconnect();
        if (mongoServer) await mongoServer.stop();
    }
}

runTest();
