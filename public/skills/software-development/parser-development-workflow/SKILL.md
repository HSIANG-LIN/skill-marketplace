---
name: parser-development-workflow
description: A workflow for implementing and testing parsers in multi-component systems, particularly when real-world data is inaccessible due to environmental constraints.
category: software-development
---

# Parser Development Workflow

A structured approach for implementing data parsers (e.g., for benchmark logs) in a multi-component architecture, specifically designed for scenarios where the developer is working in an environment (like Linux/WSL) that cannot natively execute the target software (like Windows-only benchmarks).

## Workflow

1.  **Establish an Abstraction Layer**:
    *   Create a `BaseParser` (Abstract Base Class) in a shared directory.
    *   Enforce a consistent interface (e.g., `parse(content: str) -> Dict[str, Any]`) and mandatory properties (e.g., `name`).
    *   This ensures all parsers can be managed polymorphically by the main controller.

2.  **Analyze Target Data Format**:
    *   Research the exact text/log output format of the target software through documentation or web searches.
    *   Identify the specific patterns/keys for all required metrics.

3.  **The Mocking Pivot (Unblocking Strategy)**:
    *   **When blocked** by environmental mismatches (e.g., OS incompatibility) or external restrictions (e.g., bot detection), pivot to creating **representative dummy data**.
    *   Generate a log file that mimics the target output, including potential "noise" (e.g., varying whitespace, decimal precision) to ensure parser robustness.

4.  **Implementation**:
    *   Implement the concrete parser using robust text processing (e.g., `re` module).
    *   Include defensive programming (e.g., `try-except` blocks) to handle type conversion and unexpected characters safely.

5.  **Validation**:
    *   Write a unit test that utilizes the dummy data.
    *   Verify that the extracted dictionary contains the correct values, types, and handles edge cases.

## Pitfalls

*   **Oversimplified Mocks**: Creating dummy data that is *too* clean. Real-world logs often contain subtle variations that a "perfect" mock won't catch.
*   **Lack of Interface Consistency**: Skipping the `BaseParser` layer makes it difficult to scale the number of supported benchmarks without modifying the core orchestration logic.
*   **Weak Type Handling**: Returning everything as strings instead of casting to appropriate types (`float`, `int`) in the parser implementation.
