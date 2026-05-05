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
- `data` (object, required): The `.hsf` file as an inline JSON object. The server re-serialises it to disk.

**Result**
- `ok` (boolean)
- `savedAs` (string)

### selectArtifacts

Tell RSL Helper which gear items are currently selected in the Gear Inspector.
The app sends this request on every selection change (click, shift-click,
ctrl-click, or deselect) and applies the new selection immediately without
waiting for a response. The response body is not used; servers may respond
with a standard success for acknowledgement or omit a response entirely.

**Params**
- `artifactIds` (array of number): Artifact instance ids that are now selected.
  An empty array means "nothing selected".

**Request example**
```json
{"jsonrpc":"2.0","id":7,"method":"selectArtifacts","params":{"artifactIds":[235431,312005]}}
```

**Result**

Servers may respond with a standard success for acknowledgement:

**Success response example**
```json
{"jsonrpc":"2.0","id":7,"result":{"ok":true}}
```

---

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

RSL Helper sends each data type as a separate notification; they may arrive in any order and are merged as received.

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

Champion roster. Provides display names and equipped-slot context.

**Params**
- `champions` (array of champion rows) — fields consumed by the importer:
  - `id` (number) — champion instance id
  - `typeId` (number) — variant/ascension ID (e.g. `2066`); base hero ID is derived as `Math.floor(typeId / 10) * 10` (e.g. `2060`)
  - `Name` (string) — champion name; present in the first send of each sync cycle, absent in the second (see double-send behaviour below)
  - `Rarity` (number) — rarity tier 1–6; present in the first send, absent in the second
  - `grade` (number) — current star count
  - `inStorage` (boolean) — `true` if the champion is in the vault
  - `artifacts` (object) — maps slot numbers (`"1"`–`"9"`) to the equipped artifact's instance id; used to resolve which artifact belongs to which champion. Empty slots are absent from the map.
  - Additional fields (`level`, `empower`, `locked`, `skills`, `mastery`, etc.) are present in the payload but not used.

**Example**
```json
{"jsonrpc":"2.0","method":"champions","params":{"champions":[
  {
    "id":37727,"typeId":2066,"grade":6,"level":60,"Name":"Warpriest","Rarity":3,
    "inStorage":true,"artifacts":{"1":71830,"2":101913,"5":123429}
  },
  {
    "id":2742,"typeId":36,"grade":6,"level":60,"Name":"Athel","Rarity":5,
    "inStorage":false,"artifacts":{"1":235431,"3":312005}
  }
]}}
```

**Double-send behaviour**: RSL Helper emits `champions` twice per sync cycle. The first message includes `Name` and `Rarity`; the second repeats the full roster without them. Incoming rows are merged against the previously received champion list so that display metadata from the first message is not overwritten by the second.

See `docs/orig/sampleLog/helperRcvData.json` for a full captured session (all nine messages across `inboxArtifacts`, `champions`, and `artifacts`).

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
- `mValue` (number) — myth enhancement value
- `glyphValue` (number) — glyph enhancement value

## Error Codes

Use JSON-RPC standard codes where possible:
- `-32601` Method not found
- `-32602` Invalid params
- `-32603` Internal error

Application-specific errors can use `-32000` to `-32099`.
