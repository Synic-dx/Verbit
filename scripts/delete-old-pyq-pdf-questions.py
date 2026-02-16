"""
delete-old-pyq-pdf-questions.py
───────────────────────────────
Removes old RAG questions in MongoDB pyqexamples collection that were generated from the PDF/vision AI pipeline (not the new PYP Indore VA.json import).

- Keeps only questions whose 'source' field matches the new PYP Indore VA.json import (e.g., 'IPMAT Indore' or similar).
- Deletes questions with 'source' like 'PYQ' or 'Verbal-Ability-PYQ.pdf' or missing/legacy values.

Usage:
  python scripts/delete-old-pyq-pdf-questions.py
"""

import os
from pymongo import MongoClient

MONGODB_URI = os.environ.get(
    "MONGODB_URI",
    "mongodb+srv://shinjan:verbit@verbit.pbccyt3.mongodb.net/?appName=Verbit",
)
COLLECTION = "pyqexamples"

mongo = MongoClient(MONGODB_URI)
db = mongo["verbit"]
col = db[COLLECTION]

# Keep only questions with 'source' matching the new import (e.g., 'IPMAT Indore')
# Remove those with 'source' == 'PYQ', 'Verbal-Ability-PYQ.pdf', or missing/legacy
result = col.delete_many({
    "$or": [
        {"source": {"$in": ["PYQ", "Verbal-Ability-PYQ.pdf"]}},
        {"source": {"$exists": False}},
        {"source": None},
    ]
})

print(f"Deleted {result.deleted_count} old PDF/vision AI questions.")
mongo.close()
