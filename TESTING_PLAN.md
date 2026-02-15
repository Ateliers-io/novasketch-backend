# NovaSketch Backend Testing Plan

## 1. Resolved Issues
The following issues prevented the test suite from running correctly and have been resolved:
- **Database Connection Timeouts**: Fixed by switching from a local MongoDB connection string to `mongodb-memory-server`. This ensures an isolated, transient database for every test run without external dependencies.
- **Missing Dependencies**: Installed `supertest` for HTTP integration testing and `mongodb-memory-server` for database mocking.
- **Test Timeouts**: Increased global test timeout to 60s to accommodate the initial download of the MongoDB binary by the memory server.
- **Teardown Errors**: Ensured `mongoose` connections are properly closed after tests using the updated `db_handler.js`.

Result: All **65 tests** across 7 test suites are now passing.

## 2. Recommended Future Testing Tasks
The following areas require additional testing coverage. These tasks should be implemented sequentially.

### A. Authentication Integration Tests (`tests/integration/authRoutes.test.js`)
- [ ] **POST /api/auth/google**: Test full flow with mocked Google Verify API.
  - Success case: Returns valid JWT and user data.
  - Failure case: Handles invalid Google tokens gracefully.
- [ ] **GET /api/auth/me**: Test retrieval of current user profile.
  - Verify `protect` middleware integration.
  - Ensure correct user fields are returned.

### B. WebSocket & Real-time Sync Integration Tests (`tests/integration/websocket.test.js`)
- [ ] **Connection Handshake**: Test that clients can connect to `ws://localhost:PORT` and receive initial sync step 1.
- [ ] **Broadcast Logic**:
  - Connect Client A and Client B to `room-1`.
  - Client A sends an update (e.g., adds a shape).
  - callback: Verify Client B receives the exact same update.
- [ ] **Awareness/Cursor Propagation**:
  - Client A moves mouse (updates awareness).
  - Verify Client B receives awareness update.

### C. Persistence Integration Tests
- [ ] **Save on Update**:
  - Connect a client via WebSocket.
  - Make changes.
  - Wait for debounce timeout (2s).
  - Verify data is actually written to the `rooms` collection in MongoDB.
- [ ] **Load on Connect**:
  - Seed `rooms` collection with Yjs binary data.
  - New client connects to that room.
  - Verify client receives the seeded data in the initial sync.

### D. Edge Case & robustness Testing
- [ ] **Invalid Binary Data**: Send malformed binary arrays over WebSocket and ensure server doesn't crash.
- [ ] **Max Payload Size**: Test handling of very large updates (e.g., pasting extensive content).
- [ ] **Database Disconnect**: Simulate MongoDB disconnection during active WebSocket session and ensure server attempts reconnection or handles error without crashing.

## 3. General Tasks
- [ ] **CI/CD Integration**: Add a GitHub Action workflow to run `pnpm test` on every push.
- [ ] **Code Coverage**: Aim for >80% coverage. Run `pnpm run test:coverage` to identify gaps.
