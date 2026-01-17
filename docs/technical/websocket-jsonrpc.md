# WebSocket Protocol (JSON-RPC 2.0)

This protocol describes the JSON-RPC 2.0 transport used by Sellfile Creator
when communicating over WebSockets.

## Transport

- WebSocket URL: `ws://<host>:<port>/`
- Subprotocol: `jsonrpc`
- Payloads: JSON text frames

## JSON-RPC Envelope

Every message includes `"jsonrpc": "2.0"`.

### Request

```json
{"jsonrpc":"2.0","id":1,"method":"uploadSellfile","params":{"name":"Sellfile_2026-01-13.hsf","contentType":"application/json","data":"{...}"}}
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
- `data` (string, required): Raw `.hsf` JSON payload.

**Result**
- `ok` (boolean)
- `savedAs` (string)

## Notifications

These are pushed from the server to the browser.

### selectRule

**Params**
- `rowNumber` (number, 1-based)

### gearDbFile

**Params**
- `name` (string, optional): Defaults to `RslHelper.db` if omitted.
- `base64` (string, required): SQLite file contents encoded as base64.

**Example**
```json
{"jsonrpc":"2.0","method":"gearDbFile","params":{"name":"RslHelper.db","base64":"AAECAwQF..."}} 
```

### gearDbRawSnapshot

**Params**
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
{"jsonrpc":"2.0","method":"gearDbRawSnapshot","params":{
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

{"jsonrpc":"2.0","method":"gearDbRawDelta","params":{
  "snapshotId":"demo-raw-db",
  "payloadVersion":1,
  "ops":[
    {"op":"upsert","table":"Artifacts","row":{"ID":4010203,"price":0,"rank":6,"type":5,"lvl":16,"mid":2,"mfl":1,"mlvl":12,"mlvlid":75161927680,"mgv":0,"s1id":4,"s1lvl":3,"s1fl":1,"s1lvlid":19327352832,"s1gv":0,"s1mlvlid":0,"s2id":7,"s2lvl":1,"s2fl":0,"s2lvlid":5153960760,"s2gv":1288490188,"s2mlvlid":0,"s3id":8,"s3lvl":2,"s3fl":0,"s3lvlid":9448928050,"s3gv":0,"s3mlvlid":0,"s4id":0,"s4lvl":0,"s4fl":0,"s4lvlid":0,"s4gv":0,"s4mlvlid":0,"rarity":6,"aset":8,"accset":0,"ss":0,"cID":0,"sumHP":0,"sumATK":0,"sumDEF":0,"sumSPD":0,"sumCQuote":0,"sumCDMG":0,"sumRES":0,"sumACC":0,"ASCID":0,"ASCLVL":0,"ASCFL":0,"ASCLVLID":0,"ASCGV":0,"ASCLEVEL":0,"REROLLCOUNT":0}},
    {"op":"remove","table":"Artifacts","id":99881122},
    {"op":"upsert","table":"LastUsed","row":{"id":4010203,"lastUse":"2024-05-09 09:12:45.000"}}
  ]
}}
```

## Error Codes

Use JSON-RPC standard codes where possible:
- `-32601` Method not found
- `-32602` Invalid params
- `-32603` Internal error

Application-specific errors can use `-32000` to `-32099`.
