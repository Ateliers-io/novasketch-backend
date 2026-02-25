import Session from '../models/Session.js';
import crypto from 'crypto';

export const createSession = async (req, res) => {
    try {
        const { name } = req.body;
        const sessionId = crypto.randomUUID();

        // If authMiddleware is applied, req.user might exist. 
        // We handle both authenticated and anonymous users
        let createdBy = 'anonymous';
        if (req.user && req.user.id) {
            createdBy = req.user.id;
        }

        const newSession = new Session({
            _id: sessionId,
            name: name || 'Untitled Board',
            createdBy
        });

        await newSession.save();

        res.status(201).json({
            sessionId,
            url: `/board/${sessionId}`
        });
    } catch (error) {
        console.error('Error creating session:', error);
        res.status(500).json({ message: 'Server error creating session' });
    }
};

export const getSession = async (req, res) => {
    try {
        const { id } = req.params;
        const session = await Session.findById(id);

        if (!session) {
            return res.status(404).json({ message: 'Session not found' });
        }

        res.status(200).json({
            sessionId: session._id,
            name: session.name,
            createdBy: session.createdBy,
            is_locked: session.is_locked,
            createdAt: session.createdAt
        });
    } catch (error) {
        console.error('Error getting session:', error);
        res.status(500).json({ message: 'Server error retrieving session' });
    }
};
