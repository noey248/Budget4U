# budget 4U

A browser-only monthly budget ledger in Thai baht. Set income, allocate it across pools, and track expenses. A new month starts at zero and uses the pool names from the most recent earlier month.

Budgets are saved in this browser's local storage. Use **Export** to keep a JSON backup and **Restore** to replace the budgets from a backup. Clearing browser storage can erase your budgets.

## Clean-machine setup

Inspect the system with `uname -sm` and, on Linux, `cat /etc/os-release`. Use the Node.js 24 LTS archive for your OS and CPU. This example installs the current Node 24 release on Linux or macOS into a user-owned directory without administrator access. It requires Bash, curl, tar and either sha256sum or shasum.

```bash
set -euo pipefail
case "$(uname -s)" in
  Linux) node_os=linux ;;
  Darwin) node_os=darwin ;;
  *) echo 'Use the matching Node.js 24 LTS distribution for this OS.'; exit 1 ;;
esac
case "$(uname -m)" in
  x86_64|amd64) node_cpu=x64 ;;
  aarch64|arm64) node_cpu=arm64 ;;
  *) echo 'Check the Node.js release files for this architecture.'; exit 1 ;;
esac
node_dir="$HOME/.local/budget-node24"
node_tmp="$(mktemp -d)"
trap 'rm -rf "$node_tmp"' EXIT
node_url=https://nodejs.org/dist/latest-v24.x
cd "$node_tmp"
curl -fsSLO "$node_url/SHASUMS256.txt"
node_archive="$(awk -v platform="$node_os-$node_cpu" '$2 ~ ("^node-v.*-" platform "\\.tar\\.xz$") {print $2; exit}' SHASUMS256.txt)"
test -n "$node_archive"
curl -fsSLO "$node_url/$node_archive"
if command -v sha256sum >/dev/null; then
  awk -v file="$node_archive" '$2 == file' SHASUMS256.txt | sha256sum -c -
else
  awk -v file="$node_archive" '$2 == file' SHASUMS256.txt | shasum -a 256 -c -
fi
mkdir -p "$node_dir"
tar -xJf "$node_archive" --strip-components=1 -C "$node_dir"
cd - >/dev/null
export PATH="$node_dir/bin:$PATH"
node --version
npm --version
```

From the project directory:

```bash
npm ci
npm test
npm run build
npx playwright install chromium
npm run test:e2e
npm run dev
```

Open the path printed by Vite, ending in `/Budget4U/`. Playwright serves the production build, checks the asset URLs, and saves screenshots at 360, 768 and 1440 px under `test-results/`. On Linux you can use an existing Chromium with `BUDGET_CHROMIUM=/usr/bin/chromium npm run test:e2e`. If Playwright's Chromium reports missing system libraries, use a machine with the browser prerequisites or an existing compatible browser.

## Edit the app on GitHub

1. Sign in to GitHub as `noey248` and open the [Budget4U repository](https://github.com/noey248/Budget4U).
2. Open `src/main.jsx` to change dashboard text or layout, `src/style.css` to change the design, or `src/budget.js` to change the budget rules or default pool names.
3. Click the pencil icon, make your changes, and select **Commit changes**. Commit to `main`, or create a branch and open a pull request to review before merging.
4. After the commit reaches `main`, check the deploy workflow under **Actions**. Reload the [live app](https://noey248.github.io/Budget4U/) after it succeeds.

To edit a personal budget, use the live app's income and pool pencil buttons or **Add expense**. Personal changes stay in your browser.

## Publish through GitHub Actions

For the first deployment, open [Settings → Pages](https://github.com/noey248/Budget4U/settings/pages) and choose **GitHub Actions** under **Build and deployment → Source**. Then open **Actions → Deploy budget 4U to Pages** and select **Run workflow** on `main`. Subsequent pushes to `main` deploy automatically.

Run the tests and build first. With Python 3 available, provide a temporary `GH_TOKEN` process credential that authenticates as `noey248`. It needs access to create a public repository if absent, write repository contents and Actions workflows, configure Pages, and inspect or dispatch Actions runs. Use an interactive hidden prompt or the environment's secret injection.

```bash
(
  read -rs -p 'GitHub token: ' GH_TOKEN
  printf '\n'
  export GH_TOKEN
  python3 scripts/publish.py
)
```

The script checks the credential identity, looks up the repository before creating it, and inspects the tree before committing. It stops at conflicting files so they can be reconciled before a commit. Existing unrelated paths are preserved. The script switches Pages to GitHub Actions, creates and pushes the commit through REST, monitors the workflow, and verifies the public HTML and assets against the local build.

The workflow runs on pushes to `main` and manual dispatch. It installs the lockfile, runs unit tests, builds, runs Playwright against the build, uploads `dist`, and deploys with the built-in GitHub token. The build job has repository read access. The deploy job has Pages write and identity-token access.

- [GitHub repository](https://github.com/noey248/Budget4U)
- [GitHub Pages app](https://noey248.github.io/Budget4U/)
- [Vite deployment guide](https://vite.dev/guide/static-deploy)
- [Mantine Vite setup](https://mantine.dev/guides/vite/)
- [GitHub Pages publishing sources](https://docs.github.com/en/pages/getting-started-with-github-pages/configuring-a-publishing-source-for-your-github-pages-site)
