"""
launch-finetune.py
──────────────────
Uploads the JSONL training file to OpenAI and starts a fine-tuning job
on gpt-4o-mini-2024-07-18.

Usage:
  python scripts/launch-finetune.py [--suffix verbit-verbal]

Prerequisites:
  1. Run extract-pyqs.py    → seeds MongoDB
  2. Run generate-finetune-data.py → creates finetune-data.jsonl
"""

import argparse, os, sys, time
from pathlib import Path

from openai import OpenAI


def load_api_key() -> str:
    key = os.environ.get("OPENAI_API_KEY", "")
    if not key:
        env = Path(".env.local")
        if env.exists():
            for line in env.read_text().splitlines():
                if line.startswith("OPENAI_API_KEY="):
                    key = line.split("=", 1)[1].strip()
    return key


def main():
    parser = argparse.ArgumentParser(description="Launch OpenAI fine-tuning job")
    parser.add_argument(
        "--file",
        default=str(Path(__file__).parent / "finetune-data.jsonl"),
        help="Path to JSONL training file",
    )
    parser.add_argument(
        "--model",
        default="gpt-4o-mini-2024-07-18",
        help="Base model to fine-tune",
    )
    parser.add_argument(
        "--suffix",
        default="verbit-verbal",
        help="Model suffix for identification",
    )
    parser.add_argument(
        "--epochs",
        type=int,
        default=3,
        help="Number of training epochs (default: 3)",
    )
    args = parser.parse_args()

    jsonl_path = Path(args.file)
    if not jsonl_path.exists():
        print(f"ERROR: {jsonl_path} not found. Run generate-finetune-data.py first.")
        sys.exit(1)

    # Count lines
    line_count = sum(1 for _ in jsonl_path.open(encoding="utf-8"))
    print(f"📄 Training file: {jsonl_path} ({line_count} examples)")

    if line_count < 10:
        print("⚠️  OpenAI requires at least 10 examples. Add more data.")
        sys.exit(1)

    api_key = load_api_key()
    if not api_key:
        print("ERROR: OPENAI_API_KEY not set")
        sys.exit(1)

    client = OpenAI(api_key=api_key)

    # ── Step 1: Upload training file ────────────────────────────────────────
    print("\n📤 Uploading training file...")
    with open(jsonl_path, "rb") as f:
        upload = client.files.create(file=f, purpose="fine-tune")
    print(f"   File ID: {upload.id}")

    # Wait for processing
    print("   Waiting for file processing...", end="", flush=True)
    for _ in range(60):
        status = client.files.retrieve(upload.id)
        if status.status == "processed":
            print(" done!")
            break
        print(".", end="", flush=True)
        time.sleep(2)
    else:
        print("\n⚠️  File still processing. The job will start once it's ready.")

    # ── Step 2: Create fine-tuning job ──────────────────────────────────────
    print(f"\n🚀 Creating fine-tuning job on {args.model}...")
    job = client.fine_tuning.jobs.create(
        training_file=upload.id,
        model=args.model,
        suffix=args.suffix,
        hyperparameters={"n_epochs": args.epochs},
    )
    print(f"   Job ID: {job.id}")
    print(f"   Status: {job.status}")

    # ── Save job info ───────────────────────────────────────────────────────
    info_path = Path(__file__).parent / "finetune-job.txt"
    info_path.write_text(
        f"JOB_ID={job.id}\n"
        f"FILE_ID={upload.id}\n"
        f"BASE_MODEL={args.model}\n"
        f"SUFFIX={args.suffix}\n"
        f"EXAMPLES={line_count}\n"
        f"EPOCHS={args.epochs}\n"
    )
    print(f"\n💾 Job info saved to {info_path}")

    print(
        "\n📋 Next steps:\n"
        "   1. Run: python scripts/check-finetune.py\n"
        "      to monitor progress (takes ~10-30 min for small datasets)\n"
        "   2. Once complete, it will output the fine-tuned model ID\n"
        "   3. Add to .env.local: FINETUNED_MODEL=ft:gpt-4o-mini-...\n"
        "   4. The app will automatically use it for question generation\n"
    )


if __name__ == "__main__":
    main()
