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
    }
}, { timestamps: true });

const Session = mongoose.model('Session', SessionSchema);

export default Session;
