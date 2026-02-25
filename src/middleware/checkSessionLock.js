import Session from '../models/Session.js';

// checkSessionLock: Guards any route from writes when a session is locked.
// Expects :id param.
// Returns 403 if the session is locked, 404 if not found, otherwise calls next().
const checkSessionLock = async (req, res, next) => {
    try {
        const sessionId = req.params.id;
        const session = await Session.findById(sessionId);

        if (!session) {
            return res.status(404).json({ message: 'Session not found' });
        }

        if (session.is_locked) {
            return res.status(403).json({ error: 'Session is locked' });
        }

        next();
    } catch (error) {
        console.error('Error in checkSessionLock:', error);
        res.status(500).json({ message: 'Server error checking session lock' });
    }
};

export default checkSessionLock;
