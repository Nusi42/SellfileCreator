# WebSocket Protocol (JSON-RPC 2.0)

This protocol describes the JSON-RPC 2.0 transport used by Sellfile Creator
when communicating over WebSockets.

## Launch URL

RSL Helper opens Sellfile Creator by navigating to the distributed HTML file with query parameters:

```
file:///path/to/SellfileCreator.html?endpoint=ws://localhost:8080/&simple&playerid=um12345678&playerName=MyMainAccount
```

- `endpoint` — WebSocket URL of the locally running RSL Helper server (required for any connection).
- `&simple` — optional; activates Simple Mode (streamlined Note-dialog-only UI).
- `playerid` — optional; the game's Player ID for the account (e.g. `um12345678`). Routes the
  session to the matching Sellfile Creator account, binding or creating one as needed.
  Treated as an opaque string. Carries the same value the JSON-RPC `playerId` params use
  (see Account stamping below).
- `playerName` — optional; the player's name in the game. A FULL alternative identity: when
  `playerid` is absent, `playerName` alone routes the session to the matching account (and
  names/creates one as needed). RSL Helper may consistently use `playerid`, `playerName`, or
  both. Player names MAY change in-game — when the `playerid` identifies the account, a
  changed name is adopted automatically; with name-only usage a rename cannot be recognized
  (the old name is unknown), so sending the Player ID is the recommended contract.

Param values must be **percent-encoded** (UTF-8) — then any character is safe, including `?`.
Unencoded, `&` would split the value, `#` would truncate the query, and `+` decodes as a space;
so always encode names (e.g. `My Name & Co` → `My%20Name%20%26%20Co`). Sellfile Creator decodes
with standard `URLSearchParams` semantics and clamps over-long names.

Until RSL Helper stamps its notifications (see below), the launch `playerid`/`playerName` params are
the ownership contract for inbound data: switching game accounts inside RSL Helper should
re-navigate Sellfile Creator with the new values.

## Transport

- WebSocket URL: `ws://<host>:<port>/`
- Protocol: JSON-RPC 2.0 (no `Sec-WebSocket-Protocol` header is sent or required)
- Payloads: JSON text frames (binary frames for `gearDbFileBinary`, see below)

## JSON-RPC Envelope

Every message includes `"jsonrpc": "2.0"`.

### Request

```json
{"jsonrpc":"2.0","id":1,"method":"uploadSellfile","params":{"fileName":"Sellfile_2026-01-13.hsf","contentType":"application/json","data":{...}}}
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

## Account stamping (both directions)

Sellfile Creator can manage multiple accounts. To route data per game account, the protocol
carries two optional params:

- **Outbound (SFC → RSL Helper)**: every request (`uploadSellfile`, `requestSfcSync`,
  `selectArtifacts`) includes `playerId` (the game's Player ID, present only when the active SFC
  account is bound to one) and `playerName` (the player's name). Servers that do not understand
  these params can ignore them; once consumed, RSL Helper can save sellfiles per account and
  validate sync requests.
- **Inbound (RSL Helper → SFC)**: every notification (`artifacts`, `champions`, `inboxArtifacts`,
  `lastUsed`, and the `gearDbFileBinary` metadata notification) MAY carry top-level `playerId`
  and/or `playerName` params — either alone is a full identity, mirroring the launch params.
  Sellfile Creator's handling:
  - both absent → data is attributed to the active SFC account (pre-stamping RSL Helper
    versions), or to the account flagged as the unstamped-data default;
  - identity matches the active account → applied normally;
  - active account not yet bound → the identity is adopted (first stamped packet proves
    ownership);
  - identity names a DIFFERENT known account → the data never merges into the active view;
    instead Sellfile Creator rebuilds THAT account's sellfile in the background — from its own
    saved document — and, if that account has auto-push enabled, uploads it via `uploadSellfile`
    stamped with that account's identity;
  - identity matches no known account → the packet is dropped with a user-facing toast.

## Methods

### uploadSellfile

Upload a generated sellfile.

**Params**
- `playerId` (string, optional): Player ID of the account the sellfile belongs to (see Account stamping).
- `playerName` (string, optional): the player's name.
- `fileName` (string, optional): Suggested filename (the server appends `.hsf` if missing).
- `contentType` (string, optional): MIME type (usually `application/json`).
- `data` (object, required): The `.hsf` file as an inline JSON object. The server re-serialises it to disk.

**Result**
- `ok` (boolean)
- `savedAs` (string)

### requestSfcSync

Ask RSL Helper to push all its current datasets. Sent automatically on every connection so the app receives a full snapshot without waiting for the next natural push cycle.

**Params**
- `playerId` (string, optional): Player ID of the account SFC believes it is syncing (see Account
  stamping). A server may validate this and answer with an error instead of pushing another
  account's data.
- `playerName` (string, optional): the player's name.

**Result**
- `ok` (boolean)

RSL Helper responds by emitting its standard notifications in any order
(`artifacts`, `inboxArtifacts`, `champions`, `lastUsed`, etc.).

**Request example**
```json
{"jsonrpc":"2.0","id":2,"method":"requestSfcSync","params":{}}
```

**Success response example**
```json
{"jsonrpc":"2.0","id":2,"result":{"ok":true}}
```

---

### selectArtifacts

Tell RSL Helper which gear items are currently selected in the Gear Inspector.
The app sends this request on every selection change (click, shift-click,
ctrl-click, or deselect) and applies the new selection immediately without
waiting for a response. The response body is not used; servers may respond
with a standard success for acknowledgement or omit a response entirely.

**Params**
- `playerId` (string, optional): Player ID of the account the selection belongs to (see Account stamping).
- `playerName` (string, optional): the player's name.
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

RSL Helper sends this notification in **two observed shapes**, and the importer
accepts both:

1. **Flat shape** — `inboxArtifacts` is a plain array of ArtifactLog rows (identical to
   `artifacts`).
2. **Nested inbox-item shape** — `inboxArtifacts` is an array of *inbox-item envelopes*
   (mail entries), each carrying its ArtifactLog row(s) under a nested `artifacts` array
   alongside mail metadata (`inboxItemId`, `typeId`, `isRead`, `givenTimeTicks`,
   `validTillTicks`, `parentInboxId`, `questPrototypeId`). One envelope may wrap zero,
   one, or several rows.

**Params**
- `inboxArtifacts` (array of ArtifactLog rows **or** inbox-item envelopes)

An inbox-item envelope is recognised as an object carrying an `artifacts` array and **no**
top-level `kindId`; its nested rows are the gear. The app accepts both shapes — flat rows are
used as-is, and envelopes are flattened to their nested rows.

**Example — flat shape**
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

**Example — nested inbox-item shape**
```json
{"jsonrpc":"2.0","method":"inboxArtifacts","params":{"inboxArtifacts":[
  {
    "inboxItemId":166312,"typeId":7,"isRead":true,
    "givenTimeTicks":639174939276110000,"validTillTicks":639261339276110000,
    "parentInboxId":null,"questPrototypeId":null,
    "artifacts":[
      {
        "id":255144,"revision":0,"sellPrice":79200,"price":792000,
        "level":0,"upgradeTimeTicks":null,
        "ascendLevel":null,"rerollsCount":null,"ascendRerollsCount":null,
        "kindId":7,"rankId":6,"rarityId":4,"setKindId":66,
        "requiredFraction":11,"failedUpgrades":0,
        "isActivated":false,"isSeen":false,"readOnly":false,
        "primary":{"id":2,"level":0,"isAbsolute":1,"statValue":137438953472,"mValue":0,"glyphValue":0},
        "secondary":[
          {"id":3,"level":0,"isAbsolute":1,"statValue":81604378624,"mValue":0,"glyphValue":0}
        ],
        "ascend":null
      }
    ]
  }
]}}
```

### champions

Champion roster. Provides display names and equipped-slot context.

**Params**
- `champions` (array of champion rows) — fields consumed by the importer:

  | WS field | Maps to SQL column | Used for |
  |---|---|---|
  | `id` | `Champs.ID` | champion instance id |
  | `typeId` | `Champs.HeroID` | variant/ascension ID (e.g. `2066`); base hero ID is derived as `Math.floor(typeId / 10) * 10` |
  | `Name` | `Champs.Name` | display name (present only in first send of each sync cycle) |
  | `Rarity` | `Champs.Rarity` | rarity tier 1–6 (present only in first send) |
  | `Affinity` | `Champs.Affinity` | **planned but not yet sent** — once shipped, will use the SQL encoding 1=Magic, 2=Force, 3=Spirit, 4=Void |
  | `grade` | `Champs.Rang` | current yellow-star count (1–6) — **not** the blessing grade |
  | `level` | `Champs.Lvl` | champion XP level 1–60 |
  | `empower` | `Champs.EmpLvl` | empowerment level 0–4 |
  | `doubleAscend.grade` | `Champs.BGrade` | Double-Ascension / "Awakening" grade 0–6 (nested path) |
  | `inStorage` | `Champs.Vault` | `true` when in vault |
  | `artifacts` | (not a column) | object mapping slot `"1"`–`"9"` to the equipped artifact's instance id; resolves which artifact belongs to which champion |

  Other fields in the payload (`locked`, `inBathhouse`, `marker`, `skills`, `mastery`, `exp`, `fullExp`, `recentBattleTicks`, `doubleAscend.blessingId`, etc.) are ignored.

**Example**
```json
{"jsonrpc":"2.0","method":"champions","params":{"champions":[
  {
    "id":37727,"typeId":2066,"grade":6,"level":60,"empower":0,
    "doubleAscend":{"grade":0,"blessingId":0,"freeResetUsed":false},
    "Name":"Warpriest","Rarity":3,
    "inStorage":true,"artifacts":{"1":71830,"2":101913,"5":123429}
  },
  {
    "id":2742,"typeId":36,"grade":6,"level":60,"empower":2,
    "doubleAscend":{"grade":4,"blessingId":102,"freeResetUsed":false},
    "Name":"Athel","Rarity":5,
    "inStorage":false,"artifacts":{"1":235431,"3":312005}
  }
]}}
```

**Double-send behaviour**: RSL Helper emits `champions` twice per sync cycle. The first message includes `Name` and `Rarity`; the second repeats the full roster without them. Rows are merged field-by-field — when an incoming row leaves a field absent, the previously-known value is preserved. This protects the first-send metadata (Name, Rarity) and keeps the data forward-compatible: when a field such as `Affinity` arrives it is recorded, and until then any earlier-known value is not nulled out by a follow-up packet that omits it.

See `docs/orig/sampleLog/` for a full captured session split into per-message files. Each file is one full JSON-RPC envelope, named `packet_<index>_<method>_<YYMMDD>_<HHMMSS.mmm>.json`; the zero-padded numeric `<index>` is the order in which RSL Helper emitted the packet. The current sample (captured 2026-05-10) contains 22 packets: `artifacts` ×6, `champions` ×7, `inboxArtifacts` ×6, `lastUsed` ×2, and `ArtifactByHeroID` ×1.

### ArtifactByHeroID

Inverse view of the equipped-artifact mapping already carried in `champions[].artifacts`. Observed in captures from RSL Helper but **currently ignored by the importer** — the same data is consumed via `champions` and re-deriving it from this method would duplicate logic. Documented here so future captures aren't mistaken for an unknown payload.

**Params**
- `ArtifactByHeroID` (object) — keys are champion instance ids (string-encoded numbers); values are objects mapping slot numbers (`"1"`–`"9"`) to the equipped artifact's instance id. Empty slots are absent from the inner map.

**Example**
```json
{"jsonrpc":"2.0","method":"ArtifactByHeroID","params":{"ArtifactByHeroID":{
  "37727":{"1":71830,"2":101913,"5":123429,"6":53850,"7":127397,"8":148010,"9":135665},
  "10030":{"1":63143,"5":68126,"6":76526,"7":207553,"8":77276}
}}}
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
- `mValue` (number) — myth enhancement value
- `glyphValue` (number) — glyph enhancement value

## Error Codes

Use JSON-RPC standard codes where possible:
- `-32601` Method not found
- `-32602` Invalid params
- `-32603` Internal error

Application-specific errors can use `-32000` to `-32099`.
