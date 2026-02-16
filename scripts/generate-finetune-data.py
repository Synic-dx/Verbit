"""
generate-finetune-data.py
─────────────────────────
Reads PYQ examples from MongoDB (seeded by extract-pyqs.py) and converts
them into an OpenAI fine-tuning JSONL file.

Each training example mirrors the exact system/user/assistant message
structure used by question-generator.ts so the fine-tuned model learns
the generation style at each difficulty band.

Usage:
  python scripts/generate-finetune-data.py

Outputs:
  scripts/finetune-data.jsonl
"""

import json, math, os, sys
from pathlib import Path
from pymongo import MongoClient

# ── config ──────────────────────────────────────────────────────────────────
MONGODB_URI = os.environ.get("MONGODB_URI", "")
COLLECTION = "pyqexamples"
OUTPUT = Path(__file__).parent / "finetune-data.jsonl"

TOPICS = [
    "Reading Comprehension Sets",
    "Conversation Sets",
    "Parajumbles",
    "Vocabulary Usage",
    "Paracompletions",
    "Sentence Completions",
    "Sentence Correction",
    "Idioms & Phrases",
]

CURVE = 0.255


def ver_score_to_percentile(ver_score: float) -> float:
    bounded = max(0.0, min(100.0, ver_score))
    scaled = math.log10(1 + CURVE * bounded) / math.log10(1 + CURVE * 100)
    return round(50 + 50 * scaled, 1)


# Must match BASE_SYSTEM_PROMPT in question-generator.ts
BASE_SYSTEM = (
    "You generate CAT/IPMAT verbal questions. Return only valid JSON. "
    "Follow the requested schema precisely. Avoid markdown."
)

# Schema instructions per question type (mirrors buildPrompt)
SCHEMA_INSTRUCTIONS = {
    "rc": (
        "Return JSON with keys: passageTitle, passage, questions (array of 6). "
        "Each question has text, options (4 strings), correctIndex (0-3), explanation."
    ),
    "pj": (
        "Return JSON with keys: pjSentences (array of sentences in scrambled order), "
        "pjCorrectOrder (string like BDAC using letters A-E matching sentence indices)."
    ),
    "normal": (
        "Return JSON with keys: question, options (4 strings), correctIndex (0-3), explanation."
    ),
}

TOPIC_SCHEMA_MAP = {
    "Reading Comprehension Sets": "rc",
    "Conversation Sets": "rc",
    "Parajumbles": "pj",
    "Vocabulary Usage": "normal",
    "Paracompletions": "normal",
    "Sentence Completions": "normal",
    "Sentence Correction": "normal",
    "Idioms & Phrases": "normal",
}


def build_user_prompt(topic: str, difficulty: float) -> str:
    percentile = ver_score_to_percentile(difficulty)
    level_tag = f"IPMAT/CAT Percentile {percentile} level"
    schema_name = TOPIC_SCHEMA_MAP.get(topic, "normal")
    schema_instructions = SCHEMA_INSTRUCTIONS[schema_name]
    return (
        f"Generate a {level_tag} {topic} question.\n\n"
        f"{schema_instructions}\n\n"
        f"Target difficulty: {difficulty}."
    )


def load_env():
    """Load .env.local if env vars not set."""
    global MONGODB_URI
    if not MONGODB_URI:
        env_path = Path(".env.local")
        if env_path.exists():
            for line in env_path.read_text().splitlines():
                if line.startswith("MONGODB_URI="):
                    MONGODB_URI = line.split("=", 1)[1].strip()


def main():
    load_env()
    if not MONGODB_URI:
        print("ERROR: MONGODB_URI not set")
        sys.exit(1)

    mongo = MongoClient(MONGODB_URI)
    # Always use 'verbit' database if default is not set
    try:
        db = mongo.get_default_database()
        if db is None:
            db = mongo["verbit"]
    except Exception:
        db = mongo["verbit"]
    col = db[COLLECTION]

    docs = list(col.find({}, {"embedding": 0}))
    print(f"Found {len(docs)} PYQ examples in MongoDB")

    if not docs:
        print("No data to generate. Run extract-pyqs.py first.")
        return

    lines = []
    skipped = 0

    for doc in docs:
        topic = doc.get("topic", "")
        if topic not in TOPICS:
            skipped += 1
            continue

        difficulty = doc.get("difficulty", 50)
        content_str = doc.get("content", "{}")

        # Validate content is parseable JSON
        try:
            content_obj = json.loads(content_str)
        except json.JSONDecodeError:
            skipped += 1
            continue

        # Build the fine-tuning example matching our prompt structure
        user_prompt = build_user_prompt(topic, difficulty)
        assistant_response = json.dumps(content_obj, ensure_ascii=False)

        training_example = {
            "messages": [
                {"role": "system", "content": BASE_SYSTEM},
                {"role": "user", "content": user_prompt},
                {"role": "assistant", "content": assistant_response},
            ]
        }
        lines.append(json.dumps(training_example, ensure_ascii=False))

    # Write JSONL
    OUTPUT.write_text("\n".join(lines), encoding="utf-8")
    print(f"\nWrote {len(lines)} training examples to {OUTPUT}")
    print(f"Skipped {skipped} invalid/unrecognised entries")

    # Validate minimum count
    if len(lines) < 10:
        print(
            "\n⚠️  OpenAI recommends at least 10 examples for fine-tuning. "
            "Consider adding more PYQ data."
        )
    elif len(lines) < 50:
        print(
            f"\n💡 {len(lines)} examples is workable but 50-100+ is ideal for best results."
        )
    else:
        print(f"\n✅ {len(lines)} examples — good dataset size for fine-tuning!")

    # Show topic distribution
    topic_counts: dict[str, int] = {}
    for doc in docs:
        t = doc.get("topic", "unknown")
        if t in TOPICS:
            topic_counts[t] = topic_counts.get(t, 0) + 1
    print("\n📊 Distribution:")
    for t, c in sorted(topic_counts.items()):
        print(f"   {t}: {c}")

    mongo.close()


if __name__ == "__main__":
    main()
