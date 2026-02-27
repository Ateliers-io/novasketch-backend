// health.js: liveness checker
// Used by load balancers, Docker healthchecks, and uptime monitors.
// Doesn't check Mongo so we can distinguish "server is up but DB is down" from "server is down".

import { Router } from "express";
const router = Router();

/**
 * @swagger
 * /health:
 *   get:
 *     summary: Health check
 *     description: Liveness probe for load balancers and uptime monitors. Does not check database connectivity.
 *     tags: [Health]
 *     responses:
 *       200:
 *         description: Server is running
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status:
 *                   type: string
 *                   example: OK
 */
router.get("/", (req, res) => {
  res.json({ status: "OK" });
});

export default router;
