# WebSocket Protocol (JSON-RPC 2.0)

This protocol describes the JSON-RPC 2.0 transport used by Sellfile Creator
when communicating over WebSockets.

## Launch URL

RSL Helper opens Sellfile Creator by navigating to the distributed HTML file with query parameters:

```
file:///path/to/SellfileCreator.html?endpoint=ws://localhost:8080/&simple&playerid=um12345678&playerName=MyMainAccount
```

A different client can name itself in the URL (optional — the shape above stays valid).
Protocol features are announced over the socket instead, via the
[`capabilities`](#capabilities) notification:

```
file:///path/to/SellfileCreator.html?endpoint=ws://localhost:9099/&clientName=Gear%20Butler
```

- `endpoint` — WebSocket URL of the locally running RSL Helper server. No longer required for a
  connection: the connection is a persisted user preference (the robot toggle), so the app
  auto-connects on later loads without any param. On a launch that *does* carry `endpoint`, the
  app turns the preference on, **adopts the URL's port** as the persisted port, and then strips
  the param from the address bar so it cannot re-assert stale state on reload. Only the port is
  taken from the URL — the connection is always rebuilt as `ws://localhost:<port>/`, so a
  non-localhost host in `endpoint` is ignored. The scheme must be `ws://` or `wss://`; any other
  scheme is rejected and the param ignored. **Always spell the port out** — a URL with no
  explicit port (`ws://localhost/`) carries no port information and leaves the stored port
  untouched, rather than falling back to the scheme's implied 80/443. Users can also set the
  port from the connect button's right-click popout (a committed change re-targets a live
  connection), but an `endpoint` that names a port wins: it overwrites the stored value
  permanently, so it applies to every later start too, including ones launched with no
  `endpoint` at all.
- `&simple` — optional; activates Simple Mode (streamlined Note-dialog-only UI).
- `clientName` — optional; the display name of the connecting application. Sellfile Creator
  substitutes it wherever the UI names the client it talks to ("Connect to …", "Push …
  Sellfile", auto-push tooltips). Defaults to `RSL Helper` when omitted. Names longer than
  40 characters are truncated and internal whitespace runs collapse to single spaces, so the
  text cannot break the surrounding buttons and tooltips. The
  [`capabilities`](#capabilities) notification can carry the same name — useful when
  connecting to an already-running app, which has no launch URL to name yourself in. The
  last name received is remembered, so a later launch shows it from the first frame instead
  of briefly reading "RSL Helper"; an explicit `clientName` in the URL always wins over the
  remembered one.
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
  account is bound to one) and `playerName` (the player's name, present only when the account has
  one).
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

## Param name casing

Param names are matched **case-insensitively**, for both scalar fields (`playerId`,
`playerName`, `clientName`, `rowNumber`) and the collection keys that name a notification's
payload (`artifacts`, `champions`, `inboxArtifacts`, `lastUsed`, `ArtifactByHeroID`,
`capabilities`). `{"inboxArtifacts": …}`, `{"inboxartifacts": …}` and `{"InboxArtifacts": …}`
are all accepted, so a sender need not know or match Sellfile Creator's preferred spelling.

The examples below use the canonical casing, which is what RSL Helper sends and what new
clients should prefer — but a casing mismatch is never a silent data loss. Collection lookups
route through one case-folding helper (`resolveEventCollection` in
[`src/lib/externalCommands.ts`](../../src/lib/externalCommands.ts)); before that they compared
literal strings against a hand-maintained alias list, so an unlisted spelling degraded a
populated collection to an empty one without any error.

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

Any response carrying a `result` is treated as success; its contents are not
required (an empty `{}` is accepted). A server may return
`{"ok":true,"savedAs":"…"}` for clarity. Signal failure with an `error` object
instead — its `message` is shown to the user. The response `id` must equal the
numeric request `id`.

### uploadSfcFile

Upload the **`.sfc` recipe document** — the editable source Sellfile Creator saves and
loads — instead of the compiled `.hsf` sellfile.

Sent **only** when the client announced the `SfcFileAsSellfile` capability (see
[`capabilities`](#capabilities)), and then it
fully **replaces** `uploadSellfile`: a client receives one or the other, never both. A client
that does not name that capability never sees this method, so implementing it is optional.

**Params**
- `playerId` (string, optional): Player ID of the account the document belongs to (see Account stamping).
- `playerName` (string, optional): the player's name.
- `fileName` (string, optional): Suggested filename, ending in `.sfc`.
- `contentType` (string, optional): MIME type (`application/json`).
- `data` (object, required): The `.sfc` document as an inline JSON object — the same content
  the app's "Save .sfc" button writes, byte-for-byte equivalent apart from formatting.

**Result**

Same contract as `uploadSellfile`: any response carrying a `result` counts as success;
signal failure with an `error` object, whose `message` is shown to the user.

**Request example**
```json
{"jsonrpc":"2.0","id":3,"method":"uploadSfcFile","params":{"fileName":"SellfileCreatorRecipes_20260223_1015.sfc","contentType":"application/json","data":{"Version":"1.0.43","Metasets":[],"Recipes":[]}}}
```

Note the payloads are **not** interchangeable: `.hsf` is the generated rule list RSL Helper
consumes to sell gear, while `.sfc` is the recipe document that *produces* it. A client
asking for `.sfc` is choosing to store the source, and gets no compiled ruleset.

---

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

A client that supports the [`capabilities`](#capabilities) handshake should send that
notification **first**, ahead of the gear notifications, so its announced features apply to
everything that follows.

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

### capabilities

Announce which protocol features this client supports. **Send it as the first answer to
[`requestSfcSync`](#requestsfcsync)** — before any gear notification, so the features are in
force by the time inbound data can trigger a push.

Entirely optional. A client that never sends it — RSL Helper included — runs on the default
feature set, which is the standard `uploadSellfile` behavior described below. So this
handshake never has to be implemented just to keep working.

**Params**
- `capabilities` (array of strings): the feature tokens this client supports. Unknown tokens
  are ignored rather than rejected, so naming a feature an older Sellfile Creator does not
  know is safe. An empty array is a valid answer meaning "none of these".
- `clientName` (string, optional): display name of this client, exactly as the
  [`clientName`](#launch-url) launch param. Sending it here is the way to name yourself when
  connecting to an already-running app.

**Supported tokens**

| Token | Effect |
|---|---|
| `SfcFileAsSellfile` | Push the **`.sfc` recipe document** via [`uploadSfcFile`](#uploadsfcfile) instead of the compiled `.hsf` sellfile via `uploadSellfile`. Use it when the client wants the editable source document rather than the generated ruleset. |

**Example**
```json
{"jsonrpc":"2.0","method":"capabilities","params":{"capabilities":["SfcFileAsSellfile"],"clientName":"Gear Butler"}}
```

Two timing rules worth knowing:

- **Announce before the first push.** Anything sent before the packet arrives uses the
  default feature set. A client that announces `SfcFileAsSellfile` only after its first gear
  burst may see that first upload arrive as an `.hsf`.
- **Re-announce on every connection.** The feature set is dropped when the socket closes, so
  a reconnect starts from the default again. (The client *name* is remembered instead — it
  labels the UI even while disconnected.)

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

Each data type is sent as a separate notification; they may arrive in any order and are merged as received.

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

This notification appears in **two observed shapes**, and the importer accepts both:

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
  | `Name` | `Champs.Name` | display name (optional; a server may include it on every message) |
  | `Rarity` | `Champs.Rarity` | rarity tier 1–6 (optional; a server may include it on every message) |
  | `Affinity` | `Champs.Affinity` | affinity code, SQL encoding 1=Magic, 2=Force, 3=Spirit, 4=Void (optional; a server may include it on every message) |
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
    "Name":"Warpriest","Rarity":3,"Affinity":3,
    "inStorage":true,"artifacts":{"1":71830,"2":101913,"5":123429}
  },
  {
    "id":2742,"typeId":36,"grade":6,"level":60,"empower":2,
    "doubleAscend":{"grade":4,"blessingId":102,"freeResetUsed":false},
    "Name":"Athel","Rarity":5,"Affinity":2,
    "inStorage":false,"artifacts":{"1":235431,"3":312005}
  }
]}}
```

**Repeated champion messages merge by `id`.** When a later `champions` message
omits a field, the value from an earlier message is kept (it is not cleared).
So `Name`, `Rarity` and `Affinity` are optional per message — a server may include
them on every `champions` message, or send them once and omit them afterwards;
both work. A field introduced later is likewise adopted when it first appears and
retained thereafter.

> **`champions` alone does not track gear movement.** A server emits `champions`
> when a *champion* changes (vault move, level, ascension); moving gear between
> champions is instead announced via [`ArtifactByHeroID`](#artifactbyheroid) plus
> `artifacts`. A client that derives equips only from `champions[].artifacts`
> will therefore show gear on the champion it has already left until the next champion
> change. Consume `ArtifactByHeroID` to keep the mapping current.

### ArtifactByHeroID

The authoritative equipped-artifact mapping, and the **only** message that reflects gear moves. A server sends it (alongside an `artifacts` message) whenever gear is equipped, unequipped or swapped. It carries the same mapping as `champions[].artifacts` — the two agree exactly when both arrive — but is sent far more often, so it is the feed to rely on for equip state.

Treat each message as a **complete replacement** of the equip mapping: an artifact that has been unequipped is simply absent from the payload rather than being reported as removed.

**Params**
- `ArtifactByHeroID` (object) — keys are champion instance ids (string-encoded numbers, matching `champions[].id`); values are objects mapping slot numbers (`"1"`–`"9"`) to the equipped artifact's instance id. Empty slots are absent from the inner map.

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
| `kindId` | number | slot id (1=helmet, 2=chestplate, 3=gauntlets, 4=boots, 5=weapon, 6=shield, 7=ring, 8=amulet, 9=banner). Must be within 1–9; a row with an out-of-range slot is ignored. |
| `rankId` | number | star rank (1–6) |
| `rarityId` | number | rarity (1=common … 6=legendary) |
| `setKindId` | number | set id |
| `variantId` | number | item variant: `0` = ordinary gear, `1` = **Anomalous Accessory**. An intrinsic property of the piece — a value of `1` does not require the item to carry any mode-damage substat, and a piece carrying none can still be one. Optional: observed on `artifacts` rows and on enveloped `inboxArtifacts` rows, absent from flat-shape inbox rows. Treat a missing field — and a negative value such as `-1`, the sentinel a server may forward for an item recorded before it tracked variants — as **unknown**, not as `0`. |
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
