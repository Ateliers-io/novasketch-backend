// models/CanvasMembership.js
const membershipSchema = new mongoose.Schema({
    canvasId: { type: mongoose.Schema.Types.ObjectId, ref: 'Canvas', required: true, index: true },
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    role: { type: String, enum: ['owner', 'editor', 'viewer'], required: true },
    lastAccessedAt: { type: Date, default: Date.now }
});

// Prevent duplicate memberships at the database level
membershipSchema.index({ canvasId: 1, userId: 1 }, { unique: true });