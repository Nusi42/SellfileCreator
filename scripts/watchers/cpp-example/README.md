# C++ Watcher Example

This example is a standalone C++ watcher for Sellfile Creator integration:

- hosts a WebSocket endpoint (`ws://127.0.0.1:<port>/`)
- uses JSON-RPC 2.0 for all messages
- accepts `uploadSellfile` requests and writes `.hsf` payloads to disk
- watches the RSL Helper `.db` file, reads SQL tables, and emits per-type notifications (`artifacts`, `inboxArtifacts`, `champions`, `lastUsed`)
- replays the latest converted snapshot to newly connected clients
- prints and opens the app launch URL with `?endpoint=...` by default

## Console shortcuts

- `R` queues a sample `selectRule` event (rotates through fixed row numbers).
- `F` forces the next DB poll to rebroadcast per-type notifications, even if the DB file signature is unchanged.

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

For each DB change this watcher emits four separate JSON-RPC 2.0 notifications, one per table, matching the RSL Helper live endpoint format:

```json
{"jsonrpc":"2.0","method":"artifacts",      "params":{"artifacts":[...]}}
{"jsonrpc":"2.0","method":"inboxArtifacts", "params":{"inboxArtifacts":[...]}}
{"jsonrpc":"2.0","method":"champions",      "params":{"champions":[...]}}
{"jsonrpc":"2.0","method":"lastUsed",       "params":{"lastUsed":[...]}}
```

Each array is read from the corresponding SQLite table:

- `artifacts` — from `Artifacts`; each row carries `cID` (0 if unequipped)
- `inboxArtifacts` — from `InboxArtifacts` (empty array if table absent)
- `champions` — from `Champs` (empty array if table absent)
- `lastUsed` — from `LastUsedArtifacts` (empty array if table absent)

All four are sent even when empty so the app always receives a complete state update.
Late-joining clients receive a replay of the last cached snapshot immediately on connect.
