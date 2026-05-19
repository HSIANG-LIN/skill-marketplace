---
name: benchmaster-hybrid-communication
description: A hybrid MQTT + REST architecture pattern for remote-controlled hardware devices.
category: software-development
---

# BenchMaster Hybrid Communication Architecture

A robust, scalable pattern for remote-controlling hardware devices (Agents) via a central Controller over the internet.

## Architecture Overview

The system uses a **Hybrid Communication Model** to balance real-time responsiveness with data reliability.

### 1. Control Plane (MQTT)
**Purpose**: Low-latency, lightweight signaling and real-time command/control.
- **Mechanism**: Agents and Controllers connect to a central MQTT Broker (e.g., Mosquitto, EMQX).
- **Agent Topics**:
  - `benchmaster/agent/{machine_id}/tasks`: **Subscribes** to receive commands (e.g., `START`, `ABORT`).
  - `benchmaster/agent/{machine_id}/status`: **Publishes** heartbeat and real-time status.
- **Controller Topics**:
  - **Publishes** tasks to `{machine_id}/tasks`.
  - **Subscribes** to `{machine_id}/status` for real-time dashboard updates.
- **Key Advantages**:
  - **NAT/Firewall Traversal**: Agents only make outbound connections, making it "Zero-Config" for remote sites.
  - **Scalability**: Extremely efficient for thousands of concurrent real-time connections.
  - **Low Latacy**: Near-instant command execution.

### 2. Data Plane (REST API)
**Purpose**: Reliable, high-volume data transfer.
- **Mechanism**: Standard HTTP/HTTPS requests to a FastAPI/Flask server.
- **Endpoints**:
  - `POST /machines/`: Initial device registration and identity handshake.
  - `POST /results/`: Uploading large JSON benchmark scores.
  - `POST /logs/`: Uploading large text/log files.
- **Key Advantages**:
  - **Reliability**: Built-in support for large payloads and retry logic.
  - **Security**: Leverages standard authentication (e.g., `X-Agent-Token`).

## Implementation Pitfalls & Best Practices

### PyQt6 Layout Gotcha
`QFormLayout` does not support `.addStretch()`. To add vertical space at the bottom of a form:
1. Create a `QVBoxLayout`.
2. Create a `QFormLayout`.
3. Add the `QFormLayout` to the `QVBoxLayout` via `addLayout()`.
4. Call `.addStretch()` on the `QVBoxLayout`.

### Testing Background Threads in PyQt
When testing `QThread` workers that run infinite loops (e.g., `while self.is_running:`):
- **Do NOT** wait for the `.finished` signal, as it will only trigger on application exit.
- **DO** implement and wait for a custom signal (e.g., `hardware_scanned` or `task_completed`) to verify the thread is operational.

### CI/CD Integration
- Ensure all new dependencies (e.g., `paho-mqtt`) are added to `requirements.txt`.
- Ensure the GitHub Actions workflow (e.g., `.github/workflows/build_agent.yml`) is configured to install these dependencies during the build process.

## Remote Visual Automation Extension

The MQTT control plane can be extended from benchmark-tasks-only to full visual desktop automation by adding these command actions:

| Action | Payload | Purpose |
|--------|---------|---------|
| `click` | `{x, y}` or `{text, confidence}` | Click at coordinate or text center |
| `double_click` | `{x, y}` | Double-click |
| `type` | `{text, interval}` | Keyboard input |
| `hotkey` | `{keys: ["ctrl", "c"]}` | Keyboard shortcut |
| `screenshot` | `{}` → returns base64 PNG | Full screen capture |
| `screenshot_region` | `{x, y, w, h}` | Region capture |

**Keep LLM on control side:** The remote machine sends screenshots via MQTT. The control side runs the multi-layer locator (OCR/image matching from `windows-ui-automation`) locally against the received screenshot, then sends only action commands back. No LLM needed on the test machine.

See `windows-ui-automation` skill → `references/remote-visual-automation.md` for full SOP format and topic layout.
