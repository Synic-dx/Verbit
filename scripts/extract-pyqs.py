"""
extract-pyqs.py
───────────────
Extracts verbal-ability PYQs from a scanned/image-based PDF using GPT-4o
vision, labels each with a logarithmic-percentile difficulty, generates an
OpenAI embedding, and upserts into the MongoDB `pyqexamples` collection
for RAG retrieval.

Usage:
  python scripts/extract-pyqs.py [path/to/pdf]

Defaults to  files/Verbal-Ability-PYQ.pdf  when no argument is given.
"""

import base64, json, math, os, sys, time
from pathlib import Path

import fitz  # PyMuPDF
from openai import OpenAI
from pymongo import MongoClient

# ── config ──────────────────────────────────────────────────────────────────
MONGODB_URI = os.environ.get(
    "MONGODB_URI",
    "mongodb+srv://shinjan:verbit@verbit.pbccyt3.mongodb.net/?appName=Verbit",
)
OPENAI_API_KEY = os.environ.get("OPENAI_API_KEY", "")

VISION_MODEL = "gpt-4o-mini"      # vision-capable, works on free/limited tiers
COLLECTION = "pyqexamples"
BATCH_PAGES = 2                   # pages per vision call (images are large)

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

# ── logarithmic percentile helpers (mirrors lib/scoring.ts) ─────────────────
CURVE = 0.255


def ver_score_to_percentile(ver_score: float) -> float:
    bounded = max(0, min(100, ver_score))
    scaled = math.log10(1 + CURVE * bounded) / math.log10(1 + CURVE * 100)
    return round(50 + 50 * scaled, 1)


def percentile_to_ver_score(percentile: float) -> float:
    bounded = max(50.0, min(100.0, percentile))
    ratio = (bounded - 50) / 50
    max_base = 1 + CURVE * 100
    base = max_base ** ratio
    return round(max(0, min(100, (base - 1) / CURVE)), 1)


# ── GPT extraction prompt ──────────────────────────────────────────────────
EXTRACTION_SYSTEM = (
    "You are an expert at parsing competitive-exam question papers from images.\n"
    "Given page images from a Verbal Ability PYQ PDF, do the following:\n\n"
    "1. Read all text from the images carefully.\n"
    "2. Identify every distinct question (MCQ, RC set, parajumble, etc.).\n"
    "3. For each question output a JSON object with these keys:\n"
    '   - "topic": one of ' + json.dumps(TOPICS) + "\n"
    '   - "percentile": estimated IPMAT/CAT percentile difficulty (50-100) on a '
    "logarithmic scale where 50 = easiest, 100 = hardest. Use these guidelines:\n"
    "     - 50-60: straightforward vocabulary / simple inference\n"
    "     - 60-70: moderate RC / sentence completion requiring some reasoning\n"
    "     - 70-80: tricky parajumbles / nuanced RC / subtle idiom usage\n"
    "     - 80-90: complex multi-step inference / advanced vocabulary in context\n"
    "     - 90-100: the hardest CAT-level questions requiring deep analysis\n"
    '   - "content": the full question as a JSON object with appropriate keys:\n'
    "       For MCQs: {question, options (array of 4), correctIndex (0-3), explanation}\n"
    "       For RC sets: {passageTitle, passage, questions: [{text, options, correctIndex, explanation}]}\n"
    "       For Parajumbles: {pjSentences (array, scrambled), pjCorrectOrder (string like BDAC)}\n"
    "       If the answer/correct option is provided in the PDF, use it. "
    "       If not, determine the correct answer yourself.\n"
    '   - "summary": a one-line description of the question (30 words max)\n'
    '   - "source": the exam name and year if visible (e.g. "CAT 2023"), else "PYQ"\n\n'
    "Return a JSON object with a single key \"questions\" containing an array of these objects.\n"
    "If a page has no identifiable questions (e.g. blank, title page), return {\"questions\": []}.\n"
    "Return ONLY valid JSON. No markdown, no commentary."
)


# ── helpers ─────────────────────────────────────────────────────────────────
def pages_to_base64_images(pdf_path: str) -> list[str]:
    """Render each PDF page to a PNG and return base64-encoded strings."""
    doc = fitz.open(pdf_path)
    images = []
    for page in doc:
        # Render at 2x resolution for better OCR
        pix = page.get_pixmap(dpi=200)
        img_bytes = pix.tobytes("png")
        b64 = base64.b64encode(img_bytes).decode("utf-8")
        images.append(b64)
    doc.close()
    return images


def chunk_images(images: list[str], size: int) -> list[list[str]]:
    """Group images into chunks of `size`."""
    return [images[i : i + size] for i in range(0, len(images), size)]


def extract_questions_from_images(client: OpenAI, image_b64_list: list[str]) -> list[dict]:
    """Send page images to GPT-4o vision and parse out structured questions."""
    # Build image content blocks
    image_contents = []
    for b64 in image_b64_list:
        image_contents.append({
            "type": "image_url",
            "image_url": {
                "url": f"data:image/png;base64,{b64}",
                "detail": "high",
            },
        })

    resp = client.chat.completions.create(
        model=VISION_MODEL,
        temperature=0.2,
        max_tokens=4096,
        messages=[
            {"role": "system", "content": EXTRACTION_SYSTEM},
            {
                "role": "user",
                "content": [
                    {"type": "text", "text": "Extract all questions from these exam pages:"},
                    *image_contents,
                ],
            },
        ],
        response_format={"type": "json_object"},
    )
    content = resp.choices[0].message.content or '{"questions":[]}'
    parsed = json.loads(content)
    return parsed.get("questions", [])


# ── main ────────────────────────────────────────────────────────────────────
def main():
    pdf_path = sys.argv[1] if len(sys.argv) > 1 and not sys.argv[1].startswith("--") else "files/Verbal-Ability-PYQ.pdf"
    use_cache = "--from-cache" in sys.argv
    if not OPENAI_API_KEY:
        # Try reading from .env.local
        env_path = Path(".env.local")
        if env_path.exists():
            for line in env_path.read_text().splitlines():
                if line.startswith("OPENAI_API_KEY="):
                    os.environ["OPENAI_API_KEY"] = line.split("=", 1)[1].strip()
                    break

    api_key = os.environ.get("OPENAI_API_KEY", OPENAI_API_KEY)
    if not api_key:
        print("ERROR: OPENAI_API_KEY not set")
        sys.exit(1)

    oai = OpenAI(api_key=api_key)
    mongo = MongoClient(MONGODB_URI)
    db = mongo["verbit"]
    col = db[COLLECTION]

    all_questions: list[dict] = []
    cache_path = Path(__file__).parent / "extracted-pyqs.json"

    if use_cache and cache_path.exists():
        print(f"📦 Loading from cache: {cache_path}")
        all_questions = json.loads(cache_path.read_text(encoding="utf-8"))
        print(f"   {len(all_questions)} questions loaded from cache (no API cost)")
    else:
        if not Path(pdf_path).exists():
            print(f"ERROR: PDF not found at {pdf_path}")
            sys.exit(1)

        print(f"📄 Rendering PDF pages to images from {pdf_path}...")
        images = pages_to_base64_images(pdf_path)
        print(f"   {len(images)} pages rendered")

        chunks = chunk_images(images, BATCH_PAGES)
        print(f"   Split into {len(chunks)} chunks of ~{BATCH_PAGES} pages each\n")

        for i, chunk in enumerate(chunks):
            print(f"🔍 Processing chunk {i + 1}/{len(chunks)} ({len(chunk)} pages)...", end=" ", flush=True)
            try:
                questions = extract_questions_from_images(oai, chunk)
                print(f"found {len(questions)} question(s)")
                all_questions.extend(questions)
            except Exception as e:
                print(f"ERROR: {e}")
            # Rate-limit between vision calls
            time.sleep(1)

    print(f"\n✅ Total questions extracted: {len(all_questions)}")

    # Cache raw extracted data so re-runs don't cost API credits
    cache_path = Path(__file__).parent / "extracted-pyqs.json"
    cache_path.write_text(json.dumps(all_questions, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"   Cached to {cache_path}")

    if not all_questions:
        print("No questions found. Exiting.")
        return

    # ── Label difficulty & save ───────────────────────────────────────────
    print("\n🏷️  Labeling difficulty...")
    docs_to_insert = []

    for idx, q in enumerate(all_questions):
        topic = q.get("topic", "Sentence Completions")
        percentile = float(q.get("percentile", 70))
        ver_score = percentile_to_ver_score(percentile)
        # Re-derive percentile from ver_score to ensure consistency
        percentile = ver_score_to_percentile(ver_score)

        content_obj = q.get("content", {})
        content_str = json.dumps(content_obj, ensure_ascii=False)
        summary = q.get("summary", f"PYQ question #{idx + 1}")
        source = q.get("source", "PYQ")

        docs_to_insert.append(
            {
                "topic": topic,
                "difficulty": ver_score,
                "percentile": percentile,
                "content": content_str,
                "summary": summary,
                "source": source,
            }
        )

        if (idx + 1) % 50 == 0:
            print(f"   Processed {idx + 1}/{len(all_questions)}")

    # ── Upsert into MongoDB ─────────────────────────────────────────────────
    if docs_to_insert:
        print(f"\n💾 Inserting {len(docs_to_insert)} documents into MongoDB '{COLLECTION}'...")
        col.delete_many({})  # Clear previous run
        col.insert_many(docs_to_insert)
        print("   Done!")
    else:
        print("No documents to insert.")

    # ── Summary ─────────────────────────────────────────────────────────────
    topic_counts: dict[str, int] = {}
    for d in docs_to_insert:
        t = d["topic"]
        topic_counts[t] = topic_counts.get(t, 0) + 1

    print("\n📊 Summary by topic:")
    for t, c in sorted(topic_counts.items()):
        print(f"   {t}: {c} questions")

    mongo.close()
    print("\n🎉 RAG seed data ready!")


if __name__ == "__main__":
    main()
