# WebSocket Protocol (JSON-RPC 2.0)

This protocol describes the JSON-RPC 2.0 transport used by Sellfile Creator
when communicating over WebSockets.

## Transport

- WebSocket URL: `ws://<host>:<port>/`
- Protocol: JSON-RPC 2.0 (no `Sec-WebSocket-Protocol` header is sent or required)
- Payloads: JSON text frames (binary frames for `gearDbFileBinary`, see below)

## JSON-RPC Envelope

Every message includes `"jsonrpc": "2.0"`.

### Request

```json
{"jsonrpc":"2.0","id":1,"method":"uploadSellfile","params":{"name":"Sellfile_2026-01-13.hsf","contentType":"application/json","data":{...}}}
```

### Success Response

```json
{"jsonrpc":"2.0","id":1,"result":{"ok":true,"savedAs":"Sellfile_2026-01-13.hsf"}}
```

### Error Response

```json
{"jsonrpc":"2.0","id":1,"error":{"code":-32602,"message":"Invalid params"}}
```

### Notification (server push)

```json
{"jsonrpc":"2.0","method":"selectRule","params":{"rowNumber":12}}
```

Notifications omit `id` and do not receive responses.

## Methods

### uploadSellfile

Upload a generated sellfile.

**Params**
- `name` (string, optional): Suggested filename (the server appends `.hsf` if missing).
- `contentType` (string, optional): MIME type (usually `application/json`).
- `data` (object, required): The `.hsf` file as an inline JSON object. The server re-serialises it to disk. Legacy string payloads are also accepted for backward compatibility.

**Result**
- `ok` (boolean)
- `savedAs` (string)

## Notifications

These are pushed from the server to the browser.

### selectRule

**Params**
- `rowNumber` (number, 1-based)

### gearDbFileBinary

Push the SQLite DB as a binary WebSocket frame to avoid base64 overhead.

**Step 1: metadata notification**

```json
{"jsonrpc":"2.0","method":"gearDbFileBinary","params":{"name":"RslHelper.db","byteLength":75223040,"contentType":"application/x-sqlite3"}}
```

**Params**
- `name` (string): Suggested filename for the SQLite file.
- `byteLength` (number): Expected byte length of the following binary frame.
- `contentType` (string, optional): MIME type (usually `application/x-sqlite3`).

**Step 2: binary frame**
- The next WebSocket frame must be binary and contains the raw SQLite bytes.
- The binary frame is associated with the most recent `gearDbFileBinary` notification.

RSL Helper pushes each table as a separate notification. The app merges them
as they arrive — no fixed order or combined envelope is required.

### artifacts

Equipped and stored gear from the main inventory.

**Params**
- `artifacts` (array of ArtifactLog rows, see [ArtifactLog row schema](#artifactlog-row-schema) below)

**Example**
```json
{"jsonrpc":"2.0","method":"artifacts","params":{"artifacts":[
  {
    "id":235431,"revision":486874,"sellPrice":86400,"price":1655500,
    "level":11,"upgradeTimeTicks":5250771016709014751,
    "ascendLevel":null,"rerollsCount":null,"ascendRerollsCount":null,
    "kindId":2,"rankId":6,"rarityId":5,"setKindId":59,
    "requiredFraction":0,"failedUpgrades":0,
    "isActivated":false,"isSeen":false,"readOnly":false,
    "primary":{"id":3,"level":0,"isAbsolute":1,"statValue":682899800064,"mValue":0,"glyphValue":0},
    "secondary":[
      {"id":7,"level":2,"isAbsolute":0,"statValue":944892805,"mValue":0,"glyphValue":0}
    ],
    "ascend":null
  }
]}}
```

### inboxArtifacts

Gear sitting in the inbox (not yet moved to inventory). Same row schema as `artifacts`.

**Params**
- `inboxArtifacts` (array of ArtifactLog rows)

**Example**
```json
{"jsonrpc":"2.0","method":"inboxArtifacts","params":{"inboxArtifacts":[
  {
    "id":312005,"revision":512001,"sellPrice":10800,"price":185000,
    "level":0,"upgradeTimeTicks":null,
    "ascendLevel":null,"rerollsCount":null,"ascendRerollsCount":null,
    "kindId":1,"rankId":5,"rarityId":4,"setKindId":3,
    "requiredFraction":0,"failedUpgrades":0,
    "isActivated":false,"isSeen":false,"readOnly":false,
    "primary":{"id":2,"level":0,"isAbsolute":1,"statValue":137438953472,"mValue":0,"glyphValue":0},
    "secondary":[
      {"id":9,"level":0,"isAbsolute":0,"statValue":472446401,"mValue":0,"glyphValue":0}
    ],
    "ascend":null
  }
]}}
```

### champions

Champion roster. Provides display names and equipped-slot context; the app
correlates champions to artifacts via `cID`.

**Params**
- `champions` (array of champion rows)
  - `ID` (number) — champion instance id
  - `Name` (string)
  - `Vault` (number) — `1` if in vault
  - `RVault` (number)
  - `BaseHeroID` (number)
  - `Rarity` (number)

**Example**
```json
{"jsonrpc":"2.0","method":"champions","params":{"champions":[
  {"ID":24120,"Name":"Arbiter","Vault":0,"RVault":0,"BaseHeroID":204,"Rarity":6},
  {"ID":18847,"Name":"Lyssandra","Vault":0,"RVault":0,"BaseHeroID":81,"Rarity":6}
]}}
```

### lastUsed

Tracks when each artifact was last equipped.

**Params**
- `lastUsed` (array)
  - `id` (number) — artifact id
  - `lastUse` (string `YYYY-MM-DD HH:MM:SS.sss` or Julian-day number)

**Example**
```json
{"jsonrpc":"2.0","method":"lastUsed","params":{"lastUsed":[
  {"id":235431,"lastUse":"2026-02-24 10:15:33.000"},
  {"id":312005,"lastUse":"2026-01-10 18:42:07.500"}
]}}
```

### ArtifactLog row schema

Fields present in every artifact row from RSL Helper:

| Field | Type | Notes |
|---|---|---|
| `id` | number | artifact instance id |
| `kindId` | number | slot id (1=weapon, 2=helmet, 3=shield, 4=gloves, 5=chest, 6=boots, 7=ring, 8=amulet, 9=banner) |
| `rankId` | number | star rank (1–6) |
| `rarityId` | number | rarity (1=common … 6=legendary) |
| `setKindId` | number | set id |
| `requiredFraction` | number | faction restriction (0 = none) |
| `level` | number | current upgrade level |
| `ascendLevel` | number \| null | ascension tier (null if unascended) |
| `rerollsCount` | number \| null | number of substat rerolls |
| `ascendRerollsCount` | number \| null | |
| `sellPrice` | number | |
| `price` | number | upgrade cost |
| `revision` | number | internal revision counter |
| `upgradeTimeTicks` | number \| null | .NET ticks timestamp of last upgrade |
| `failedUpgrades` | number | |
| `isActivated` | boolean | |
| `isSeen` | boolean | |
| `readOnly` | boolean | |
| `primary` | object | main stat (see stat object below) |
| `secondary` | array | substats (see stat object below) |
| `ascend` | object \| null | ascension stat (same shape as `primary`), null if not ascended |

**Stat object** (`primary`, each element of `secondary`, `ascend`)
- `id` (number) — stat type id
- `level` (number) — upgrade level of this stat
- `isAbsolute` (number) — `1` = flat value, `0` = percent
- `statValue` (number) — encoded value (integer, scale depends on stat)
- `mValue` (number)
- `glyphValue` (number)
```

## Error Codes

Use JSON-RPC standard codes where possible:
- `-32601` Method not found
- `-32602` Invalid params
- `-32603` Internal error

Application-specific errors can use `-32000` to `-32099`.
