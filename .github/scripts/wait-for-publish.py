"""Keep a prepared Pages artifact staged until the requested publication time."""
import datetime
import os
import sys
import time

raw = os.environ.get("PUBLISH_AT", "").strip()
if not raw:
    print("No delayed publication requested.")
    raise SystemExit(0)
target = datetime.datetime.fromisoformat(raw.replace("Z", "+00:00"))
if target.tzinfo is None:
    raise SystemExit("PUBLISH_AT must include a timezone.")
target = target.astimezone(datetime.timezone.utc)
remaining = (target - datetime.datetime.now(datetime.timezone.utc)).total_seconds()
if remaining > 4 * 3600:
    raise SystemExit("Publication must be within four hours of this job.")
print(f"Prepared artifact publication target: {target.isoformat()}", flush=True)
if "--check" in sys.argv:
    print(f"Validated; approximately {max(0, round(remaining))} seconds until target.")
    raise SystemExit(0)
while remaining > 0:
    print(f"Awaiting scheduled publication: {round(remaining)} seconds remaining.", flush=True)
    time.sleep(min(60, remaining))
    remaining = (target - datetime.datetime.now(datetime.timezone.utc)).total_seconds()
print("Publication gate open. Starting GitHub Pages deployment.", flush=True)
