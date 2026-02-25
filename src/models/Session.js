import mongoose from 'mongoose';

const SessionSchema = new mongoose.Schema({
    _id: {
        type: String,
        required: true
    },
    name: {
        type: String,
        default: "Untitled Board"
    },
    createdBy: {
        type: String,
        default: "anonymous"
    },
    is_locked: {
        type: Boolean,
        default: false
    }
}, { timestamps: true });

const Session = mongoose.model('Session', SessionSchema);

export default Session;
