#!/usr/bin/env python3
"""Fetch all SJSU professors from RateMyProfessors and publish them to GitHub.

Produces exactly one file, teacher_data/<YYYYMMDD>_all_teachers_current.json,
which is the shape the extension's background.js already looks for:
it lists teacher_data via the GitHub contents API, picks the first file
matching ^(\\d{8})_.*_current\\.json$, and treats the date as the version.

Because that match is "first alphabetically", only one *_current.json may
exist at a time, and the date only moves forward when the data really
changed -- otherwise every user re-downloads 1.4MB for nothing.
"""

import json
import os
import re
import subprocess
import sys
from datetime import datetime

import requests

REPO_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DATA_DIR = os.path.join(REPO_DIR, "teacher_data")
CURRENT_RE = re.compile(r"^\d{8}_.*_current\.json$")

SCHOOL_ID = "U2Nob29sLTg4MQ=="  # SJSU
GRAPHQL_URL = "https://www.ratemyprofessors.com/graphql"
PAGE_SIZE = 1000

# Sanity floor for the *total* across all pages (~5000 as of 2026-09), not a
# per-page check -- the final page is legitimately short.
MIN_TOTAL_TEACHERS = 2000

# The Basic credentials are the public "test:test" token the RMP web app ships
# with. A browser-like User-Agent is required as well -- without it the edge
# returns 403. No login cookie is involved.
HEADERS = {
    "Content-Type": "application/json",
    "Authorization": "Basic dGVzdDp0ZXN0",
    "User-Agent": (
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
        "(KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36"
    ),
    "Origin": "https://www.ratemyprofessors.com",
    "Referer": "https://www.ratemyprofessors.com/search/professors/881?q=*",
}

QUERY = """query TeacherSearchPaginationQuery(
  $count: Int!
  $cursor: String
  $query: TeacherSearchQuery!
) {
  search: newSearch {
    teachers(query: $query, first: $count, after: $cursor) {
      edges {
        node {
          id
          legacyId
          avgRating
          numRatings
          wouldTakeAgainPercent
          avgDifficulty
          department
          school { name id }
          firstName
          lastName
          isSaved
        }
      }
      pageInfo { hasNextPage endCursor }
      resultCount
    }
  }
}"""


def log(msg):
    print(f"[{datetime.now().isoformat(timespec='seconds')}] {msg}", flush=True)


def query_page(session, cursor):
    payload = {
        "query": QUERY,
        "variables": {
            "count": PAGE_SIZE,
            "cursor": cursor,
            "query": {"text": "", "schoolID": SCHOOL_ID, "fallback": True},
        },
    }
    last_error = None
    for attempt in range(5):
        try:
            resp = session.post(
                GRAPHQL_URL, headers=HEADERS, data=json.dumps(payload), timeout=30
            )
            resp.raise_for_status()
            body = resp.json()
            if body.get("errors"):
                raise RuntimeError(f"GraphQL errors: {body['errors']}")
            return body["data"]["search"]["teachers"]
        except Exception as exc:  # noqa: BLE001 - retry on anything transient
            last_error = exc
            wait = 2 ** attempt
            log(f"  request failed ({exc}); retrying in {wait}s")
            __import__("time").sleep(wait)
    raise RuntimeError(f"giving up after 5 attempts: {last_error}")


def fetch_all_teachers():
    """Walk the paginated search, keeping the entry with the most ratings
    when two professors share a name (same rule as the original notebook)."""
    session = requests.Session()
    all_teachers = {}
    cursor = ""
    has_next = True

    while has_next:
        page = query_page(session, cursor)
        edges = page["edges"]
        log(f"  fetched {len(edges)} (total {len(all_teachers)})")

        for edge in edges:
            teacher = edge["node"]
            name = f"{teacher['firstName']} {teacher['lastName']}"
            existing = all_teachers.get(name)
            if existing is None or teacher["numRatings"] > existing["numRatings"]:
                all_teachers[name] = teacher

        cursor = page["pageInfo"]["endCursor"]
        has_next = page["pageInfo"]["hasNextPage"]

    return all_teachers


def find_existing_current():
    if not os.path.isdir(DATA_DIR):
        return []
    return sorted(f for f in os.listdir(DATA_DIR) if CURRENT_RE.match(f))


def run(*args):
    return subprocess.run(
        args, cwd=REPO_DIR, check=True, capture_output=True, text=True
    ).stdout.strip()


def main():
    log("fetching SJSU professors from RateMyProfessors")
    teachers = fetch_all_teachers()

    # A partial scrape would silently publish a truncated file to every user.
    if len(teachers) < MIN_TOTAL_TEACHERS:
        log(
            f"ABORT: scrape returned {len(teachers)} professors, "
            f"below the {MIN_TOTAL_TEACHERS} floor; refusing to publish"
        )
        return 1
    log(f"fetched {len(teachers)} professors")

    payload = json.dumps(teachers, sort_keys=True)

    os.makedirs(DATA_DIR, exist_ok=True)
    existing = find_existing_current()

    if len(existing) == 1:
        with open(os.path.join(DATA_DIR, existing[0])) as fh:
            if json.dumps(json.load(fh), sort_keys=True) == payload:
                log(f"no change since {existing[0]}; nothing to publish")
                return 0

    today = datetime.now().strftime("%Y%m%d")
    new_name = f"{today}_all_teachers_current.json"

    # Exactly one *_current.json may remain, or background.js picks the
    # alphabetically-first one and users get pinned to a stale version.
    for stale in existing:
        if stale != new_name:
            os.remove(os.path.join(DATA_DIR, stale))
            log(f"removed stale {stale}")

    with open(os.path.join(DATA_DIR, new_name), "w") as fh:
        fh.write(payload)
    log(f"wrote {new_name}")

    run("git", "add", "-A", "teacher_data")
    if not subprocess.run(
        ["git", "diff", "--cached", "--quiet"], cwd=REPO_DIR
    ).returncode:
        log("no staged changes; nothing to commit")
        return 0

    run("git", "commit", "-m", f"Update teacher data {today} ({len(teachers)} professors)")
    run("git", "push", "origin", "HEAD")
    log("pushed to origin")
    return 0


if __name__ == "__main__":
    sys.exit(main())
