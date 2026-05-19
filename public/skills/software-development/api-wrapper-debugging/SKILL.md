---
name: api-wrapper-debugging
description: Workflow for diagnosing and hardening third-party API wrapper integrations.
category: software-development
---

# api-wrapper-debugging

A specialized workflow for diagnosing and hardening code that interacts with third-party APIs via wrapper libraries.

## When to use
- Encountering `AttributeError` when calling library methods.
- Encountering `KeyError` inside a library's data-fetching method (often hides an underlying API error like 402 or 429).
- Implementing a new data provider or hardening an existing one.

## Workflow

### 1. Method & Attribute Discovery
If a method call fails with `AttributeError`:
- Use `dir(object)` or `help(object)` in a terminal script to list valid attributes.
- Use `type(object)` to ensure you are interacting with the expected class.

### 2. Raw Response Inspection
If a library fails with a `KeyError` (e.g., `KeyError: 'data'`) during a request:
- **The library is likely failing to handle a non-200 response.**
- Do not assume the data is missing.
- Use `curl` or a standalone `requests` script to capture the *exact* JSON response from the API endpoint.
- Check the HTTP status code:
    - `401/403`: Authentication/Authorization issues.
    - `402`: Rate limit reached (often "Payment Required" or "Limit Reached").
    - `429`: Too Many Requests.
    - `5xx`: Server-side error.

### 3. Hardening the Wrapper
Once the cause is identified, implement defensive programming in the wrapper class:
- **Graceful Failure**: Wrap individual API calls in `try-except` blocks within loops so that one failed request (e.g., due to a 402 limit) doesn't crash the entire batch.
- **Schema Resilience**: Instead of hardcoding column names (e.g., `df[['col1', 'col2']]`), use dynamic selection:
  ```python
  expected = ['A', 'B', 'C']
  available = [c for c in expected if c in df.columns]
  df = df[available]
  ```
- **Rate Limiting**: Ensure a `RateLimiter` or similar mechanism is active to prevent hitting limits in the first place.

## Pitfalls
- **Ignoring the `KeyError`**: Many libraries swallow the actual HTTP error status and just throw a `KeyError`. Always inspect the raw response.
- **Hardcoding schema**: API providers often change field names or add/remove columns without notice.
