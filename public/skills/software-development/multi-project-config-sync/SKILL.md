---
name: multi-project-config-sync
category: software-development
description: Workflow for managing and synchronizing configuration settings across multiple development projects.
---
# multi-project-config-sync

Workflow for managing and synchronizing configuration settings across multiple development projects.

## When to use
- When configuration values need to be consistent across different project directories.
- To align local project settings with shared workspace configurations.
- When resolving discrepancies between various config files (e.g., `.env`, `.yaml`).

## Workflow

### 1. Discovery
- **Search Files**: Use `search_files` to find where a specific configuration key is currently defined.
- **Check Formats**: Verify if the setting is in a `.env` file, a `.yaml` file, or a script.
- **Validate Path**: Ensure the identified file is the correct target for synchronization.

### 2. Identify Target File
- Determine the correct configuration file for the workspace.
- Review the target file to ensure additions are made without disturbing existing entries.

### 3. Configuration Synchronization
- **Step A (Read)**: Read the current value from the local project configuration.
- **Step B (Apply)**: Add the key-value pair to the shared configuration file.
- **Step C (Update Consumer)**: Ensure the project that uses the setting is updated.
  - **Note**: If a YAML config uses a placeholder (e.g., `${VAR}`) but the application's parser (e.g., `yaml.safe_load`) does not support auto-resolution, replace the placeholder with the actual value in the YAML file to ensure it works immediately.
- **Step D (Finalize)**: Remove the redundant local entry to ensure consistency.

## Pitfalls
- **Parsing Logic**: Do not assume that all configuration loaders automatically resolve environment variables. Always verify the loading implementation in the source code.
- **Conflict Risks**: If both a local and a shared config exist, the application might use the wrong one if the loading order is not explicitly managed.
- **Typo Risks**: Ensure key names match exactly between the shared file and the consumer's configuration.