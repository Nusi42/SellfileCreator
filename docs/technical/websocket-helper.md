# WebSocket Protocol (Lightweight RSL Helper)

This protocol describes the lightweight WebSocket format used by Sellfile
Creator when communicating with RSL Helper integrations.

## Transport

- WebSocket URL: `ws://<host>:<port>/`
- Subprotocol: `rws`
- Payloads: JSON text frames (binary frames allowed for `gearDbFile`, see below)

### Subprotocol negotiation

- The browser offers `jsonrpc` and `rws` in the WebSocket handshake.
- Helper-mode servers must select `rws` in `Sec-WebSocket-Protocol` and then
  accept only the helper envelope.
- If the server omits subprotocol selection, Sellfile Creator infers the
  protocol from the first inbound message and otherwise defaults to JSON-RPC
  for outbound requests.

## Envelope Types

### Request (client -> server)

```json
{"id":1,"type":"req","cmd":"uploadSellfile","payload":{"name":"Sellfile_2026-01-13.hsf","contentType":"application/json","data":"{...}"}}
```

### Response (server -> client)

```json
{"id":1,"type":"res","ok":true,"payload":{"savedAs":"Sellfile_2026-01-13.hsf"}}
```

### Error Response

```json
{"id":1,"type":"res","ok":false,"error":"unknown cmd","payload":{}}
```

### Event / Push (server -> client)

```json
{"type":"evt","name":"selectRule","payload":{"rowNumber":12}}
```

## Commands

### uploadSellfile

**Payload**
- `name` (string, optional): Suggested filename (the server appends `.hsf` if missing).
- `contentType` (string, optional): MIME type (usually `application/json`).
- `data` (string, required): Raw `.hsf` JSON payload.

**Response**
- `ok` (boolean)
- `payload.savedAs` (string)

## Events

### selectRule

**Payload**
- `rowNumber` (number, 1-based)

### gearDbFile

**Payload**
- `name` (string, optional): Defaults to `RslHelper.db` if omitted.
- `base64` (string, required): SQLite file contents encoded as base64.

**Example**
```json
{"type":"evt","name":"gearDbFile","payload":{"name":"RslHelper.db","base64":"AAECAwQF..."}} 
```

#### Binary frame option (recommended for large DBs)

For large databases, servers may send the file as a WebSocket binary frame to
avoid base64 overhead.

**Step 1: metadata event**

```json
{"type":"evt","name":"gearDbFileBinary","payload":{"name":"RslHelper.db","byteLength":75223040,"contentType":"application/x-sqlite3"}}
```

**Step 2: binary frame**
- The next WebSocket frame must be binary and contains the raw SQLite bytes.
- The binary frame is associated with the most recent `gearDbFileBinary` event.
- If a client does not support binary frames, the server should fall back to
  the base64 `gearDbFile` event.

### gearDbRawSnapshot

**Payload**
- `snapshotId` (string or null, optional)
- `payloadVersion` (number, optional)
- `artifacts` (array of raw artifact rows, see below)
- `inboxArtifacts` (array of raw artifact rows, same schema as `artifacts`, optional)
- `champions` (array of raw champion rows, see below, optional)
- `lastUsed` (array of last-used rows, see below, optional)

**artifacts / inboxArtifacts entries** (raw RSL Helper rows)
- Required keys (exact casing may vary, values are numeric): `ID`, `price`, `rank`, `type`, `lvl`, `mid`, `mfl`, `mlvl`, `mlvlid`, `mgv`, `s1id`, `s1lvl`, `s1fl`, `s1lvlid`, `s1gv`, `s1mlvlid`, `s2id`, `s2lvl`, `s2fl`, `s2lvlid`, `s2gv`, `s2mlvlid`, `s3id`, `s3lvl`, `s3fl`, `s3lvlid`, `s3gv`, `s3mlvlid`, `s4id`, `s4lvl`, `s4fl`, `s4lvlid`, `s4gv`, `s4mlvlid`, `rarity`, `aset`, `accset`, `ss`, `cID`, `sumHP`, `sumATK`, `sumDEF`, `sumSPD`, `sumCQuote`, `sumCDMG`, `sumRES`, `sumACC`, `ASCID`, `ASCLVL`, `ASCFL`, `ASCLVLID`, `ASCGV`, `ASCLEVEL`, `REROLLCOUNT`.
- Meaning notes: `type` is slot id, `mid` is main stat id, `mfl` indicates percent vs flat, `mlvl`/`mlvlid`/`mgv` encode the main stat value, `s?*` fields encode substats, `aset` is set id, `accset` is accessory faction, `cID` is champion id, `sum*` fields are aggregated stats, `ASC*` fields are ascension metadata, and `REROLLCOUNT` tracks substat rerolls.

**champions entries** (raw RSL Helper rows)
- Required keys: `ID`, `Name`, `Vault`, `RVault`, `BaseHeroID`, `Rarity`.
- These rows attach champion metadata to equipped artifacts when supplied.

**lastUsed entries**
- Required keys: `id`, `lastUse`.
- `lastUse` accepts a local timestamp string (`YYYY-MM-DD HH:MM:SS.sss`) or a Julian-day number (same as the SQLite table).
  Omit the array if you do not have last-used data.

**Example (snapshot)**
```json
{"type":"evt","name":"gearDbRawSnapshot","payload":{
  "snapshotId":"demo-raw-db",
  "payloadVersion":1,
  "artifacts":[{
    "ID":4010203,"price":0,"rank":6,"type":5,"lvl":16,"mid":2,"mfl":1,"mlvl":12,
    "mlvlid":75161927680,"mgv":0,"s1id":4,"s1lvl":2,"s1fl":1,"s1lvlid":16492674420,
    "s1gv":0,"s1mlvlid":0,"s2id":7,"s2lvl":1,"s2fl":0,"s2lvlid":5153960760,
    "s2gv":1288490188,"s2mlvlid":0,"s3id":8,"s3lvl":2,"s3fl":0,"s3lvlid":9448928050,
    "s3gv":0,"s3mlvlid":0,"s4id":0,"s4lvl":0,"s4fl":0,"s4lvlid":0,"s4gv":0,"s4mlvlid":0,
    "rarity":6,"aset":8,"accset":0,"ss":0,"cID":0,"sumHP":0,"sumATK":0,"sumDEF":0,"sumSPD":0,
    "sumCQuote":0,"sumCDMG":0,"sumRES":0,"sumACC":0,"ASCID":0,"ASCLVL":0,"ASCFL":0,"ASCLVLID":0,
    "ASCGV":0,"ASCLEVEL":0,"REROLLCOUNT":0
  },{
    "ID":4010204,"price":0,"rank":6,"type":1,"lvl":12,"mid":1,"mfl":0,"mlvl":10,
    "mlvlid":75161927681,"mgv":0,"s1id":5,"s1lvl":1,"s1fl":0,"s1lvlid":1288490188,
    "s1gv":0,"s1mlvlid":0,"s2id":9,"s2lvl":2,"s2fl":0,"s2lvlid":3865470566,
    "s2gv":0,"s2mlvlid":0,"s3id":10,"s3lvl":1,"s3fl":1,"s3lvlid":2147483648,
    "s3gv":0,"s3mlvlid":0,"s4id":0,"s4lvl":0,"s4fl":0,"s4lvlid":0,"s4gv":0,"s4mlvlid":0,
    "rarity":5,"aset":4,"accset":0,"ss":0,"cID":0,"sumHP":0,"sumATK":0,"sumDEF":0,"sumSPD":0,
    "sumCQuote":0,"sumCDMG":0,"sumRES":0,"sumACC":0,"ASCID":0,"ASCLVL":0,"ASCFL":0,"ASCLVLID":0,
    "ASCGV":0,"ASCLEVEL":0,"REROLLCOUNT":0
  }],
  "inboxArtifacts":[{
    "ID":5010203,"price":0,"rank":5,"type":6,"lvl":8,"mid":3,"mfl":1,"mlvl":8,
    "mlvlid":75161927682,"mgv":0,"s1id":6,"s1lvl":1,"s1fl":0,"s1lvlid":1288490189,
    "s1gv":0,"s1mlvlid":0,"s2id":11,"s2lvl":1,"s2fl":0,"s2lvlid":3435973836,
    "s2gv":0,"s2mlvlid":0,"s3id":12,"s3lvl":0,"s3fl":0,"s3lvlid":0,
    "s3gv":0,"s3mlvlid":0,"s4id":0,"s4lvl":0,"s4fl":0,"s4lvlid":0,"s4gv":0,"s4mlvlid":0,
    "rarity":4,"aset":2,"accset":0,"ss":0,"cID":0,"sumHP":0,"sumATK":0,"sumDEF":0,"sumSPD":0,
    "sumCQuote":0,"sumCDMG":0,"sumRES":0,"sumACC":0,"ASCID":0,"ASCLVL":0,"ASCFL":0,"ASCLVLID":0,
    "ASCGV":0,"ASCLEVEL":0,"REROLLCOUNT":0
  },{
    "ID":5010204,"price":0,"rank":5,"type":6,"lvl":8,"mid":3,"mfl":1,"mlvl":8,
    "mlvlid":75161927683,"mgv":0,"s1id":6,"s1lvl":1,"s1fl":0,"s1lvlid":1288490190,
    "s1gv":0,"s1mlvlid":0,"s2id":11,"s2lvl":1,"s2fl":0,"s2lvlid":3435973837,
    "s2gv":0,"s2mlvlid":0,"s3id":12,"s3lvl":0,"s3fl":0,"s3lvlid":0,
    "s3gv":0,"s3mlvlid":0,"s4id":0,"s4lvl":0,"s4fl":0,"s4lvlid":0,"s4gv":0,"s4mlvlid":0,
    "rarity":4,"aset":2,"accset":0,"ss":0,"cID":0,"sumHP":0,"sumATK":0,"sumDEF":0,"sumSPD":0,
    "sumCQuote":0,"sumCDMG":0,"sumRES":0,"sumACC":0,"ASCID":0,"ASCLVL":0,"ASCFL":0,"ASCLVLID":0,
    "ASCGV":0,"ASCLEVEL":0,"REROLLCOUNT":0
  }],
  "champions":[
    {"ID":777001,"Name":"Arbiter","Vault":0,"RVault":0,"BaseHeroID":99001,"Rarity":5},
    {"ID":777002,"Name":"Kael","Vault":0,"RVault":0,"BaseHeroID":99002,"Rarity":3}
  ],
  "lastUsed":[
    {"id":4010203,"lastUse":"2024-05-08 14:33:27.123"},
    {"id":4010204,"lastUse":2460439.042424}
  ]
}}
```

{"type":"evt","name":"gearDbRawDelta","payload":{
  "snapshotId":"demo-raw-db",
  "payloadVersion":1,
  "ops":[
    {"op":"upsert","table":"Artifacts","row":{"ID":4010203,"price":0,"rank":6,"type":5,"lvl":16,"mid":2,"mfl":1,"mlvl":12,"mlvlid":75161927680,"mgv":0,"s1id":4,"s1lvl":3,"s1fl":1,"s1lvlid":19327352832,"s1gv":0,"s1mlvlid":0,"s2id":7,"s2lvl":1,"s2fl":0,"s2lvlid":5153960760,"s2gv":1288490188,"s2mlvlid":0,"s3id":8,"s3lvl":2,"s3fl":0,"s3lvlid":9448928050,"s3gv":0,"s3mlvlid":0,"s4id":0,"s4lvl":0,"s4fl":0,"s4lvlid":0,"s4gv":0,"s4mlvlid":0,"rarity":6,"aset":8,"accset":0,"ss":0,"cID":0,"sumHP":0,"sumATK":0,"sumDEF":0,"sumSPD":0,"sumCQuote":0,"sumCDMG":0,"sumRES":0,"sumACC":0,"ASCID":0,"ASCLVL":0,"ASCFL":0,"ASCLVLID":0,"ASCGV":0,"ASCLEVEL":0,"REROLLCOUNT":0}},
    {"op":"remove","table":"Artifacts","id":99881122},
    {"op":"upsert","table":"LastUsed","row":{"id":4010203,"lastUse":"2024-05-09 09:12:45.000"}}
  ]
}}
```

### ArtifactLog Compatibility (Future Endpoint Shape)

If your endpoint data is shaped like `docs/orig/sampleLog/ArtifactLog.json` and
`docs/orig/sampleLog/ArtifactByHeroIDLog.json`, you can push it directly as:

- `artifactLog` (payload can be an array, or an object that contains `artifactLog`)
- `artifactLogSnapshot` (object payload; supports `artifactLog`, optional `artifactByHeroIDLog`, optional `inboxArtifactLog`)
- `inboxArtifactLog` (treats the array as inbox-only artifacts)

`artifactByHeroIDLog` is interpreted as a `heroId -> slotId -> artifactId`
mapping and gets converted to artifact `cID` values automatically.

Canonical full example (includes currently-optional but app-consumed data):
- `docs/orig/sampleLog/ArtifactLogSnapshot.example.json`
- Includes: `artifactLog`, `artifactByHeroIDLog`, `inboxArtifactLog`, `champions`, `lastUsed`.

**Helper envelope example**
```json
{"type":"evt","name":"artifactLogSnapshot","payload":{
  "snapshotId":"future-artifact-log",
  "artifactLog":[{"id":1001,"kindId":5,"rankId":6,"rarityId":5,"level":16,"setKindId":19,"requiredFraction":0,"rerollsCount":2,"ascendLevel":1,"primary":{"id":1,"level":0,"isAbsolute":1,"statValue":14946486190080,"mValue":0,"glyphValue":0},"secondary":[{"id":7,"level":1,"isAbsolute":0,"statValue":472446401,"mValue":0,"glyphValue":0}]}],
  "artifactByHeroIDLog":{"24120":{"5":1001}},
  "inboxArtifactLog":[{"id":2001,"kindId":8,"rankId":5,"rarityId":3,"level":8,"setKindId":0,"requiredFraction":10,"rerollsCount":0,"ascendLevel":null,"primary":{"id":8,"level":0,"isAbsolute":0,"statValue":1073741824,"mValue":0,"glyphValue":0},"secondary":[{"id":6,"level":1,"isAbsolute":1,"statValue":85899345920,"mValue":0,"glyphValue":0}]}],
  "champions":[{"ID":24120,"Name":"Example Champion","Vault":0,"RVault":0,"BaseHeroID":1010,"Rarity":6}],
  "lastUsed":[{"id":1001,"lastUse":"2026-02-24 10:15:33.000"},{"id":2001,"lastUse":2460439.042424}]
}}
```

**C++ sender example (ixwebsocket + nlohmann/json)**
```cpp
#include <ixwebsocket/IXWebSocket.h>
#include <nlohmann/json.hpp>

using json = nlohmann::json;

int main() {
  ix::WebSocket ws;
  ws.setUrl("ws://127.0.0.1:8765/");
  ws.setSubProtocol("rws");
  ws.start();

  json payload = {
    {"snapshotId", "future-artifact-log"},
    {"artifactLog", json::array({
      {
        {"id", 1001}, {"kindId", 5}, {"rankId", 6}, {"rarityId", 5},
        {"level", 16}, {"setKindId", 19}, {"requiredFraction", 0},
        {"rerollsCount", 2}, {"ascendLevel", 1},
        {"primary", {{"id", 1}, {"level", 0}, {"isAbsolute", 1}, {"statValue", 14946486190080LL}, {"mValue", 0}, {"glyphValue", 0}}},
        {"secondary", json::array({{{"id", 7}, {"level", 1}, {"isAbsolute", 0}, {"statValue", 472446401}, {"mValue", 0}, {"glyphValue", 0}}})}
      }
    })},
    {"artifactByHeroIDLog", {{"24120", {{"5", 1001}}}}},
    {"inboxArtifactLog", json::array({
      {
        {"id", 2001}, {"kindId", 8}, {"rankId", 5}, {"rarityId", 3},
        {"level", 8}, {"setKindId", 0}, {"requiredFraction", 10},
        {"rerollsCount", 0}, {"ascendLevel", nullptr},
        {"primary", {{"id", 8}, {"level", 0}, {"isAbsolute", 0}, {"statValue", 1073741824}, {"mValue", 0}, {"glyphValue", 0}}},
        {"secondary", json::array({{{"id", 6}, {"level", 1}, {"isAbsolute", 1}, {"statValue", 85899345920LL}, {"mValue", 0}, {"glyphValue", 0}}})}
      }
    })},
    {"champions", json::array({{{"ID", 24120}, {"Name", "Example Champion"}, {"Vault", 0}, {"RVault", 0}, {"BaseHeroID", 1010}, {"Rarity", 6}}})},
    {"lastUsed", json::array({{{"id", 1001}, {"lastUse", "2026-02-24 10:15:33.000"}}, {{"id", 2001}, {"lastUse", 2460439.042424}}})}
  };
  json evt = {
    {"type", "evt"},
    {"name", "artifactLogSnapshot"},
    {"payload", payload}
  };
  ws.send(evt.dump());
  ws.stop();
}
```
