"""
update-difficulty-from-stats.py
───────────────────────────────
Assigns a difficulty score to each question in files/PYP Indore VA.json based on the proportion of correct/served attempts.

- If a question has no attempts, assigns a default value (e.g., 70).
- Difficulty is mapped so that more correct answers = easier (lower score), more wrong = harder (higher score).
- Updates the file in-place with a new 'difficultyScore' field (0-100 scale).

Usage:
  python scripts/update-difficulty-from-stats.py
"""

import json
from pathlib import Path

INPUT_PATH = Path("files/PYP Indore VA.json")
DEFAULT_DIFFICULTY = 70

with INPUT_PATH.open(encoding="utf-8") as f:
    data = json.load(f)

for q in data:
    correct = q.get("correctCount", 0)
    wrong = q.get("wrongCount", 0)
    unanswered = q.get("unansweredCount", 0)
    served = correct + wrong + unanswered
    if served == 0:
        score = DEFAULT_DIFFICULTY
    else:
        # Proportion correct: higher = easier
        p_correct = correct / served
        # Map: 0% correct = 100 (hardest), 100% correct = 50 (easiest), linear in between
        score = 100 - 50 * p_correct
        score = round(score, 1)
    q["difficultyScore"] = score

with INPUT_PATH.open("w", encoding="utf-8") as f:
    json.dump(data, f, ensure_ascii=False, indent=2)

print(f"Updated {len(data)} questions with difficultyScore.")
