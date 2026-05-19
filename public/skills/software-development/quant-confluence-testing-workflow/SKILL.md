---
name: quant-confluence-testing-workflow
description: A specialized workflow for developing, implementing, and validating multi-factor quantitative scoring engines using component-based confluence scoring and synthetic data verification.
category: software-development
---

# quant-confluence-testing-workflow

A specialized workflow for developing, implementing, and validating multi-factor quantitative scoring engines using component-based confluence scoring and synthetic data verification.

## Goal
To build a robust "Confluence Engine" that aggregates multiple independent alpha factors (Trend, Momentum, Volume, Institutional Flow) into a single, high-precision composite score, and to verify this logic using controlled mock environments.

## Workflow Steps

### 1. Modular Factor Design
Instead of a single monolithic score, design individual "Factors" that are independent and return normalized values (typically 0-100):
- **Trend Factor**: e.g., Price vs. Moving Average alignment.
- **Momentum Factor**: e.g., RSI or MACD levels.
- **Volume Factor**: e.g., Relative Volume (RVOL) vs. historical averages.
- **Flow Factor**: e.g., Net institutional/smart money movement.

### 2. Confluence Aggregation
Implement a weighted aggregator to combine these factors. A common pattern is:
$$\text{Confluence Score} = \sum (\text{Factor}_i \times \text{Weight}_i)$$
Where $\sum \text{Weight}_i = 1.0$.

### 3. Strategy-Confluence Integration
Combine the "Confluence Score" with a "Pattern/Strategy Score" (e.g., a Breakout detection score) using a master weight to produce the final ranking score:
$$\text{Final Score} = (\text{Strategy Score} \times W_{strat}) + (\text{Confluence Score} \times W_{conf})$$

### 4. Mock-Driven Verification (The "Demo Scan" Pattern)
Before connecting to live APIs (which can be unstable or expensive), create a `demo_scan.py` script:
1.  **Generate Synthetic Data**: Create `pandas` DataFrames that simulate specific scenarios:
    *   **The Breakout**: High RVOL + Price > MA.
    *   **The Healthy Trend**: Mid-range RSI + Price > MA.
    *   **The Overheated Trend**: High RSI (>70) + High Price.
    *   **The Dead Cat Bounce**: Low Volume + Price jump.
2.  **Execute & Compare**: Run the scanner against these scenarios and assert that the `final_score` rankings match the expected qualitative outcomes.

## Pitfalls & Best Practices

- **Normalization Robustness**: Ensure that factors handle `NaN`, `0`, or missing columns (e.g., when institutional data is unavailable) without crashing or returning `inf`.
- **Weight Sensitivity**: Always make weights configurable (via `__init__` or config files) so the engine can be tuned without code changes.
- **Complexity Management**: Do not allow the "Strategy Score" and "Confluence Score" to double-count the same factor (e.g., using both RSI and Momentum if they are highly correlated) to avoid biased weighting.
- **Environment Awareness**: When testing, always ensure the testing script uses the project's dedicated virtual environment to avoid `ModuleNotFoundError`.
