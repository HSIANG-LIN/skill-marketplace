---
name: roadmap-validation-workflow
description: A systematic approach to validating a proposed development roadmap against the actual current state of a multi-component codebase. This prevents "building on sand" by ensuring that the underlying data-flow and integration gaps are addressed before high-level features are implemented.
category: software-development
---

# roadmap-validation-workflow

## Description
A systematic approach to validating a proposed development roadmap against the actual current state of a multi-component codebase. This prevents "building on sand" by ensuring that the underlying data-flow and integration gaps are addressed before high-level features are implemented.

## When to use
- When a project has multiple moving parts (e.g., Client, Server, Database, Parser, UI).
- When a proposed "next step" seems disconnected from the current technical reality.
- When the project roadmap is provided but its alignment with the existing implementation is unverified.

## Workflow

### 1. Component Audit
Do not assume a component is "done" just because the folder exists. 
- Use `ls -R` to map the directory structure.
- Inspect key files in each component (e.g., `api/`, `agent/`, `db/`, `parsers/`) to verify if they are "shells" (interfaces only) or "implementations" (logic present).

### 2. Data-Flow Tracing (The "Golden Path" Test)
Pick a primary entity (e.g., a `Job`, a `Result`, or a `Machine`) and trace its lifecycle through the code:
- **Trigger**: How is it created? (e.g., API call? Cron job?)
- **Dispatch**: How is it communicated? (e.g., MQTT? REST?)
- **Execution**: Does the receiver (the Agent/Worker) actually have the logic to process it?
- **Parsing/Transformation**: Is there code to convert raw output into the required schema?
- **Persistence**: Is there code to save the final state back to the database?
- **Observation**: Is there a way for the user to see the final state?

### 3. Gap Identification
Identify where the chain breaks. Common gaps include:
- **The "Brainless Agent"**: Client can connect but cannot execute or report.
- **The "Silent Dispatcher"**: Server creates records in DB but never triggers the communication protocol.
- **The "Orphaned Parser"**: Parsers exist but are never invoked by the worker.
- **The "Missing Schema"**: Models are missing columns required by the communication/parsing logic.

### 4. Course Correction
Propose a revised roadmap that prioritizes the **"Closing of the Gap"** over the **"Building of the Feature"**. 

## Pitfalls
- **Confusing UI with Functionality**: A beautiful Dashboard does not mean the system is working; it only means the *view* of the system is ready.
- **Assuming Library Presence**: Just because `requirements.txt` has a library doesn't mean the code actually utilizes it correctly.
- **Ignoring the 'Passive' Components**: Forgetting that a system is only as fast as its slowest link (e.g., a fast API is useless if the Agent doesn't report results).
