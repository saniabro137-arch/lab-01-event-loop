# LAB 08 — Docker and Containerization

## Implemented features

- Multi-stage Docker build
- Node.js 24 Alpine runtime
- Docker Compose configuration
- Non-root container execution
- Environment variables configuration
- HTTP healthcheck
- Prometheus metrics
- WebSocket communication
- Persistent Docker volume for NDJSON logs
- Replay API
- Graceful shutdown

## Run

    docker compose up -d --build --wait

## Verification

    docker compose ps
    curl http://localhost:3081/health
    curl http://localhost:3081/api/rooms
    curl http://localhost:3081/metrics
    docker compose exec game id

## Automated tests

    npm run typecheck
    npm run build
    npm test

Results:
- TypeScript: passed
- Build: passed
- Vitest test files: 8 passed
- Vitest tests: 66 passed
- Container health: healthy
- WebSocket: passed
- Replay API: HTTP 200 OK
- Volume persistence: passed
- Graceful shutdown: exit code 0

## Stop

    docker compose down

## Conclusion

The Space Flight application was successfully
containerized using Docker and Docker Compose.
HTTP, WebSocket, persistent storage, metrics,
and graceful shutdown were verified.
