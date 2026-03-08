import mongoose from 'mongoose';
import CanvasMembership from '../../src/models/canvasMembership.js';
import { connect, closeDatabase, clearDatabase } from '../utils/db_handler.js';

beforeAll(async () => await connect());
afterEach(async () => await clearDatabase());
afterAll(async () => await closeDatabase());

describe('CanvasMembership Model Unit Tests', () => {
    let mockUserId;
    const mockCanvasId = 'canvas-uuid-1';

    beforeEach(() => {
        mockUserId = new mongoose.Types.ObjectId();
    });

    it('should create and save a canvas membership successfully', async () => {
        const membershipData = {
            canvasId: mockCanvasId,
            userId: mockUserId,
            role: 'editor'
        };

        const membership = new CanvasMembership(membershipData);
        const savedMembership = await membership.save();

        expect(savedMembership._id).toBeDefined();
        expect(savedMembership.canvasId).toBe(mockCanvasId);
        expect(savedMembership.userId.toString()).toBe(mockUserId.toString());
        expect(savedMembership.role).toBe('editor');
        expect(savedMembership.lastAccessedAt).toBeDefined(); // default Date.now
    });

    it('should fail validation if required fields are missing', async () => {
        const invalidMembership = new CanvasMembership({});

        let err;
        try {
            await invalidMembership.save();
        } catch (error) {
            err = error;
        }

        expect(err).toBeInstanceOf(mongoose.Error.ValidationError);
        expect(err.errors.canvasId).toBeDefined();
        expect(err.errors.userId).toBeDefined();
        expect(err.errors.role).toBeDefined();
    });

    it('should fail validation if role is invalid', async () => {
        const membershipData = {
            canvasId: mockCanvasId,
            userId: mockUserId,
            role: 'invalid_role_enum_value' // Should be 'owner', 'editor', or 'viewer'
        };

        const invalidRoleMembership = new CanvasMembership(membershipData);

        let err;
        try {
            await invalidRoleMembership.save();
        } catch (error) {
            err = error;
        }

        expect(err).toBeInstanceOf(mongoose.Error.ValidationError);
        expect(err.errors.role).toBeDefined();
    });

    it('should fail to create duplicate memberships for the same canvasId and userId', async () => {
        const membershipData = {
            canvasId: mockCanvasId,
            userId: mockUserId,
            role: 'owner'
        };

        // Save first membership
        const firstMembership = new CanvasMembership(membershipData);
        await firstMembership.save();

        // Attempt to save a second membership with the same composite key
        const duplicateMembership = new CanvasMembership({
            ...membershipData,
            role: 'viewer' // Even with different role, the combination of canvasId and userId should be unique
        });

        let err;
        try {
            await duplicateMembership.save();
        } catch (error) {
            err = error;
        }

        expect(err).toBeDefined();
        // Since unique index `{ canvasId: 1, userId: 1 }` is applied,
        // MongoDB should throw a duplicate key error.
        expect(err.code).toBe(11000);
    });
});
