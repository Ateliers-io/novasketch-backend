import mongoose from 'mongoose';
import User from '../../src/models/User.js';
import { connect, closeDatabase, clearDatabase } from '../utils/db_handler.js';

beforeAll(async () => await connect());
afterEach(async () => await clearDatabase());
afterAll(async () => await closeDatabase());

describe('User Model Test', () => {
    it('create & save user successfully', async () => {
        const userData = {
            googleId: '12345',
            email: 'test@example.com',
            displayName: 'Test User'
        };
        const validUser = new User(userData);
        const savedUser = await validUser.save();

        expect(savedUser._id).toBeDefined();
        expect(savedUser.googleId).toBe(userData.googleId);
        expect(savedUser.email).toBe(userData.email);
        expect(savedUser.displayName).toBe(userData.displayName);
        expect(savedUser.avatar).toBe(""); // Default value
    });

    it('create user without required field should fail', async () => {
        const userWithoutRequiredField = new User({ email: 'test@example.com' });
        let err;
        try {
            await userWithoutRequiredField.save();
        } catch (error) {
            err = error;
        }
        expect(err).toBeInstanceOf(mongoose.Error.ValidationError);
        expect(err.errors.googleId).toBeDefined();
        expect(err.errors.displayName).toBeDefined();
    });

    it('create duplicate googleId should fail', async () => {
        const userData = {
            googleId: '12345',
            email: 'test@example.com',
            displayName: 'Test User'
        };
        await new User(userData).save();

        const duplicateUser = new User(userData);
        let err;
        try {
            await duplicateUser.save();
        } catch (error) {
            err = error;
        }
        expect(err).toBeDefined();
        expect(err.code).toBe(11000); // MongoDB duplicate key error code
    });
});
