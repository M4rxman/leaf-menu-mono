---
name: spec-check
description: Check a feature or screen against the project's functional spec and Casa Strega wireframes in pdfs/. Use when implementing or reviewing UI/features, or when the user asks "does this match the spec/wireframe".
---

1. Identify the feature/screen in question (from args or the current diff).
2. Read the relevant pages of:
   - `pdfs/FUNCTIONAL SPEC — CHOICEQR-LIKE.pdf` for behavior
   - `pdfs/CASA STREGA — WEBSITE WIREFRAME MOBILE.pdf` and `... DESKTOP.pdf` for layout
3. Report gaps as a short list: `spec says X — code does Y (file:line)`. Missing items first, then mismatches. Don't fix unless asked.
