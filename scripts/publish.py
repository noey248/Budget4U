"""Publish the budget app using GitHub REST, without Git or gh."""
import base64
import hashlib
import json
import os
from pathlib import Path
import sys
import time
from urllib.error import HTTPError
from urllib.parse import quote, urljoin
from urllib.request import Request, urlopen

OWNER = "noey248"
NAME = "Budget4U"
REPO = f"/repos/{OWNER}/{NAME}"
SITE = f"https://{OWNER}.github.io/{NAME}/"
ROOT = Path(__file__).resolve().parents[1]
WORKFLOW = "pages.yml"
SECTIONS = ["src", "tests", "e2e", "scripts", ".github/workflows"]
FILES = [
    ".gitignore", "README.md", "index.html", "package.json", "package-lock.json",
    "playwright.config.js", "postcss.config.cjs", "vite.config.js",
]


def api(path, payload=None, method="GET", allowed=()):
    request = Request(
        "https://api.github.com" + path,
        data=None if payload is None else json.dumps(payload).encode(),
        headers={
            "Authorization": "Bearer " + os.environ["GH_TOKEN"],
            "Accept": "application/vnd.github+json",
            "Content-Type": "application/json",
            "X-GitHub-Api-Version": "2022-11-28",
        },
        method=method,
    )
    try:
        with urlopen(request, timeout=30) as response:
            body = response.read()
            return json.loads(body) if body else None
    except HTTPError as error:
        if error.code in allowed:
            return None
        detail = json.loads(error.read()).get("message", "")
        raise SystemExit(f"{method} {path}: HTTP {error.code}. {detail}") from None


def source_files():
    paths = [ROOT / name for name in FILES]
    for section in SECTIONS:
        paths.extend(path for path in (ROOT / section).rglob("*")
                     if path.is_file() and path.suffix in {".js", ".jsx", ".css", ".py", ".yml"})
    return {path.relative_to(ROOT).as_posix(): path.read_bytes() for path in sorted(paths)}


def blob_sha(data):
    return hashlib.sha1(f"blob {len(data)}\0".encode() + data).hexdigest()


def prepare():
    if not os.environ.get("GH_TOKEN"):
        raise SystemExit("Set GH_TOKEN as a temporary process credential.")
    user = api("/user")["login"]
    if user.casefold() != OWNER.casefold():
        raise SystemExit(f"GH_TOKEN authenticates as {user}. This repository requires {OWNER}.")
    files = source_files()
    repo = api(REPO, allowed=(404,))
    created = repo is None
    if created:
        repo = api("/user/repos", {
            "name": NAME, "private": False,
            "description": "budget 4U — a browser-only monthly budget ledger",
        }, "POST")
    if repo["private"]:
        raise SystemExit("Repository is private. Review its contents before changing visibility.")

    main = api(REPO + "/git/ref/heads/main", allowed=(404, 409))
    ref = main
    if ref is None:
        default = quote(repo["default_branch"], safe="/")
        ref = api(REPO + f"/git/ref/heads/{default}", allowed=(404, 409))
    if ref is None:
        result = api(REPO + "/contents/README.md", {
            "message": "Initialize budget 4U",
            "content": base64.b64encode(files["README.md"]).decode(),
        }, "PUT")
        head = result["commit"]["sha"]
        main = api(REPO + "/git/ref/heads/main", allowed=(404, 409))
    else:
        head = ref["object"]["sha"]
    commit = api(REPO + f"/git/commits/{head}")
    tree_sha = commit["tree"]["sha"]
    tree = api(REPO + f"/git/trees/{tree_sha}?recursive=1")
    if tree["truncated"]:
        raise SystemExit("Repository tree is truncated. Inspect it before publishing.")
    existing = {item["path"]: item for item in tree["tree"]}
    changes = []
    for name, data in files.items():
        current = existing.get(name)
        parents = [parent.as_posix() for parent in Path(name).parents if parent != Path(".")]
        if any(parent in existing and existing[parent]["type"] != "tree" for parent in parents):
            raise SystemExit(f"Existing file blocks directory for {name}. Review the repository before publishing.")
        if current:
            if current["sha"] != blob_sha(data) or current["mode"] not in {"100644", "100755"}:
                raise SystemExit(f"Existing path differs: {name}. Reconcile it before publishing.")
            continue
        changes.append({"path": name, "mode": "100644", "type": "blob", "content": data.decode()})

    if main is None:
        api(REPO + "/git/refs", {"ref": "refs/heads/main", "sha": head}, "POST")
    if created and repo["default_branch"] != "main":
        api(REPO, {"default_branch": "main"}, "PATCH")

    if changes:
        tree = api(REPO + "/git/trees", {"base_tree": tree_sha, "tree": changes}, "POST")
        commit = api(REPO + "/git/commits", {
            "message": "Build budget 4U monthly ledger", "tree": tree["sha"], "parents": [head],
        }, "POST")
        head = commit["sha"]
        api(REPO + "/git/refs/heads/main", {"sha": head, "force": False}, "PATCH")
    print(repo["html_url"], flush=True)
    pages = api(REPO + "/pages", allowed=(404,))
    if pages is None:
        api(REPO + "/pages", {"build_type": "workflow"}, "POST")
    elif pages["build_type"] != "workflow":
        api(REPO + "/pages", {"build_type": "workflow"}, "PUT")

    return head, bool(changes)


def verify(head, pushed):
    workflow = REPO + "/actions/workflows/" + WORKFLOW
    dispatched = False
    for attempt in range(90):
        results = api(workflow + f"/runs?branch=main&head_sha={head}", allowed=(404,))
        runs = results["workflow_runs"] if results else []
        if runs:
            run = runs[0]
            if run["status"] == "completed":
                print(f'{run["conclusion"]} {run["html_url"]}', flush=True)
                if run["conclusion"] != "success":
                    raise SystemExit("Check the failed jobs before rerunning.")
                break
        if not runs and not dispatched and (not pushed or attempt >= 3):
            api(workflow + "/dispatches", {"ref": "main"}, "POST")
            dispatched = True
        time.sleep(10)
    else:
        raise SystemExit("Timed out monitoring GitHub Actions.")

    expected = (ROOT / "dist" / "index.html").read_text()
    from html.parser import HTMLParser

    class Assets(HTMLParser):
        urls = []

        def handle_starttag(self, tag, attrs):
            values = dict(attrs)
            if tag == "script" and "src" in values:
                self.urls.append(values["src"])
            if tag == "link" and values.get("rel") == "stylesheet":
                self.urls.append(values["href"])

    for _ in range(12):
        try:
            with urlopen(SITE, timeout=20) as response:
                actual = response.read().decode()
            if actual != expected:
                time.sleep(5)
                continue
            assets = Assets()
            assets.feed(actual)
            if not assets.urls or any(not url.startswith(f"/{NAME}/assets/") for url in assets.urls):
                raise SystemExit("Published HTML contains unexpected asset URLs.")
            for url in assets.urls:
                with urlopen(urljoin(SITE, url), timeout=20) as response:
                    local = ROOT / "dist" / url.removeprefix(f"/{NAME}/")
                    if response.read() != local.read_bytes():
                        raise SystemExit(f"Published asset differs from the local build: {url}")
            print(f"Verified {SITE}", flush=True)
            return
        except HTTPError:
            time.sleep(5)
    raise SystemExit("Deployment reported success, but the published files could not be verified.")


if __name__ == "__main__":
    if not (ROOT / "dist" / "index.html").is_file():
        sys.exit("Run npm run build before publishing.")
    verify(*prepare())
