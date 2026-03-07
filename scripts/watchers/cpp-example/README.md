# C++ Watcher Example

This example is a standalone C++ watcher for Sellfile Creator integration:

- hosts a WebSocket endpoint (`ws://127.0.0.1:<port>/`)
- uses JSON-RPC 2.0 for all messages
- accepts `uploadSellfile` requests and writes `.hsf` payloads to disk
- watches the RSL Helper `.db` file, reads SQL tables, and emits `artifactLogSnapshot`
- replays the latest converted snapshot to newly connected clients
- prints and opens the app launch URL with `?endpoint=...` by default

## Console shortcuts

- `R` queues a sample `selectRule` event (rotates through fixed row numbers).
- `F` forces the next DB poll to rebroadcast `artifactLogSnapshot`, even if the DB file signature is unchanged.

## Dependencies

Use a package manager that provides:

- `websocketpp`
- `nlohmann-json`
- `sqlite3`

Example with `vcpkg` (Windows):

```bash
vcpkg install websocketpp nlohmann-json sqlite3
```

## Build

```bash
cd scripts/watchers/cpp-example
cmake -S . -B build -DCMAKE_TOOLCHAIN_FILE=<path-to-vcpkg>/scripts/buildsystems/vcpkg.cmake
cmake --build build --config Release
```

## Run

```bash
./build/cpp_watcher_example \
  --app-entry-path ../../dist/index.html \
  --port 8765 \
  --watch-gear-db 1
```

On Windows:

```powershell
.\build\Release\cpp_watcher_example.exe `
  --app-entry-path ..\..\dist\index.html `
  --port 8765 `
  --watch-gear-db 1
```

Optional flags:

- `--output-path <path>` (default `exported-sellfile.hsf`)
- `--gear-db-path <path>` (default `%APPDATA%\RslHelper\Config`)
- `--watch-gear-db 0|1` (default `1`)
- `--open-browser 0|1` (default `1`)

## Endpoint payload behavior

For DB updates this watcher emits a JSON-RPC 2.0 notification:

```json
{"jsonrpc":"2.0","method":"artifactLogSnapshot","params":{...}}
```

The payload is built from SQLite tables and shaped as:

- `snapshotId` (derived from db filename + mtime signature)
- `payloadVersion` (`1`)
- `artifactLog` (from `Artifacts`)
- `artifactByHeroIDLog` (derived from equipped rows: `cID` + `type`)
- `inboxArtifactLog` (from `InboxArtifacts`, if present)
- `champions` (from `Champs`, if present)
- `lastUsed` (from `LastUsedArtifacts`, if present)

This is the endpoint shape consumed by Sellfile Creator’s artifact-log pipeline.
