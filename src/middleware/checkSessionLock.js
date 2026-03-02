import Canvas from '../models/Canvas.js';

// checkSessionLock: Guards any route from writes when a canvas is locked.
// Expects :id param.
// Returns 403 if the canvas is locked, 404 if not found, otherwise calls next().
const checkSessionLock = async (req, res, next) => {
    try {
        const canvasId = req.params.id;
        const canvas = await Canvas.findById(canvasId);

        if (!canvas) {
            return res.status(404).json({ message: 'Canvas not found' });
        }

        if (canvas.is_locked) {
            return res.status(403).json({ error: 'Canvas is locked' });
        }

        next();
    } catch (error) {
        console.error('Error in checkSessionLock:', error);
        res.status(500).json({ message: 'Server error checking canvas lock' });
    }
};

export default checkSessionLock;

