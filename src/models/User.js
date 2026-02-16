// User.js Mongoose model for authenticated users.
//
// We only support Google OAuth right now, so googleId is the primary identity key.
//
// Used by: authController.js (find-or-create on login), authMiddleware.js (JWT lookup)

import mongoose from "mongoose";

const userSchema = new mongoose.Schema(
    {
        googleId: {
            type: String,
            required: true,
            unique: true, // One Mongo doc per Google account
        },
        email: {
            type: String,
            required: true,
        },
        displayName: {
            type: String,
            required: true,
        },
        avatar: {
            type: String,
            default: "",
        },
    },
    { timestamps: true } // createdAt/updatedAt for auditing
);

const User = mongoose.model("User", userSchema);

export default User;
