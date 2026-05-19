---
name: spec-driven-brief
description: "Use when starting any new project, feature, or creative work with a user. Establishes a shared spec and roadmap before any execution begins. Prevents wasted effort from misaligned expectations."
version: 1.0.0
author: Hermes Agent
license: MIT
metadata:
  hermes:
    tags: [planning, spec, kickoff, collaboration, workflow]
    related_skills: [writing-plans, plan, full-cycle-software-engineering]
---

# Spec-Driven Brief

## Overview

The most expensive mistake in any project is building the wrong thing. This skill ensures that before a single line of code (or design, or content) is produced, both parties agree on **what** is being built, **why**, and **what success looks like**.

The core principle: **Align first, execute second. No spec, no work.**

## When to Use

- Starting a new project, feature, or creative work
- User gives a vague direction ("make it look better", "build me a dashboard", "I want something like X")
- You're about to make significant design/architecture decisions on behalf of the user
- Previous attempts produced something the user didn't want

**Don't use for:** Trivial one-off tasks (fix a typo, run a command), or when the user explicitly says "just do it, I trust your judgment."

## The Process

### Phase 1: Understand the Feeling (not the solution)

Don't ask "what do you want to build?" — ask about the **experience** and **context**:

1. **"What's the feeling you're going for?"** — Minimal? Bold? Clean? Playful? Dark? Professional?
2. **"Is there a reference you like?"** — A website, app, or product that has the vibe you want. Even "I can't describe it but I'll know it when I see it" is useful.
3. **"Who's the audience?"** — Yourself? Your team? Clients? General public?
4. **"What's the one thing it MUST do?"** — The single non-negotiable requirement.
5. **"What are you explicitly NOT looking for?"** — What to avoid is as important as what to include.

### Phase 2: Propose Directions (don't decide alone)

Based on their answers, present **2-3 concrete directions** as options:

```
Option A: [Name] — [One sentence description of the vibe]
  Pros: [what it does well]
  Cons: [what it sacrifices]

Option B: [Name] — [One sentence description]
  Pros: ...
  Cons: ...

Option C: [Name] — [One sentence description]
  Pros: ...
  Cons: ...
```

Let the user pick or mix. **Never decide the direction unilaterally.**

### Phase 3: Write the Spec

Once direction is agreed, write a brief spec (even just 5-7 bullet points):

```markdown
## Spec: [Project Name]

**Goal:** [One sentence]
**Style/Direction:** [What was agreed in Phase 2]
**Must Have:**
- [ ] Feature/requirement 1
- [ ] Feature/requirement 2
- [ ] Feature/requirement 3

**Nice to Have:**
- [ ] Feature 4
- [ ] Feature 5

**Out of Scope (explicitly NOT doing):**
- [ ] Thing 1
- [ ] Thing 2

**Success Criteria:** [How we know it's done and good]
```

Save this as a file (e.g., `.hermes/specs/<project-name>.md`) so both parties can reference it.

### Phase 4: Roadmap

Break the spec into phases/steps:

```
Phase 1: [Core/MVP] — [what this delivers]
Phase 2: [Enhancement] — [what this adds]
Phase 3: [Polish] — [what this refines]
```

Get agreement on the roadmap before starting Phase 1.

### Phase 5: Build (with checkpoints)

- At the end of each phase, **show the user what was built** before moving to the next
- If something doesn't match the spec, **stop and realign** — don't keep building on a wrong foundation
- If the spec needs to change, **update the spec file first**, then continue

## Common Pitfalls

1. **Skipping to execution.** The urge to "just start building" is strong. Resist it. A 10-minute alignment saves hours of rework.

2. **Deciding the direction alone.** Even if you think you know what they want, present options. Your interpretation might be wrong.

3. **Writing the spec in isolation.** The spec is a collaboration document. Write it together, or at minimum present it for approval before building.

4. **No "out of scope" section.** Without explicit boundaries, scope creeps and the project becomes everything-and-nothing.

5. **Treating the spec as immutable.** Specs evolve. When they do, update the file and re-align. Don't silently drift.

6. **Over-specifying.** The spec is a compass, not a blueprint. 5-7 bullet points is enough. Don't write a 10-page requirements document for a small project.

## Verification Checklist

- [ ] User described the desired feeling/vibe (not just features)
- [ ] At least 2 reference points or directions were presented
- [ ] User explicitly chose or approved a direction
- [ ] Spec file written and saved
- [ ] "Out of scope" section is populated
- [ ] Roadmap broken into phases
- [ ] User approved the spec before any building began

## One-Shot Recipe: Quick Kickoff

For small projects where a full spec feels like overkill:

1. Ask: "What's the one sentence description of what this should feel like?"
2. Ask: "Is there a reference you like?"
3. Propose: "Based on that, I'm thinking [direction]. Sound right?"
4. Confirm: "Anything you definitely don't want?"
5. Build a small prototype or first section
6. Show and confirm before continuing
