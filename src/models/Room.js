import mongoose from 'mongoose';

const RoomSchema = new mongoose.Schema({
    _id: String,
    data: Buffer
}, { timestamps: true });

const Room = mongoose.model('Room', RoomSchema);

export default Room;
