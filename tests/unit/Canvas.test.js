import mongoose from 'mongoose';
import Canvas from '../../src/models/Canvas.js';
import User from '../../src/models/User.js';
import { connect, closeDatabase, clearDatabase } from '../utils/db_handler.js';

beforeAll(async () => await connect());
afterEach(async () => await clearDatabase());
afterAll(async () => await closeDatabase());

describe('Canvas Model Unit Tests', () => {
    let mockUserId;

    beforeEach(() => {
        // Generate a mock ObjectId for owner/userId references
        mockUserId = new mongoose.Types.ObjectId();
    });

    it('should create and save a canvas successfully', async () => {
        const canvasData = {
            _id: 'canvas-uuid-1',
            name: 'My New Board',
            owner: mockUserId,
            participants: [
                {
                    userId: mockUserId,
                    role: 'owner'
                }
            ]
        };

        const validCanvas = new Canvas(canvasData);
        const savedCanvas = await validCanvas.save();

        expect(savedCanvas._id).toBe(canvasData._id);
        expect(savedCanvas.name).toBe(canvasData.name);
        expect(savedCanvas.owner.toString()).toBe(mockUserId.toString());
        expect(savedCanvas.participants.length).toBe(1);
        expect(savedCanvas.participants[0].userId.toString()).toBe(mockUserId.toString());
        expect(savedCanvas.participants[0].role).toBe('owner');
        expect(savedCanvas.is_locked).toBe(false); // default
        expect(savedCanvas.sync_status.isFullySynced).toBe(false); // default
    });

    it('should set default values correctly if not provided', async () => {
        const minimalCanvas = new Canvas({
            _id: 'canvas-uuid-2',
            owner: mockUserId
        });

        const savedCanvas = await minimalCanvas.save();

        expect(savedCanvas.name).toBe('Untitled Board');
        expect(savedCanvas.is_locked).toBe(false);
        expect(savedCanvas.participants.length).toBe(0);
        expect(savedCanvas.lastEditedAt).toBeDefined();
    });

    it('should fail validation if _id is missing', async () => {
        const canvasWithoutId = new Canvas({
            owner: mockUserId
        });

        let err;
        try {
            await canvasWithoutId.save();
        } catch (error) {
            err = error;
        }

        expect(err).toBeInstanceOf(mongoose.Error.ValidationError);
        expect(err.errors._id).toBeDefined();
    });

    it('should fail validation if owner is missing', async () => {
        const canvasWithoutOwner = new Canvas({
            _id: 'canvas-uuid-3'
        });

        let err;
        try {
            await canvasWithoutOwner.save();
        } catch (error) {
            err = error;
        }

        expect(err).toBeInstanceOf(mongoose.Error.ValidationError);
        expect(err.errors.owner).toBeDefined();
    });

    it('should fail validation if participant role is invalid', async () => {
        const invalidParticipantCanvas = new Canvas({
            _id: 'canvas-uuid-4',
            owner: mockUserId,
            participants: [
                {
                    userId: mockUserId,
                    role: 'invalid_role_value' // Enum validation should fail
                }
            ]
        });

        let err;
        try {
            await invalidParticipantCanvas.save();
        } catch (error) {
            err = error;
        }

        expect(err).toBeInstanceOf(mongoose.Error.ValidationError);
        expect(err.errors['participants.0.role']).toBeDefined();
    });
});
