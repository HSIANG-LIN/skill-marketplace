---
name: benchmaster-agent-communication
description: Pattern for secure, automated, and zero-config communication between a lightweight Agent and a central Controller using UDP discovery and Token-based auth.
---

# BenchMaster Agent Communication Pattern

This skill outlines the design pattern for implementing a secure, automated, and "zero-config" communication link between a lightweight Agent (running on target machines) and a Central Controller (FastAPI-based).

## Pattern Overview

The pattern uses a combination of **UDP Broadcast Discovery** for networking and **Token-based HTTP Authentication** for secure command/data exchange.

### 1. Discovery Phase (Zero-Config)
To avoid manual IP configuration on target machines:
- **Agent**: Periodically (or on startup) broadcasts a UDP packet (`DISCOVERY_REQ`) to a specific port (e.g., `55555`).
- **Controller**: Runs a background UDP listener. Upon receiving the request, it responds with a unicast UDP packet containing its IP address (`DISCOVERY_RES:<IP>`).
- **Agent**: Once the IP is received, the agent switches from "Searching" to "Connecting" mode using the discovered IP.

### 2. Secure Communication Phase
Once the IP is known, all communication transitions to HTTPS/HTTP using a pre-shared key (PSK).
- **Authentication**: Every request from the Agent to the Controller must include the header `X-Agent-Token: <YOUR_SECRET_TOKEN>`.
- **Controller Enforcement**: The Controller uses a FastAPI dependency to validate this header on all sensitive routes (e.g., registration, task polling, result uploading).

### 3. Communication Lifecycle
- **Heartbeat**: Agent sends a `GET /api/health` request every $N$ seconds to maintain `ONLINE` status in the Controller.
- **Task Polling**: Agent performs a `GET /jobs/` request to check for pending tasks assigned to its `machine_id`.
- **Data Upload**: After executing a task, the Agent performs a `POST /results/` request, uploading JSON-encoded scores and system snapshots.

## Implementation Snippets

### Agent-side (Python/PyQt)
```python
# UDP Discovery snippet
sock = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
sock.setsockopt(socket.SOL_SOCKET, socket.SO_BROADCAST, 1)
sock.sendto(b"BENCHMASTER_DISCOVER_REQ", ('<broadcast>', 55555))

# Secure Request snippet
headers = {"X-Agent-Token": "MY_SECRET_KEY"}
requests.post(f"http://{controller_ip}:8000/machines/", json=data, headers=headers)
```

### Controller-side (FastAPI)
```python
# Dependency for authentication
async def verify_agent_token(x_agent_token: str = Header(None)):
    if x_agent_token != os.getenv("AGENT_AUTH_TOKEN"):
        raise HTTPException(status_code=401, detail="Invalid Agent Authentication Token")
    return x_agent_token

# Route usage
@router.post("/machines/", dependencies=[Depends(verify_agent_token)])
async def register_machine(...):
    ...
```

## Best Practices
- **Token Rotation**: Periodically update the `AGENT_AUTH_TOKEN` across all agents and the controller.
- **Graceful Degradation**: If UDP discovery fails, allow the Agent to fallback to a manually configured IP/URL in the Settings UI.
- **Error Handling**: Implement exponential backoff for connection retries in the Agent to prevent "thundering herd" problems on the Controller.
