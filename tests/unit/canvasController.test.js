import { jest, describe, it, expect, beforeEach } from '@jest/globals';

// 1. Define Mock Functions & Objects
const mockCanvas = {
    create: jest.fn(),
    findById: jest.fn(),
    find: jest.fn(),
    findOne: jest.fn(),
    findOneAndUpdate: jest.fn(),
    findByIdAndUpdate: jest.fn(),
};

const mockUser = {
    findByIdAndUpdate: jest.fn(),
    findById: jest.fn(),
    exists: jest.fn(),
};

const mockCanvasMembership = {
    findOneAndUpdate: jest.fn(),
    deleteMany: jest.fn(),
};

const mockCrypto = {
    randomUUID: jest.fn(() => 'mocked-uuid'),
};

// 2. Register Mocks using unstable_mockModule (MUST be before imports)
jest.unstable_mockModule('../../src/models/Canvas.js', () => ({ default: mockCanvas }));
jest.unstable_mockModule('../../src/models/User.js', () => ({ default: mockUser }));
jest.unstable_mockModule('../../src/models/canvasMembership.js', () => ({ default: mockCanvasMembership }));
jest.unstable_mockModule('node:crypto', () => ({ default: mockCrypto }));

// 3. Dynamic Import of Module Under Test
const {
    createCanvas,
    getUserCanvases,
    getCanvas,
    lockCanvas,
    addParticipant,
    updateCanvasName,
    deleteCanvas,
    joinCanvas
} = await import('../../src/controllers/canvasController.js');

describe('canvasController', () => {
    let mockReq;
    let mockRes;

    beforeEach(() => {
        jest.clearAllMocks();

        mockReq = {
            body: {},
            userId: 'test_user_id',
            user: { _id: 'test_user_id', id: 'test_user_id' },
            params: {}
        };
        mockRes = {
            status: jest.fn().mockReturnThis(),
            json: jest.fn()
        };
    });

    describe('createCanvas', () => {
        it('should create a canvas and update user successfully', async () => {
            mockReq.body = { name: 'My New Canvas' };

            const createdCanvas = {
                _id: 'mocked-uuid',
                name: 'My New Canvas',
                owner: 'test_user_id'
            };

            mockCanvas.create.mockResolvedValue(createdCanvas);
            mockUser.findByIdAndUpdate.mockResolvedValue(true);

            await createCanvas(mockReq, mockRes);

            expect(mockRes.status).toHaveBeenCalledWith(201);
            expect(mockRes.json).toHaveBeenCalledWith({
                canvasId: 'mocked-uuid',
                name: 'My New Canvas',
                url: '/board/mocked-uuid'
            });
        });
    });

    describe('getUserCanvases', () => {
        it('should return 404 if user is not found', async () => {
            const mockUserQuery = { select: jest.fn().mockResolvedValue(null) };
            mockUser.findById.mockReturnValue(mockUserQuery);

            await getUserCanvases(mockReq, mockRes);

            expect(mockRes.status).toHaveBeenCalledWith(404);
            expect(mockRes.json).toHaveBeenCalledWith({ message: 'User not found' });
        });

        it('should return formatted list of canvases for a user', async () => {
            const userData = {
                canvases: [
                    { canvasId: 'canvas-1', role: 'owner', lastAccessedAt: new Date('2024-01-01') }
                ]
            };
            const mockUserQuery = { select: jest.fn().mockResolvedValue(userData) };
            mockUser.findById.mockReturnValue(mockUserQuery);

            const canvasData = [{
                _id: 'canvas-1',
                name: 'Test Canvas',
                owner: { displayName: 'John Doe', avatar: 'pic.jpg' },
                is_locked: false,
                lastEditedAt: new Date('2024-01-02'),
                createdAt: new Date('2024-01-01'),
                participants: [{}]
            }];

            const mockCanvasQuery = {
                populate: jest.fn().mockReturnThis(),
                select: jest.fn().mockReturnThis(),
                sort: jest.fn().mockResolvedValue(canvasData)
            };
            mockCanvas.find.mockReturnValue(mockCanvasQuery);

            await getUserCanvases(mockReq, mockRes);

            expect(mockRes.status).toHaveBeenCalledWith(200);
            expect(mockRes.json).toHaveBeenCalledWith(
                expect.objectContaining({ canvases: expect.any(Array) })
            );
        });
    });

    describe('getCanvas', () => {
        it('should return canvas details successfully', async () => {
            mockReq.params = { id: 'canvas-1' };

            const mockCanvasQuery = {
                populate: jest.fn().mockResolvedValue({
                    _id: 'canvas-1',
                    name: 'Test Canvas',
                    owner: 'owner-id',
                    participants: [],
                    is_locked: false,
                    sync_status: {},
                    lastEditedAt: new Date(),
                    createdAt: new Date()
                })
            };
            mockCanvas.findById.mockReturnValue(mockCanvasQuery);

            await getCanvas(mockReq, mockRes);

            expect(mockRes.status).toHaveBeenCalledWith(200);
        });
    });

    // --- NEW MUTATION TESTS ---

    describe('lockCanvas', () => {
        it('should update lock state successfully', async () => {
            mockReq.params = { id: 'canvas-1' };
            mockReq.body = { is_locked: true };
            mockCanvas.findOneAndUpdate.mockResolvedValue({ _id: 'canvas-1', is_locked: true });

            await lockCanvas(mockReq, mockRes);

            expect(mockCanvas.findOneAndUpdate).toHaveBeenCalledWith(
                { _id: 'canvas-1', owner: 'test_user_id' },
                { $set: { is_locked: true } },
                { new: true }
            );
            expect(mockRes.status).toHaveBeenCalledWith(200);
            expect(mockRes.json).toHaveBeenCalledWith({ canvasId: 'canvas-1', is_locked: true });
        });

        it('should return 400 if is_locked is not a boolean', async () => {
            mockReq.params = { id: 'canvas-1' };
            mockReq.body = { is_locked: 'true' }; // invalid type

            await lockCanvas(mockReq, mockRes);

            expect(mockRes.status).toHaveBeenCalledWith(400);
            expect(mockRes.json).toHaveBeenCalledWith({ message: "is_locked must be a boolean" });
        });

        it('should return 404 if canvas not found or unauthorized', async () => {
            mockReq.params = { id: 'canvas-1' };
            mockReq.body = { is_locked: true };
            mockCanvas.findOneAndUpdate.mockResolvedValue(null);

            await lockCanvas(mockReq, mockRes);

            expect(mockRes.status).toHaveBeenCalledWith(404);
            expect(mockRes.json).toHaveBeenCalledWith({ message: "Canvas not found or unauthorized" });
        });
    });

    describe('addParticipant', () => {
        it('should add participant successfully', async () => {
            mockReq.params = { id: 'canvas-1' };
            mockReq.body = { userId: 'new-user-id', role: 'viewer' };

            mockCanvas.findOne.mockResolvedValue({ _id: 'canvas-1', owner: 'test_user_id' });
            mockUser.exists.mockResolvedValue(true);
            mockCanvasMembership.findOneAndUpdate.mockResolvedValue({ role: 'viewer' });

            await addParticipant(mockReq, mockRes);

            expect(mockCanvasMembership.findOneAndUpdate).toHaveBeenCalledWith(
                { canvasId: 'canvas-1', userId: 'new-user-id' },
                { $set: { role: 'viewer' } },
                { new: true, upsert: true }
            );
            expect(mockRes.status).toHaveBeenCalledWith(200);
        });

        it('should return 403 if user does not own canvas', async () => {
            mockReq.params = { id: 'canvas-1' };
            mockReq.body = { userId: 'new-user-id', role: 'viewer' };

            mockCanvas.findOne.mockResolvedValue(null); // Canvas not found with this owner

            await addParticipant(mockReq, mockRes);

            expect(mockRes.status).toHaveBeenCalledWith(403);
        });

        it('should default to editor role if invalid role given', async () => {
            mockReq.params = { id: 'canvas-1' };
            mockReq.body = { userId: 'new-user-id', role: 'admin_level_over_9000' };

            mockCanvas.findOne.mockResolvedValue({ _id: 'canvas-1', owner: 'test_user_id' });
            mockUser.exists.mockResolvedValue(true);
            mockCanvasMembership.findOneAndUpdate.mockResolvedValue({ role: 'editor' });

            await addParticipant(mockReq, mockRes);

            expect(mockCanvasMembership.findOneAndUpdate).toHaveBeenCalledWith(
                { canvasId: 'canvas-1', userId: 'new-user-id' },
                { $set: { role: 'editor' } },
                expect.any(Object)
            );
        });
    });

    describe('updateCanvasName', () => {
        it('should update name if caller is owner', async () => {
            mockReq.params = { id: 'canvas-1' };
            mockReq.body = { name: 'New Renamed Canvas' };

            const canvasMock = {
                _id: 'canvas-1',
                owner: { toString: () => 'test_user_id' },
                name: 'Old Name',
                save: jest.fn().mockResolvedValue(true)
            };
            mockCanvas.findOne.mockResolvedValue(canvasMock);

            await updateCanvasName(mockReq, mockRes);

            expect(canvasMock.name).toBe('New Renamed Canvas');
            expect(canvasMock.save).toHaveBeenCalled();
            expect(mockRes.status).toHaveBeenCalledWith(200);
        });

        it('should return 400 if name is missing', async () => {
            mockReq.params = { id: 'canvas-1' };
            mockReq.body = {}; // no name

            await updateCanvasName(mockReq, mockRes);

            expect(mockRes.status).toHaveBeenCalledWith(400);
        });
    });

    describe('deleteCanvas', () => {
        it('should delete canvas and memberships if caller is owner', async () => {
            mockReq.params = { id: 'canvas-1' };
            mockReq.user = { id: 'test_user_id' };

            const canvasMock = {
                _id: 'canvas-1',
                owner: { toString: () => 'test_user_id' },
                deleteOne: jest.fn().mockResolvedValue(true)
            };
            mockCanvas.findById.mockResolvedValue(canvasMock);
            mockCanvasMembership.deleteMany.mockResolvedValue(true);

            await deleteCanvas(mockReq, mockRes);

            expect(mockCanvasMembership.deleteMany).toHaveBeenCalledWith({ canvasId: 'canvas-1' });
            expect(canvasMock.deleteOne).toHaveBeenCalled();
            expect(mockRes.status).toHaveBeenCalledWith(200);
        });

        it('should return 403 if non-owner tries to delete', async () => {
            mockReq.params = { id: 'canvas-1' };
            mockReq.user = { id: 'not_owner_id' };

            const canvasMock = {
                _id: 'canvas-1',
                owner: { toString: () => 'test_user_id' }, // doesn't match not_owner_id
                deleteOne: jest.fn()
            };
            mockCanvas.findById.mockResolvedValue(canvasMock);

            await deleteCanvas(mockReq, mockRes);

            expect(mockRes.status).toHaveBeenCalledWith(403);
            expect(canvasMock.deleteOne).not.toHaveBeenCalled();
        });
    });

    describe('joinCanvas', () => {
        it('should join successfully and upsert membership', async () => {
            mockReq.params = { id: 'canvas-1' };
            mockReq.userId = 'joiner-1';

            const canvasMock = {
                _id: 'canvas-1',
                owner: { toString: () => 'owner-id' },
                participants: []
            };
            mockCanvas.findById.mockResolvedValue(canvasMock);
            mockCanvas.findByIdAndUpdate.mockResolvedValue(true);

            const userMock = {
                canvases: [],
                save: jest.fn()
            };
            mockUser.findById.mockResolvedValue(userMock);
            mockCanvasMembership.findOneAndUpdate.mockResolvedValue(true);

            await joinCanvas(mockReq, mockRes);

            expect(mockCanvasMembership.findOneAndUpdate).toHaveBeenCalled();
            expect(mockCanvas.findByIdAndUpdate).toHaveBeenCalled();
            expect(userMock.save).toHaveBeenCalled();
            expect(mockRes.status).toHaveBeenCalledWith(200);
        });
    });
});
