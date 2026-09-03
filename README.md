# SJSU RateMyProfessors

A Chrome extension that shows each professor's [RateMyProfessors](https://www.ratemyprofessors.com/)
rating directly in the MySJSU class search page, so you don't have to look them
up one by one in another tab.

It adds two columns to the class search results — the RMP rating (linked to the
professor's profile) and the matched RMP name, so you can tell when the name
match is uncertain.

---

## Install the extension

The extension is not loaded from a package; you run it unpacked from this repo.

1. Clone this repo:
   ```bash
   git clone git@github.com:duc-ph/SJSU_RMP.git
   ```
2. Open `chrome://extensions` in Chrome.
3. Turn on **Developer mode** (toggle, top right).
4. Click **Load unpacked** and select the cloned `SJSU_RMP` folder.
5. Go to the MySJSU class search page (`https://cmsweb.cms.sjsu.edu/...`) and
   run a search. The **RMP Rating** column appears in the results.

No configuration or API key is needed. On first use the extension downloads the
professor data from this repo and caches it in `chrome.storage.local`.

---

## How it fits together

```
scripts/update_rmp_data.py     (weekly, on a server)
        |  fetches RMP GraphQL, writes one JSON file, git push
        v
teacher_data/<YYYYMMDD>_all_teachers_current.json   (in this repo)
        |  background.js polls the GitHub API, downloads if newer
        v
chrome.storage.local           (cached in each user's browser)
        |
        v
scripts/content.js             (injects the rating column into the page)
```

| File | Role |
| --- | --- |
| `manifest.json` | Extension manifest (MV3). |
| `scripts/content.js` | Runs on the class search page: matches professor names and injects the rating columns. |
| `background.js` | Service worker: checks for a newer data file and caches it. |
| `scripts/update_rmp_data.py` | Server-side job that refreshes the data in this repo. |
| `teacher_data/` | The published data. Exactly one file — see the warning below. |
| `intro.html` | The extension's popup. |
| `*.ipynb` | Exploratory notebooks from the original build. Not used at runtime. |

### Name matching

MySJSU and RMP spell names differently, so `content.js` matches them fuzzily: it
compares character trigrams using a Tanimoto coefficient and takes the best
scoring RMP professor. Below a threshold the match is flagged in the UI as
uncertain, which is why the matched RMP name is shown as its own column.

---

## Updating the data

The data refreshes on its own — a weekly systemd timer runs
`scripts/update_rmp_data.py`, which fetches every SJSU professor from RMP and
pushes the new file to this repo. Users pick it up automatically.

To run it by hand:

```bash
python3 scripts/update_rmp_data.py
```

It fetches (~5,000 professors, a few seconds), and **only commits and pushes if
the data actually changed** — otherwise every user would re-download 1.6 MB for
nothing. It requires `requests`, and push access to this repo.

> [!IMPORTANT]
> `teacher_data/` must contain **exactly one** `*_current.json` file.
> `background.js` picks the *first* filename matching
> `^(\d{8})_.*_current\.json$`, which is the alphabetically first — so a
> leftover file with an older date would pin every user to stale data. The
> script enforces this by deleting the previous file before writing the new one.

The 8-digit date in the filename *is* the version. `background.js` compares it
as a string against the cached `data_version` and re-downloads when it's
greater.

### Setting up the automatic updates on a server

```bash
sudo cp deploy/sjsu-rmp-update.{service,timer} /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now sjsu-rmp-update.timer
```

The unit files assume the repo is at `/root/SJSU_RMP` and that the machine has
an SSH key with push access. Check on it with:

```bash
systemctl list-timers sjsu-rmp-update.timer   # when it next runs
journalctl -u sjsu-rmp-update -n 50           # what happened last time
systemctl start sjsu-rmp-update.service       # run it now, off-schedule
```

---

## Debugging

Open `chrome://extensions`, find **SJSU RateMyProfessors**, and click the
**service worker** link to get a console for `background.js` (it may say
"inactive" — clicking wakes it). There:

```js
// which data version is cached, and how many professors
chrome.storage.local.get(null, r =>
  console.log(r.data_version, Object.keys(r.teacher_data || {}).length))

// force a re-download
chrome.storage.local.remove('data_version', () =>
  chrome.runtime.sendMessage({action: 'checkForUpdates'}, console.log))
```

`chrome.storage` is not reachable from the class search page's own console — use
the service worker console instead.

The update check is triggered by `content.js` each time you *enter* a class
search results page (including a refresh), not on every DOM change. If the
GitHub request fails, ratings still render from the cached copy.

> [!NOTE]
> `background.js` calls the unauthenticated GitHub API, which is limited to
> **60 requests/hour per IP**. On shared campus WiFi that budget is shared
> between all users. Existing users degrade gracefully to their cached data;
> brand-new users with an empty cache will see no ratings until it resets.

---

## Notes on the RMP API

`update_rmp_data.py` talks to `https://www.ratemyprofessors.com/graphql`. It
needs no login or cookie — the `Basic dGVzdDp0ZXN0` (`test:test`) credential is
the public token the RMP web app itself ships with. A browser-like
`User-Agent` header **is** required; without one the endpoint returns `403`.

SJSU is school ID `U2Nob29sLTg4MQ==`. When two professors share a name, the one
with more ratings wins.

---

## Feedback

Questions or bug reports: [this form](https://forms.gle/6ALE9jMdpSAySd1d6).
