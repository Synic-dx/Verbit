"""
update_user_percentiles.py
─────────────────────────
Updates all user attempt records in the database to use the new anchor-based VerScore-to-percentile mapping.

- Updates the percentileAfter field in all Attempt documents for all users and topics.
- Uses the new anchor mapping: 0→50, 50→90, 65→95, 75→98, 85→99, 95→99.8, 100→100 (piecewise linear).

Usage:
  python scripts/update_user_percentiles.py
"""
import os
from pymongo import MongoClient

# Anchor points for VerScore to Percentile mapping
ANCHORS = [
    (0, 50),
    (50, 90),
    (65, 95),
    (75, 98),
    (85, 99),
    (95, 99.8),
    (100, 100),
]

def verscore_to_percentile(ver_score: float) -> float:
    v = max(0, min(100, ver_score))
    for i in range(len(ANCHORS) - 1):
        v0, p0 = ANCHORS[i]
        v1, p1 = ANCHORS[i + 1]
        if v0 <= v <= v1:
            t = (v - v0) / (v1 - v0)
            return round(p0 + t * (p1 - p0), 1)
    return 100.0

MONGODB_URI = os.environ.get("MONGODB_URI", "mongodb+srv://shinjan:verbit@verbit.pbccyt3.mongodb.net/?appName=Verbit")
DB_NAME = "verbit"
COLLECTION = "attempts"

client = MongoClient(MONGODB_URI)
db = client[DB_NAME]
coll = db[COLLECTION]

batch_size = 1000
count = 0

def update_all_percentiles():
    global count
    cursor = coll.find({}, {"_id": 1, "verScoreAfter": 1})
    updates = []
    for doc in cursor:
        ver_score = doc.get("verScoreAfter", 0)
        new_percentile = verscore_to_percentile(ver_score)
        updates.append({
            "_id": doc["_id"],
            "percentileAfter": new_percentile
        })
        if len(updates) >= batch_size:
            bulk_update(updates)
            count += len(updates)
            print(f"Updated {count} records...")
            updates = []
    if updates:
        bulk_update(updates)
        count += len(updates)
        print(f"Updated {count} records (final batch)")

def bulk_update(updates):
    if not updates:
        return
    requests = [
        {
            "updateOne": {
                "filter": {"_id": u["_id"]},
                "update": {"$set": {"percentileAfter": u["percentileAfter"]}}
            }
        }
        for u in updates
    ]
    coll.bulk_write(requests)

if __name__ == "__main__":
    update_all_percentiles()
    print("All user attempt percentiles updated to new mapping.")
