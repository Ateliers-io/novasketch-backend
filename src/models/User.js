// User.js Mongoose model for authenticated users.
//
// We only support Google OAuth right now, so googleId is the primary identity key.
//
// Used by: authController.js (find-or-create on login), authMiddleware.js (JWT lookup)

import mongoose from "mongoose";
import bcrypt from "bcrypt";

// Regex patterns — shared between model validation and controller-level checks.
// Keeping them here as the single source of truth.
const EMAIL_REGEX = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
const DISPLAY_NAME_REGEX = /^[a-zA-Z][a-zA-Z0-9 _-]{1,29}$/;
// min 8 chars, at least 1 uppercase, 1 lowercase, 1 digit, 1 special char
const PASSWORD_REGEX = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&#^()_\-+=])[A-Za-z\d@$!%*?&#^()_\-+=]{8,64}$/;

const userSchema = new mongoose.Schema(
    {
        googleId: {
            type: String,
            unique: true,
            sparse: true, // allows null — not every user signs up via Google
        },
        email: {
            type: String,
            required: [true, "Email is required"],
            unique: true,
            lowercase: true,
            trim: true,
            match: [EMAIL_REGEX, "Invalid email format"],
        },
        displayName: {
            type: String,
            required: [true, "Display name is required"],
            trim: true,
            match: [DISPLAY_NAME_REGEX, "Display name must be 2-30 characters, start with a letter, and contain only letters, numbers, spaces, hyphens, or underscores"],
        },
        password: {
            type: String,
            // not required — Google OAuth users won't have one
            select: false, // never returned in queries by default
        },
        avatar: {
            type: String,
            default: "",
        },
        authProvider: {
            type: String,
            enum: ["local", "google"],
            default: "local",
        },
        canvases: [{
            canvasId: {
                type: String,
                ref: "Canvas",
                required: true,
            },
            role: {
                type: String,
                enum: ["owner", "editor", "viewer"],
                default: "editor",
            },
            lastAccessedAt: {
                type: Date,
                default: Date.now,
            },
        }],
        lastLoginAt: {
            type: Date,
            default: Date.now,
        },
    },
    { timestamps: true } // createdAt/updatedAt for auditing
);

// Hash password before saving, only when modified
userSchema.pre("save", async function () {
    if (!this.isModified("password") || !this.password) return;

    // Hash the password
    const salt = await bcrypt.genSalt(12);
    this.password = await bcrypt.hash(this.password, salt);
});

// Instance method to compare passwords during login
userSchema.methods.comparePassword = async function (candidatePassword) {
    if (!this.password) return false;
    return bcrypt.compare(candidatePassword, this.password);
};

const User = mongoose.model("User", userSchema);

// Export regex patterns so the controller can use them for pre-validation
export { EMAIL_REGEX, DISPLAY_NAME_REGEX, PASSWORD_REGEX };
export default User;
