# macOS Sidebar Dogfood Setup

Use this workflow to clone `issuectl` on another Mac, build the native macOS sidebar app, connect it to a local `issuectl web` server, and run the manual dogfood checklist.

This is a developer dogfood build path. It is not a signed, notarized, or stapled distribution build. Developer ID signing, export, notarization, stapling, app updates, and installer packaging are still release backlog; see [IssueCTLMac release notes](../../apple/IssueCTLMac/RELEASE.md).

## Prerequisites

- macOS with Xcode installed.
- Homebrew, `pnpm`, and `xcodegen`.
- `ttyd` and `tmux` if you want launch/session actions to open terminals.
- A configured `issuectl` database with at least one tracked repo.

Install the native build prerequisites:

```sh
brew install pnpm xcodegen ttyd tmux
```

## Fresh Clone Setup

From the new Mac:

```sh
git clone https://github.com/mean-weasel/issuectl.git
cd issuectl
pnpm install
pnpm turbo build
issuectl init
```

If the `issuectl` binary is not on your `PATH`, use the workspace CLI after building it:

```sh
pnpm --filter @issuectl/cli build
node packages/cli/dist/index.js init
```

## Build And Launch The Sidebar

Generate the Xcode project:

```sh
xcodegen generate --spec apple/project.yml
```

Build the native Mac app:

```sh
xcodebuild -project apple/IssueCTL.xcodeproj -scheme IssueCTLMac -configuration Debug -destination 'platform=macOS,arch=arm64' CODE_SIGNING_ALLOWED=NO build
```

The Debug app is usually written under:

```text
~/Library/Developer/Xcode/DerivedData/IssueCTL-*/Build/Products/Debug/IssueCTLMac.app
```

You can build and launch the newest Debug app with the helper script:

```sh
pnpm mac:sidebar:dev
```

To build without launching:

```sh
pnpm mac:sidebar:dev --no-open
```

To launch a previously built app without rebuilding:

```sh
pnpm mac:sidebar:dev --no-build
```

You can also open the project in Xcode, select the `IssueCTLMac` scheme, and run it from Xcode.

## Start The Local Server

Start `issuectl web` on the same Mac that will own repos, worktrees, and terminal sessions:

```sh
issuectl web
```

Keep this process running while dogfooding. The macOS sidebar sends launch/session actions to this server. Any terminal windows, worktrees, agent sessions, and local filesystem effects happen on the machine running `issuectl web`, not on a different client device.

If the `issuectl` binary is not on your `PATH`, run:

```sh
node packages/cli/dist/index.js web
```

## Connect IssueCTLMac

Launch `IssueCTLMac.app`. When `issuectl web` is running on the same Mac, the sidebar automatically reads the saved local API token from `~/.issuectl/issuectl.db`, verifies `http://localhost:3847`, and opens the dashboard.

If automatic connection fails, use the connection form manually:

- Server URL: `http://localhost:3847`
- API token: copy the token printed by `issuectl web`

Use `localhost` for this native macOS dogfood flow because the app and server are running on the same Mac. If you intentionally run `issuectl web` on another machine, use that machine's reachable URL instead and remember that launch/session actions will execute there.

## Dogfood Checklist

Run the manual checklist in [apple/IssueCTLMac/QA.md](../../apple/IssueCTLMac/QA.md). At minimum, cover:

- Build and launch.
- Automatic connection using `http://localhost:3847`, plus manual fallback with the printed API token.
- Issues, drafts, and active sessions.
- Launch/session behavior with `ttyd` and `tmux` installed.
- Disconnect and server restart recovery.

Record pass/fail notes against the checklist before treating a second-machine setup as ready.
