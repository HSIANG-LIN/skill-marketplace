---
name: benchmark-parser-testing
description: A workflow for developing and testing robust parsers for Windows-based benchmark tools in Linux/WSL2 environments.
---

# benchmark-parser-testing

## Overview
A workflow for developing and testing robust parsers for Windows-based benchmark tools when working in a Linux/WSL2 environment.

## When to use
- When you need to write parsers for software you cannot execute directly in your current environment (e.g., Windows `.exe` on Linux).
- When testing regex-based extraction logic for log files.

## Workflow
1. **Format Reconnaissance**: Identify the exact text/console output format of the target tool. Search for "command line output example" or examine available documentation.
2. **Mock Log Generation**: Create a `mock_log.txt` file that mimics the real output. Include:
    - Standard successful runs.
    - Edge cases (e.g., extremely high/low values, different decimal precisions).
    - Potential error states or incomplete logs.
3. **Interface Definition**: Implement a `BaseParser` abstract class to ensure all parsers provide a consistent `parse(content: str) -> Dict[str, Any]` interface.
4. **Regex Implementation**: Use robust regex patterns in the subclass to extract metrics.
5. **Module-Aware Testing**: Run tests using the `-m` flag (e.g., `python3 -m parsers.my_parser`) to ensure relative imports and package structures work correctly.

## Pitfalls
- **Relative Imports**: Avoid running parser scripts directly (e.g., `python parsers/my_parser.py`) as this causes `ImportError` with relative imports. Always run as a module from the project root.
- **Path Sensitivity**: Be careful with file paths in the mock logs; use absolute paths or paths relative to the project root.
- **SQLite JSON**: Remember that SQLite's `json_extract` syntax might differ from other SQL dialects when testing queries against JSON columns.
