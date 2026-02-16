// health.js: liveness checker
// Used by load balancers, Docker healthchecks, and uptime monitors.
// Doesn't check Mongo so we can distinguish "server is up but DB is down" from "server is down".

import { Router } from "express";
const router = Router();

router.get("/", (req, res) => {
  res.json({ status: "OK" });
});

export default router;
