"""
check-finetune.py
─────────────────
Polls the status of the fine-tuning job and prints the final model ID
when complete.

Usage:
  python scripts/check-finetune.py [--job JOB_ID]

If --job is omitted, reads from scripts/finetune-job.txt.
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


def get_job_id(args_job: str | None) -> str:
    if args_job:
        return args_job
    info_path = Path(__file__).parent / "finetune-job.txt"
    if info_path.exists():
        for line in info_path.read_text().splitlines():
            if line.startswith("JOB_ID="):
                return line.split("=", 1)[1].strip()
    print("ERROR: No job ID. Pass --job or run launch-finetune.py first.")
    sys.exit(1)


def main():
    parser = argparse.ArgumentParser(description="Check fine-tuning job status")
    parser.add_argument("--job", default=None, help="Fine-tuning job ID")
    parser.add_argument(
        "--poll",
        action="store_true",
        help="Poll until complete (check every 30s)",
    )
    args = parser.parse_args()

    api_key = load_api_key()
    if not api_key:
        print("ERROR: OPENAI_API_KEY not set")
        sys.exit(1)

    client = OpenAI(api_key=api_key)
    job_id = get_job_id(args.job)

    print(f"🔍 Checking job: {job_id}\n")

    while True:
        job = client.fine_tuning.jobs.retrieve(job_id)

        print(f"   Status       : {job.status}")
        print(f"   Model        : {job.model}")
        if job.trained_tokens:
            print(f"   Trained tokens: {job.trained_tokens:,}")
        if job.fine_tuned_model:
            print(f"   Fine-tuned ID : {job.fine_tuned_model}")

        if job.status == "succeeded":
            model_id = job.fine_tuned_model
            print(f"\n✅ Fine-tuning complete!")
            print(f"   Model ID: {model_id}")
            print(f"\n📋 Add this to your .env.local:")
            print(f"   FINETUNED_MODEL={model_id}")

            # Also save to finetune-job.txt
            info_path = Path(__file__).parent / "finetune-job.txt"
            if info_path.exists():
                content = info_path.read_text()
                if "FINETUNED_MODEL=" not in content:
                    info_path.write_text(content + f"FINETUNED_MODEL={model_id}\n")

            print(
                f"\n   The app will automatically use this model for non-RC questions.\n"
                f"   RC/Conversation sets will still use gpt-4o (needs long context)."
            )
            break

        elif job.status == "failed":
            print(f"\n❌ Fine-tuning failed!")
            if job.error:
                print(f"   Error: {job.error}")
            break

        elif job.status == "cancelled":
            print(f"\n⚠️  Job was cancelled.")
            break

        else:
            # Still running
            if not args.poll:
                print(f"\n   Job is still {job.status}. Run with --poll to wait.")
                break
            print(f"   Waiting 30s...\n")
            time.sleep(30)

    # Show recent events
    print("\n📜 Recent events:")
    events = client.fine_tuning.jobs.list_events(fine_tuning_job_id=job_id, limit=10)
    for event in reversed(events.data):
        print(f"   [{event.created_at}] {event.message}")


if __name__ == "__main__":
    main()
