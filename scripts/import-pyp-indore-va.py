"""
import-pyp-indore-va.py
──────────────────────
Imports questions from files/PYP Indore VA.json into the MongoDB pyqexamples collection for RAG/fine-tuning.

Usage:
  python scripts/import-pyp-indore-va.py [--overwrite]

If --overwrite is given, clears the collection before inserting.
"""

import json, os, sys
from pathlib import Path
from pymongo import MongoClient
from datetime import datetime

# Config
MONGODB_URI = os.environ.get(
    "MONGODB_URI",
    "mongodb+srv://shinjan:verbit@verbit.pbccyt3.mongodb.net/?appName=Verbit",
)
COLLECTION = "pyqexamples"
INPUT_PATH = Path("files/PYP Indore VA.json")

# Helper: map difficulty string to score/percentile

# Only topics recognized by the RAG/fine-tune pipeline
RAG_TOPICS = [
    "Reading Comprehension Sets",
    "Conversation Sets",
    "Parajumbles",
    "Vocabulary Usage",
    "Paracompletions",
    "Sentence Completions",
    "Sentence Correction",
    "Idioms & Phrases",
]

DIFFICULTY_MAP = {
    "Easy": 55,
    "Medium": 70,
    "Hard": 85,
}

def main():
    overwrite = "--overwrite" in sys.argv
    if not INPUT_PATH.exists():
        print(f"ERROR: {INPUT_PATH} not found")
        sys.exit(1)
    data = json.loads(INPUT_PATH.read_text(encoding="utf-8"))
    print(f"Loaded {len(data)} questions from {INPUT_PATH}")

    mongo = MongoClient(MONGODB_URI)
    db = mongo["verbit"]
    col = db[COLLECTION]

    if overwrite:
        print(f"Clearing collection '{COLLECTION}'...")
        col.delete_many({})

    docs = []
    for idx, q in enumerate(data):
        # Map subTopic to RAG topic if possible
        subtopic = (q.get("subTopic", "") or "").strip()
        topic_map = {
            "Reading Comprehension": "Reading Comprehension Sets",
            "Conversation": "Conversation Sets",
            "Parajumbles": "Parajumbles",
            "Vocabulary": "Vocabulary Usage",
            "Paracompletion": "Paracompletions",
            "Sentence Completion": "Sentence Completions",
            "Sentence Correction": "Sentence Correction",
            "Idioms & Phrases": "Idioms & Phrases",
            "Incorrect Word": "Sentence Correction",
            "Fill in the Blanks": "Sentence Completions",
        }
        topic = topic_map.get(subtopic, None)
        if not topic or topic not in RAG_TOPICS:
            continue
        difficulty_str = q.get("difficulty", "Medium")
        difficulty = DIFFICULTY_MAP.get(difficulty_str, 70)
        percentile = 50 + (difficulty - 50) * 0.7  # crude mapping
        content_obj = {
            "question": q.get("question", ""),
            "options": [q.get(f"option{i}", "") for i in range(1, 5)],
            "correctIndex": int(q.get("correctAnswer", "1")) - 1,
            "explanation": q.get("solution", ""),
            "subTopic": subtopic,
        }
        summary = q.get("question", "")[:80]
        source = q.get("exam", "PYQ")
        created_at = q.get("createdAt") or datetime.utcnow()
        docs.append({
            "topic": topic,
            "difficulty": difficulty,
            "percentile": percentile,
            "content": json.dumps(content_obj, ensure_ascii=False),
            "summary": summary,
            "source": source,
            "createdAt": created_at,
        })
    if docs:
        col.insert_many(docs)
        print(f"Inserted {len(docs)} documents into '{COLLECTION}'")
    else:
        print("No documents to insert.")
    mongo.close()
    print("Done.")

if __name__ == "__main__":
    main()
