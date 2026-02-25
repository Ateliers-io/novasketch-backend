import express from 'express';
import { createSession, getSession, lockSession } from '../controllers/sessionController.js';

const router = express.Router();

router.post('/', createSession);
router.get('/:id', getSession);
router.patch('/:id/lock', lockSession);

export default router;
