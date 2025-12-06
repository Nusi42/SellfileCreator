unit SellfileCreatorDelphiListener;
{
  Minimal Indy-based HTTP bridge for the Sellfile Creator Web Protocol.
  - Accepts PUT uploads at /hsf/{optionalName} and saves the raw .hsf payload.
  - Answers GET /commands with a draining event queue ({ events: [...] }).
  - Keeps GET requests parked (long-poll) via TEvent waiters until data arrives.
  - Replies to OPTIONS/* with permissive CORS headers so file:// launches work.
  - Exposes QueueSelectRule / QueueGearDbFileFromPath helpers for RSL Helper glue code,
    plus JSON-centric helpers for queueing `gearDbRawSnapshot` / `gearDbRawDelta`
    payloads when you want to skip shipping raw SQLite blobs entirely.
  Drop this unit into an existing Delphi/Indy project and wire Start/Stop
  lifetimes to your application lifecycle.

  Communication graph (each arrow is its own HTTP request; browser keeps GET open):

    Sellfile Creator UI                                Listener (this unit / RSL Helper)

         ┌──────────────────── OPTIONS /upload-path ───────────────────────┐
         │      (Origin: null, preflight)  ───────────────▶  204 + CORS     │
         │                                                                  │
  export/sync action:                                                       │
         │      PUT /hsf/Sellfile_YYYYMMDD_HHMM.hsf (body=.hsf JSON) ─────▶ │
         │                                                                  │
         │◀─────────────── 204 No Content + CORS (payload persisted)        │
         │                                                                  │
  background polling (always on):                                           │
         │      GET /commands (long-poll, 30 s timeout) ──────────────────▶ │
         │                                                                  │
         │◀─────────────── 200 { "events": [...] }   or   204 No Content    │
         │                                                                  │
         └─────────────── immediately re-issues GET /commands ────────────▶ │

  When RSL Helper queues a command event (selectRule, gearDbFile, gearDbRawSnapshot,
  gearDbRawDelta), this unit emits the JSON on the next pending GET /commands; multiple
  uploader PUTs can interleave with the long-poll while Indy handles concurrency.

  Raw-table JSON feed — mirrors the SQLite tables for callers who want to keep
  emitting the same data their SQL statements produce:
    - Full snapshot event type: `gearDbRawSnapshot`
    - Payload shape:
        {
          "type": "gearDbRawSnapshot",
          "payloadVersion": 1,
          "snapshotId": "optional helper-owned string",
          "artifacts": [ { ...Artifacts table columns... } ],
          "inboxArtifacts": [ { ...InboxArtifacts columns... } ],
          "champions": [ { ...Champs columns... } ],
          "lastUsed": [ { "id": 123, "lastUse": "2024-05-01 08:15:00" } ]
        }
      * `artifacts` / `inboxArtifacts` entries must expose every column listed
        in ARTIFACT_COLUMN_KEYS (ID, price, rank, type, lvl, mid, mfl, mlvlid,
        mgv, s1id..s4mlvlid, rarity, aset, accset, ss, cID, sum*, ASC*, REROLLCOUNT).
      * `champions` rows match CHAMPION_COLUMN_KEYS (ID, Name, Vault, RVault,
        BaseHeroID, Rarity). Include only when you want equipped gear to carry
        champion metadata in the UI; otherwise the browser simply treats cID as
        a numeric slot owner without labels.
      * `lastUsed` entries mirror `LastUsedArtifacts` with `{ id, lastUse }`
        pairs. Strings or Julian-day numbers are both accepted, same as the DB.
      * Omit `inboxArtifacts`, `champions`, or `lastUsed` arrays when not used.
        The importer treats missing tables exactly like older SQLite dumps.
    - When `snapshotId` is present the Rule Tester remembers it and will refuse
      future `gearDbRawSnapshot` payloads whose `snapshotId` regresses (callers can
      bump it whenever they force a full rebuild). Omit it when you do not need
      that safeguard.
    - The listener hands each record to `normalizeGearDbArtifact`, so the browser
      applies the same decoding and guardrails as the raw `.db` workflow.
    - Scripts/run-sample-server.ps1 exposes `$GearDbRawSnapshotExample` and
      `$GearDbRawDeltaExample` so endpoint authors can copy the column layout directly.
      When building payloads in Delphi, populate arrays of `TGearDbArtifactRow`,
      `TGearDbChampionRow`, and `TGearDbLastUsedRow`, pass them to
      `TSellfileProtocolServer.CreateRawSnapshotPayload`, then call
      `QueueGearDbRawSnapshot` with the returned `TJSONObject`.

  Delta handling for raw-row feeds:
    - Event type: `gearDbRawDelta`
    - Payload shape:
        {
          "type": "gearDbRawDelta",
          "payloadVersion": 1,
          "snapshotId": "must match the active snapshot",
          "ops": [
            { "op": "upsert", "table": "Artifacts", "row": { ...single row... } },
            { "op": "remove", "table": "Artifacts", "id": 4010203 },
            { "op": "upsert", "table": "Champs", "row": { ...champ row... } },
            { "op": "remove", "table": "LastUsed", "id": 4010203 }
          ]
        }
      * Supported tables: `Artifacts`, `InboxArtifacts`, `Champs`, `LastUsed`.
        Table names are case-insensitive; `LastUsed` maps to the `LastUsedArtifacts`
        table so JSON stays compact.
      * `upsert` replaces the row with the provided ID (or inserts it when new).
      * `remove` drops the row keyed by `id`. Unknown IDs are ignored.
      * When `snapshotId` mismatches the last accepted snapshot we drop the event
        and log a warning so the endpoint knows to resend a fresh snapshot.
    - Consumers can emit as many `gearDbRawDelta` events as needed between full
      snapshots; the browser applies them in order so tester diffs stay accurate.
    - For typed deltas, call the overload that accepts arrays of `TGearDbArtifactRow`,
      `TGearDbChampionRow`, and `TGearDbLastUsedRow` plus removal id arrays; the helper
      builds the `ops` list automatically before invoking `QueueGearDbRawDelta`.
}

interface

uses
  System.SysUtils,
  System.Classes,
  System.Generics.Collections,
  System.SyncObjs,
  System.JSON,
  IdHTTPServer,
  IdCustomHTTPServer,
  IdContext;

type
  { Small RAII helper so queued JSON objects are freed automatically. }
  TJsonQueue = class(TObjectList<TJSONObject>)
  public
    constructor Create; reintroduce;
  end;

  { Tracks wait handles for long-poll GET /commands requests. }
  TWaiterList = class(TObjectList<TEvent>)
  public
    constructor Create; reintroduce;
  end;

  { Typed representation of the Artifacts / InboxArtifacts tables. }
  TGearDbArtifactRow = record
    ID: Int64; // Artifact primary key (matches `Artifacts.ID`)
    Price: Int64; // Stored selling price in silver
    Rank: Int64; // Artifact rank (1–6)
    ArtifactType: Int64; // Slot id (1=Helmet, 2=Chest, ... 9=Banner)
    Level: Int64; // Upgrade level (0–16)
    MainStatId: Int64; // Main stat id (1=HP, 2=ATK, ... 8=CDMG)
    MainStatLevel: Int64; // Raw level field (`mlvl` in DB)
    MainStatFlatFlag: Int64; // 1 for flat stats, 0 for percent (values match HSF flag)
    MainStatValueId: Int64; // Fixed-point value (`mlvlid`, divide by 2^32)
    MainStatGlyphValue: Int64; // Glyph bonus (`mgv`)
    SubStat1Id: Int64; // Substat slot 1 id (HSF stat id)
    SubStat1Level: Int64; // Roll count 0–3
    SubStat1FlatFlag: Int64; // 1 flat, 0 percent
    SubStat1ValueId: Int64; // Fixed-point value (`s1lvlid`)
    SubStat1GlyphValue: Int64; // Glyph delta (`s1gv`)
    SubStat1MythValueId: Int64; // Mythical pre-roll value (`s1mlvlid`)
    SubStat2Id: Int64;
    SubStat2Level: Int64;
    SubStat2FlatFlag: Int64;
    SubStat2ValueId: Int64;
    SubStat2GlyphValue: Int64;
    SubStat2MythValueId: Int64;
    SubStat3Id: Int64; // Example: 7 => CR%, 8 => CDMG%
    SubStat3Level: Int64;
    SubStat3FlatFlag: Int64;
    SubStat3ValueId: Int64;
    SubStat3GlyphValue: Int64;
    SubStat3MythValueId: Int64;
    SubStat4Id: Int64;
    SubStat4Level: Int64;
    SubStat4FlatFlag: Int64;
    SubStat4ValueId: Int64;
    SubStat4GlyphValue: Int64;
    SubStat4MythValueId: Int64;
    Rarity: Int64; // 1=Common .. 6=Mythical (HSF rarity codes)
    ArtifactSet: Int64; // Artifact set id (same as HSF)
    AccessoryFaction: Int64; // Accessory faction id (`accset`, matches HSF Faction codes)
    SellStatus: Int64; // `ss` column (0=keep, 1=sell)
    EquippedChampionId: Int64; // `cID` (0 when unequipped)
    SumHP: Int64; // Aggregated stat sums (`sumHP` etc., fixed point)
    SumATK: Int64;
    SumDEF: Int64;
    SumSPD: Int64;
    SumCritRate: Int64; // `sumCQuote`
    SumCritDamage: Int64; // `sumCDMG`
    SumRES: Int64;
    SumACC: Int64;
    AscensionStatId: Int64; // `ASCID`
    AscensionLevel: Int64; // `ASCLVL` (tier within stat)
    AscensionFlatFlag: Int64; // `ASCFL`
    AscensionValueId: Int64; // `ASCLVLID`
    AscensionGlyphValue: Int64; // `ASCGV`
    AscensionTier: Int64; // `ASCLEVEL` (0–6)
    RerollCount: Int64; // Forge reroll count (`REROLLCOUNT`)
    function ToJson: TJSONObject;
  end;

  { Typed representation of the Champs table. }
  TGearDbChampionRow = record
    ID: Int64; // Champion primary key
    Name: string; // Champion display name
    Vault: Int64; // 1 if stored in Vault
    ReserveVault: Int64; // 1 if stored in Reserve Vault
    BaseHeroId: Int64; // Underlying hero id
    Rarity: Int64; // Champion rarity (1=Common..6=Mythical per HSF)
    function ToJson: TJSONObject;
  end;

  { Typed representation of the LastUsedArtifacts rows. }
  TGearDbLastUsedRow = record
    ArtifactId: Int64; // Artifact ID this entry corresponds to
    LastUse: string; // Local timestamp (ISO string, or Julian-day converted) when last equipped
    function ToJson: TJSONObject;
  end;

  { Core server that satisfies the Sellfile Creator push/poll contract. }
  TSellfileProtocolServer = class
  private
    FServer: TIdHTTPServer;
    FPort: Integer;
    FOutputDir: string;
    FCommandQueue: TJsonQueue;
    FQueueLock: TCriticalSection;
    FWaiters: TWaiterList;
    FWaiterLock: TCriticalSection;
    FPollTimeoutMs: Cardinal;
    procedure ConfigureServer;
    procedure HandleCommandGet(AContext: TIdContext; ARequestInfo: TIdHTTPRequestInfo;
      AResponseInfo: TIdHTTPResponseInfo);
    procedure HandleCommandOther(AContext: TIdContext; ARequestInfo: TIdHTTPRequestInfo;
      AResponseInfo: TIdHTTPResponseInfo);
    procedure HandleRequest(AContext: TIdContext; ARequestInfo: TIdHTTPRequestInfo;
      AResponseInfo: TIdHTTPResponseInfo);
    procedure HandleUpload(const ARequestInfo: TIdHTTPRequestInfo; const AResponseInfo: TIdHTTPResponseInfo);
    procedure HandleCommands(const AResponseInfo: TIdHTTPResponseInfo);
    procedure ApplyCors(const AResponseInfo: TIdHTTPResponseInfo);
    procedure SendJson(const AResponseInfo: TIdHTTPResponseInfo; const Payload: TJSONObject);
    procedure SendNoContent(const AResponseInfo: TIdHTTPResponseInfo);
    function ResolveTargetPath(const Document: string): string;
    function DrainCommandQueue: TJSONArray;
    function NormalizeEventPayload(const Payload: TJSONObject): TJSONObject;
    procedure RegisterWaiter(const Waiter: TEvent);
    procedure RemoveWaiter(const Waiter: TEvent);
    function WaitForCommands: Boolean;
    procedure SignalWaiters;
    class function SanitizeSegment(const Segment: string): string; static;
    class function EncodeFileAsBase64(const FilePath: string): string; static;
    class function CreateRawSnapshotPayload(
      const SnapshotId: string;
      const Artifacts, InboxArtifacts, Champions, LastUsed: TJSONArray
    ): TJSONObject; overload; static;
    class function CreateRawSnapshotPayload(
      const SnapshotId: string;
      const Artifacts, InboxArtifacts: TArray<TGearDbArtifactRow>;
      const Champions: TArray<TGearDbChampionRow>;
      const LastUsed: TArray<TGearDbLastUsedRow>
    ): TJSONObject; overload; static;
    class function CreateRawDeltaPayload(
      const SnapshotId: string;
      const Operations: TJSONArray
    ): TJSONObject; overload; static;
    class function CreateRawDeltaPayload(
      const SnapshotId: string;
      const ArtifactUpserts, InboxUpserts: TArray<TGearDbArtifactRow>;
      const ChampionUpserts: TArray<TGearDbChampionRow>;
      const LastUsedUpserts: TArray<TGearDbLastUsedRow>;
      const ArtifactRemovals, InboxRemovals, ChampionRemovals, LastUsedRemovals: TArray<Int64>
    ): TJSONObject; overload; static;
  public
    constructor Create(APort: Integer; const AOutputDirectory: string;
      APollTimeoutMs: Cardinal = 30000);
    destructor Destroy; override;
    procedure Start;
    procedure Stop;
    procedure QueueSelectRule(const RowNumber: Integer);
    procedure QueueRawCommand(const Payload: TJSONObject);
    procedure QueueGearDbFileFromPath(const DbPath, DisplayName: string;
      const DownloadUrl: string = '');
    procedure QueueGearDbRawSnapshot(const Snapshot: TJSONObject);
    procedure QueueGearDbRawDelta(const Delta: TJSONObject);
  end;

implementation

uses
  System.StrUtils,
  System.IOUtils,
  System.NetEncoding;

{ TJsonQueue }

constructor TJsonQueue.Create;
begin
  inherited Create(True); // OwnsObjects=True keeps memory tidy automatically.
end;

{ TWaiterList }

constructor TWaiterList.Create;
begin
  inherited Create(True); // OwnsObjects=True so TEvent instances free with the list.
end;

{ TGearDbArtifactRow }

function TGearDbArtifactRow.ToJson: TJSONObject;
begin
  Result := TJSONObject.Create;
  Result.AddPair('ID', TJSONNumber.Create(ID));
  Result.AddPair('price', TJSONNumber.Create(Price));
  Result.AddPair('rank', TJSONNumber.Create(Rank));
  Result.AddPair('type', TJSONNumber.Create(ArtifactType));
  Result.AddPair('lvl', TJSONNumber.Create(Level));
  Result.AddPair('mid', TJSONNumber.Create(MainStatId));
  Result.AddPair('mlvl', TJSONNumber.Create(MainStatLevel));
  Result.AddPair('mfl', TJSONNumber.Create(MainStatFlatFlag));
  Result.AddPair('mlvlid', TJSONNumber.Create(MainStatValueId));
  Result.AddPair('mgv', TJSONNumber.Create(MainStatGlyphValue));
  Result.AddPair('s1id', TJSONNumber.Create(SubStat1Id));
  Result.AddPair('s1lvl', TJSONNumber.Create(SubStat1Level));
  Result.AddPair('s1fl', TJSONNumber.Create(SubStat1FlatFlag));
  Result.AddPair('s1lvlid', TJSONNumber.Create(SubStat1ValueId));
  Result.AddPair('s1gv', TJSONNumber.Create(SubStat1GlyphValue));
  Result.AddPair('s1mlvlid', TJSONNumber.Create(SubStat1MythValueId));
  Result.AddPair('s2id', TJSONNumber.Create(SubStat2Id));
  Result.AddPair('s2lvl', TJSONNumber.Create(SubStat2Level));
  Result.AddPair('s2fl', TJSONNumber.Create(SubStat2FlatFlag));
  Result.AddPair('s2lvlid', TJSONNumber.Create(SubStat2ValueId));
  Result.AddPair('s2gv', TJSONNumber.Create(SubStat2GlyphValue));
  Result.AddPair('s2mlvlid', TJSONNumber.Create(SubStat2MythValueId));
  Result.AddPair('s3id', TJSONNumber.Create(SubStat3Id));
  Result.AddPair('s3lvl', TJSONNumber.Create(SubStat3Level));
  Result.AddPair('s3fl', TJSONNumber.Create(SubStat3FlatFlag));
  Result.AddPair('s3lvlid', TJSONNumber.Create(SubStat3ValueId));
  Result.AddPair('s3gv', TJSONNumber.Create(SubStat3GlyphValue));
  Result.AddPair('s3mlvlid', TJSONNumber.Create(SubStat3MythValueId));
  Result.AddPair('s4id', TJSONNumber.Create(SubStat4Id));
  Result.AddPair('s4lvl', TJSONNumber.Create(SubStat4Level));
  Result.AddPair('s4fl', TJSONNumber.Create(SubStat4FlatFlag));
  Result.AddPair('s4lvlid', TJSONNumber.Create(SubStat4ValueId));
  Result.AddPair('s4gv', TJSONNumber.Create(SubStat4GlyphValue));
  Result.AddPair('s4mlvlid', TJSONNumber.Create(SubStat4MythValueId));
  Result.AddPair('rarity', TJSONNumber.Create(Rarity));
  Result.AddPair('aset', TJSONNumber.Create(ArtifactSet));
  Result.AddPair('accset', TJSONNumber.Create(AccessoryFaction));
  Result.AddPair('ss', TJSONNumber.Create(SellStatus));
  Result.AddPair('cID', TJSONNumber.Create(EquippedChampionId));
  Result.AddPair('sumHP', TJSONNumber.Create(SumHP));
  Result.AddPair('sumATK', TJSONNumber.Create(SumATK));
  Result.AddPair('sumDEF', TJSONNumber.Create(SumDEF));
  Result.AddPair('sumSPD', TJSONNumber.Create(SumSPD));
  Result.AddPair('sumCQuote', TJSONNumber.Create(SumCritRate));
  Result.AddPair('sumCDMG', TJSONNumber.Create(SumCritDamage));
  Result.AddPair('sumRES', TJSONNumber.Create(SumRES));
  Result.AddPair('sumACC', TJSONNumber.Create(SumACC));
  Result.AddPair('ASCID', TJSONNumber.Create(AscensionStatId));
  Result.AddPair('ASCLVL', TJSONNumber.Create(AscensionLevel));
  Result.AddPair('ASCFL', TJSONNumber.Create(AscensionFlatFlag));
  Result.AddPair('ASCLVLID', TJSONNumber.Create(AscensionValueId));
  Result.AddPair('ASCGV', TJSONNumber.Create(AscensionGlyphValue));
  Result.AddPair('ASCLEVEL', TJSONNumber.Create(AscensionTier));
  Result.AddPair('REROLLCOUNT', TJSONNumber.Create(RerollCount));
end;

{ TGearDbChampionRow }

function TGearDbChampionRow.ToJson: TJSONObject;
begin
  Result := TJSONObject.Create;
  Result.AddPair('ID', TJSONNumber.Create(ID));
  Result.AddPair('Name', Name);
  Result.AddPair('Vault', TJSONNumber.Create(Vault));
  Result.AddPair('RVault', TJSONNumber.Create(ReserveVault));
  Result.AddPair('BaseHeroID', TJSONNumber.Create(BaseHeroId));
  Result.AddPair('Rarity', TJSONNumber.Create(Rarity));
end;

{ TGearDbLastUsedRow }

function TGearDbLastUsedRow.ToJson: TJSONObject;
begin
  Result := TJSONObject.Create;
  Result.AddPair('id', TJSONNumber.Create(ArtifactId));
  Result.AddPair('lastUse', LastUse);
end;

{ TSellfileProtocolServer }

constructor TSellfileProtocolServer.Create(APort: Integer; const AOutputDirectory: string;
  APollTimeoutMs: Cardinal);
begin
  inherited Create;
  FPort := APort; // Listener port (e.g., 4242) must match the ?endpoint the Creator encodes.
  FOutputDir := AOutputDirectory; // Sellfile payloads persist under this directory (mirrors export.hsf).
  FPollTimeoutMs := APollTimeoutMs; // Browser reconnect cadence (default 30 s) matches the PS script.
  FServer := TIdHTTPServer.Create(nil); // Indy server handles threading for each HTTP connection.
  FCommandQueue := TJsonQueue.Create; // Stores outbound { type, ... } envelopes expected by GET /commands.
  FQueueLock := TCriticalSection.Create; // Serializes queue mutation so multiple threads can enqueue.
  FWaiters := TWaiterList.Create; // Tracks long-poll wait handles and their events.
  FWaiterLock := TCriticalSection.Create; // Serializes waiter mutations to avoid stale handles.
  ConfigureServer; // Hooks event handlers + port binding ahead of Start so setup stays centralized.
end;

destructor TSellfileProtocolServer.Destroy;
begin
  Stop; // Defensive: ensure listener threads are torn down before freeing fields to avoid callbacks.
  FWaiterLock.Free;
  FWaiters.Free;
  FQueueLock.Free;
  FCommandQueue.Free;
  FServer.Free;
  inherited;
end;

procedure TSellfileProtocolServer.ConfigureServer;
begin
  FServer.DefaultPort := FPort; // Hardens the binding so Start just flips Active.
  FServer.OnCommandGet := HandleCommandGet; // Handles GET /commands + fallbacks.
  FServer.OnCommandOther := HandleCommandOther; // Captures PUT + OPTIONS flows.
end;

procedure TSellfileProtocolServer.Start;
begin
  if FServer.Active then
    Exit; // Idempotent start to simplify host state machines when toggling watchers.
  ForceDirectories(FOutputDir); // Ensure the export directory exists up front (same as PowerShell harness).
  FServer.Active := True; // Indy spins worker threads per connection at this point so PUT/GETs flow in parallel.
end;

procedure TSellfileProtocolServer.Stop;
begin
  if not FServer.Active then
    Exit; // Guard so repeated Stop calls remain cheap when shutting the helper down.
  FServer.Active := False; // Drops the listener socket and waits for worker threads to unwind.
end;

procedure TSellfileProtocolServer.HandleCommandGet(AContext: TIdContext;
  ARequestInfo: TIdHTTPRequestInfo; AResponseInfo: TIdHTTPResponseInfo);
begin
  HandleRequest(AContext, ARequestInfo, AResponseInfo); // Shared branch for GET.
end;

procedure TSellfileProtocolServer.HandleCommandOther(AContext: TIdContext;
  ARequestInfo: TIdHTTPRequestInfo; AResponseInfo: TIdHTTPResponseInfo);
begin
  HandleRequest(AContext, ARequestInfo, AResponseInfo); // Shared branch for PUT/OPTIONS.
end;

procedure TSellfileProtocolServer.HandleRequest(AContext: TIdContext;
  ARequestInfo: TIdHTTPRequestInfo; AResponseInfo: TIdHTTPResponseInfo);
var
  Method: string;
begin
  Method := UpperCase(ARequestInfo.Command); // Normalize so comparisons stay simple.
  if Method = 'OPTIONS' then
  begin
    ApplyCors(AResponseInfo); // Browsers launched via file:// send Origin=null and preflight.
    SendNoContent(AResponseInfo); // 204 keeps the console client quiet and allows PUTs.
    Exit;
  end;

  if (Method = 'PUT') then
  begin
    HandleUpload(ARequestInfo, AResponseInfo); // Accept the Sellfile JSON payload.
    Exit;
  end;

  if (Method = 'GET') and SameText(ARequestInfo.Document, '/commands') then
  begin
    HandleCommands(AResponseInfo); // Long-poll queue delivery.
    Exit;
  end;

  AResponseInfo.ResponseNo := 405; // Any other method/path falls through to 405.
  AResponseInfo.ContentType := 'text/plain';
  AResponseInfo.ContentText := 'Only PUT /hsf/{name} and GET /commands are supported.';
  ApplyCors(AResponseInfo); // CORS headers keep the browser error readable.
end;

procedure TSellfileProtocolServer.HandleUpload(const ARequestInfo: TIdHTTPRequestInfo;
  const AResponseInfo: TIdHTTPResponseInfo);
var
  TargetPath: string;
  FileStream: TFileStream;
begin
  TargetPath := ResolveTargetPath(ARequestInfo.Document); // Sanitizes /segment + forces .hsf.
  ForceDirectories(ExtractFileDir(TargetPath)); // Mirror PowerShell harness behavior.
  FileStream := TFileStream.Create(TargetPath, fmCreate or fmShareDenyWrite);
  try
    if Assigned(ARequestInfo.PostStream) then
      FileStream.CopyFrom(ARequestInfo.PostStream, 0) // Persist bytes verbatim.
    else if ARequestInfo.RawContentStream <> nil then
      FileStream.CopyFrom(ARequestInfo.RawContentStream, 0)
    else
      raise Exception.Create('Empty Sellfile payload received.');
  finally
    FileStream.Free;
  end;
  ApplyCors(AResponseInfo); // Upload callers still expect permissive headers.
  SendNoContent(AResponseInfo); // 204 matches the documented protocol surface.
end;

procedure TSellfileProtocolServer.HandleCommands(const AResponseInfo: TIdHTTPResponseInfo);
var
  Events: TJSONArray;
  Envelope: TJSONObject;
begin
  Events := DrainCommandQueue; // Pull any queued commands immediately.
  try
    if Events.Count = 0 then
    begin
      if not WaitForCommands then
      begin
        ApplyCors(AResponseInfo); // Timeout path still emits the usual headers.
        SendNoContent(AResponseInfo); // Browser sees 204 and re-issues the poll.
        Exit;
      end;
      Events.Free;
      Events := DrainCommandQueue; // Wake-up signal means commands were queued.
      if Events.Count = 0 then
      begin
        ApplyCors(AResponseInfo);
        SendNoContent(AResponseInfo); // Edge case: spurious wake-up, so keep client polling.
        Exit;
      end;
    end;

    Envelope := TJSONObject.Create; // Wrap events array to mirror { events: [...] } payloads.
    try
      Envelope.AddPair('events', Events); // Ownership transfers to the JSON envelope.
      ApplyCors(AResponseInfo);
      SendJson(AResponseInfo, Envelope); // Browser consumes the events and reconnects.
    finally
      Envelope.Free; // Events are freed automatically because the pair owns them.
    end;
  finally
    // When SendJson takes ownership the array is already freed, so guard for nil.
    if Events <> nil then
      Events.Free;
  end;
end;

procedure TSellfileProtocolServer.ApplyCors(const AResponseInfo: TIdHTTPResponseInfo);
begin
  AResponseInfo.CustomHeaders.Values['Access-Control-Allow-Origin'] := '*'; // file:// origins send null.
  AResponseInfo.CustomHeaders.Values['Access-Control-Allow-Methods'] := 'PUT, GET, OPTIONS'; // Match the app’s surface.
  AResponseInfo.CustomHeaders.Values['Access-Control-Allow-Headers'] := 'content-type'; // Browser sets Content-Type on PUT.
end;

procedure TSellfileProtocolServer.SendJson(const AResponseInfo: TIdHTTPResponseInfo;
  const Payload: TJSONObject);
begin
  AResponseInfo.ResponseNo := 200; // OK envelope for GET /commands.
  AResponseInfo.ContentType := 'application/json; charset=utf-8'; // Matches Creator expectations.
  AResponseInfo.CharSet := 'utf-8';
  AResponseInfo.ContentText := Payload.ToJSON; // Compact JSON so DevTools logs cleanly.
end;

procedure TSellfileProtocolServer.SendNoContent(const AResponseInfo: TIdHTTPResponseInfo);
begin
  AResponseInfo.ResponseNo := 204; // Keeps responses terse and spec-compliant.
  AResponseInfo.ContentText := ''; // Explicit empty body avoids chunked transfer noise.
end;

function TSellfileProtocolServer.ResolveTargetPath(const Document: string): string;
var
  TrimmedPath: string;
  Parts: TArray<string>;
  CleanParts: TArray<string>;
  Part: string;
  Sanitized: string;
  Count: Integer;
  I: Integer;
  TargetDir: string;
  FileName: string;
begin
  TrimmedPath := Document; // Example: '/hsf/Sellfile_20240214_1545.hsf'.
  if TrimmedPath = '' then
    TrimmedPath := '/';
  if TrimmedPath.StartsWith('/') then
    TrimmedPath := TrimmedPath.Substring(1); // Remove the leading slash before splitting.
  if TrimmedPath.EndsWith('/') then
    TrimmedPath := TrimmedPath.Substring(0, TrimmedPath.Length - 1); // Drop trailing slash noise.
  if TrimmedPath = '' then
    Exit(TPath.Combine(FOutputDir, 'export.hsf')); // Default when no name was provided.

  Parts := TrimmedPath.Split(['/']); // Preserve every path segment so `/hsf/foo/bar` stays nested.
  SetLength(CleanParts, 0);
  for Part in Parts do
  begin
    if Part.Trim = '' then
      Continue;
    Sanitized := SanitizeSegment(Part); // Keep filesystem-safe names only.
    if Sanitized = '' then
      Continue;
    Count := Length(CleanParts);
    SetLength(CleanParts, Count + 1);
    CleanParts[Count] := Sanitized;
  end;
  if Length(CleanParts) = 0 then
    Exit(TPath.Combine(FOutputDir, 'export.hsf'));

  FileName := CleanParts[High(CleanParts)];
  if not EndsText('.hsf', FileName) then
    FileName := FileName + '.hsf'; // Enforce canonical Sellfile extension.

  TargetDir := FOutputDir;
  if Length(CleanParts) > 1 then
  begin
    for I := 0 to High(CleanParts) - 1 do
      TargetDir := TPath.Combine(TargetDir, CleanParts[I]); // Rebuild nested directories.
  end;
  Result := TPath.Combine(TargetDir, FileName); // Absolute path for the upload.
end;

class function TSellfileProtocolServer.EncodeFileAsBase64(const FilePath: string): string;
var
  Bytes: TBytes;
begin
  Bytes := TFile.ReadAllBytes(FilePath); // Load the DB/Sellfile bytes into memory.
  Result := TNetEncoding.Base64.EncodeBytesToString(Bytes); // Export as base64 for JSON transport.
end;

function TSellfileProtocolServer.DrainCommandQueue: TJSONArray;
var
  Snapshot: TJSONArray;
  EventObj: TJSONObject;
begin
  Snapshot := TJSONArray.Create; // JSON array returned to the caller (caller owns/free).
  FQueueLock.Acquire;
  try
    while FCommandQueue.Count > 0 do
    begin
      EventObj := FCommandQueue.Extract(FCommandQueue.Items[0]); // POP from head.
      Snapshot.AddElement(EventObj); // Ownership transfers to the JSON array.
    end;
  finally
    FQueueLock.Release;
  end;
  Result := Snapshot;
end;

function TSellfileProtocolServer.NormalizeEventPayload(const Payload: TJSONObject): TJSONObject;
begin
  Result := TJSONObject.Create; // Create a deep-ish copy so callers keep ownership.
  Result.Parse(BytesOf(Payload.ToJSON), 0); // JSON round-trip keeps things simple.
end;

procedure TSellfileProtocolServer.QueueSelectRule(const RowNumber: Integer);
var
  Payload: TJSONObject;
begin
  Payload := TJSONObject.Create; // Build a { type:"selectRule", rowNumber:n } envelope.
  try
    Payload.AddPair('type', 'selectRule');
    Payload.AddPair('rowNumber', TJSONNumber.Create(RowNumber)); // Grid rows are 1-based in the UI.
    QueueRawCommand(Payload); // Shared queueing path handles serialization + wake-ups.
  finally
    Payload.Free;
  end;
end;

procedure TSellfileProtocolServer.QueueGearDbFileFromPath(const DbPath, DisplayName: string;
  const DownloadUrl: string);
var
  Payload: TJSONObject;
  Base64Data: string;
begin
  if not TFile.Exists(DbPath) then
    raise Exception.CreateFmt('Gear DB path "%s" was not found.', [DbPath]);

  Payload := TJSONObject.Create; // Mirrors { type:"gearDbFile", name, base64|downloadPath }.
  try
    Payload.AddPair('type', 'gearDbFile');
    Payload.AddPair('name', DisplayName);
    if DownloadUrl <> '' then
      Payload.AddPair('downloadPath', DownloadUrl) // Helper will host bytes elsewhere.
    else
    begin
      Base64Data := EncodeFileAsBase64(DbPath); // Inline the DB bytes for convenience.
      Payload.AddPair('base64', Base64Data);
    end;
    QueueRawCommand(Payload); // Sends the event on the next GET /commands response.
  finally
    Payload.Free;
  end;
end;

class function TSellfileProtocolServer.CreateRawSnapshotPayload(
  const SnapshotId: string;
  const Artifacts, InboxArtifacts, Champions, LastUsed: TJSONArray
): TJSONObject;

  function CloneArray(Source: TJSONArray): TJSONArray;
  begin
    if Source <> nil then
      Result := Source.Clone as TJSONArray
    else
      Result := TJSONArray.Create;
  end;

begin
  Result := TJSONObject.Create;
  Result.AddPair('type', 'gearDbRawSnapshot');
  Result.AddPair('payloadVersion', TJSONNumber.Create(1));
  if SnapshotId <> '' then
    Result.AddPair('snapshotId', SnapshotId);
  Result.AddPair('artifacts', CloneArray(Artifacts));
  if InboxArtifacts <> nil then
    Result.AddPair('inboxArtifacts', CloneArray(InboxArtifacts));
  if Champions <> nil then
    Result.AddPair('champions', CloneArray(Champions));
  if LastUsed <> nil then
    Result.AddPair('lastUsed', CloneArray(LastUsed));
end;

class function TSellfileProtocolServer.CreateRawSnapshotPayload(
  const SnapshotId: string;
  const Artifacts, InboxArtifacts: TArray<TGearDbArtifactRow>;
  const Champions: TArray<TGearDbChampionRow>;
  const LastUsed: TArray<TGearDbLastUsedRow>
): TJSONObject;
var
  ArtifactArr, InboxArr, ChampArr, LastArr: TJSONArray;

  function BuildArtifactArray(const Rows: TArray<TGearDbArtifactRow>): TJSONArray;
  var
    Row: TGearDbArtifactRow;
  begin
    Result := TJSONArray.Create;
    for Row in Rows do
      Result.AddElement(Row.ToJson);
  end;

  function BuildChampionArray(const Rows: TArray<TGearDbChampionRow>): TJSONArray;
  var
    Row: TGearDbChampionRow;
  begin
    Result := TJSONArray.Create;
    for Row in Rows do
      Result.AddElement(Row.ToJson);
  end;

  function BuildLastUsedArray(const Rows: TArray<TGearDbLastUsedRow>): TJSONArray;
  var
    Row: TGearDbLastUsedRow;
  begin
    Result := TJSONArray.Create;
    for Row in Rows do
      Result.AddElement(Row.ToJson);
  end;

begin
  ArtifactArr := nil;
  InboxArr := nil;
  ChampArr := nil;
  LastArr := nil;
  try
    ArtifactArr := BuildArtifactArray(Artifacts);
    if Length(InboxArtifacts) > 0 then
      InboxArr := BuildArtifactArray(InboxArtifacts);
    if Length(Champions) > 0 then
      ChampArr := BuildChampionArray(Champions);
    if Length(LastUsed) > 0 then
      LastArr := BuildLastUsedArray(LastUsed);
    Result := CreateRawSnapshotPayload(SnapshotId, ArtifactArr, InboxArr, ChampArr, LastArr);
  finally
    ArtifactArr.Free;
    InboxArr.Free;
    ChampArr.Free;
    LastArr.Free;
  end;
end;

class function TSellfileProtocolServer.CreateRawDeltaPayload(
  const SnapshotId: string;
  const Operations: TJSONArray
): TJSONObject;
var
  OpsClone: TJSONArray;
begin
  if Operations = nil then
    raise Exception.Create('Delta payload requires operations.');
  OpsClone := Operations.Clone as TJSONArray;
  Result := TJSONObject.Create;
  Result.AddPair('type', 'gearDbRawDelta');
  Result.AddPair('payloadVersion', TJSONNumber.Create(1));
  if SnapshotId <> '' then
    Result.AddPair('snapshotId', SnapshotId);
  Result.AddPair('ops', OpsClone);
end;

class function TSellfileProtocolServer.CreateRawDeltaPayload(
  const SnapshotId: string;
  const ArtifactUpserts, InboxUpserts: TArray<TGearDbArtifactRow>;
  const ChampionUpserts: TArray<TGearDbChampionRow>;
  const LastUsedUpserts: TArray<TGearDbLastUsedRow>;
  const ArtifactRemovals, InboxRemovals, ChampionRemovals, LastUsedRemovals: TArray<Int64>
): TJSONObject;
var
  Ops: TJSONArray;

  procedure AddArtifactUpserts(const Rows: TArray<TGearDbArtifactRow>; const TableName: string);
  var
    Row: TGearDbArtifactRow;
    Op: TJSONObject;
  begin
    for Row in Rows do
    begin
      Op := TJSONObject.Create;
      Op.AddPair('op', 'upsert');
      Op.AddPair('table', TableName);
      Op.AddPair('row', Row.ToJson);
      Ops.AddElement(Op);
    end;
  end;

  procedure AddChampionUpserts(const Rows: TArray<TGearDbChampionRow>);
  var
    Row: TGearDbChampionRow;
    Op: TJSONObject;
  begin
    for Row in Rows do
    begin
      Op := TJSONObject.Create;
      Op.AddPair('op', 'upsert');
      Op.AddPair('table', 'Champs');
      Op.AddPair('row', Row.ToJson);
      Ops.AddElement(Op);
    end;
  end;

  procedure AddLastUsedUpserts(const Rows: TArray<TGearDbLastUsedRow>);
  var
    Row: TGearDbLastUsedRow;
    Op: TJSONObject;
  begin
    for Row in Rows do
    begin
      Op := TJSONObject.Create;
      Op.AddPair('op', 'upsert');
      Op.AddPair('table', 'LastUsed');
      Op.AddPair('row', Row.ToJson);
      Ops.AddElement(Op);
    end;
  end;

  procedure AddRemovals(const Ids: TArray<Int64>; const TableName: string);
  var
    Value: Int64;
    Op: TJSONObject;
  begin
    for Value in Ids do
    begin
      Op := TJSONObject.Create;
      Op.AddPair('op', 'remove');
      Op.AddPair('table', TableName);
      Op.AddPair('id', TJSONNumber.Create(Value));
      Ops.AddElement(Op);
    end;
  end;

begin
  Ops := TJSONArray.Create;
  try
    AddArtifactUpserts(ArtifactUpserts, 'Artifacts');
    AddArtifactUpserts(InboxUpserts, 'InboxArtifacts');
    AddChampionUpserts(ChampionUpserts);
    AddLastUsedUpserts(LastUsedUpserts);
    AddRemovals(ArtifactRemovals, 'Artifacts');
    AddRemovals(InboxRemovals, 'InboxArtifacts');
    AddRemovals(ChampionRemovals, 'Champs');
    AddRemovals(LastUsedRemovals, 'LastUsed');
    Result := CreateRawDeltaPayload(SnapshotId, Ops);
  finally
    Ops.Free;
  end;
end;

procedure TSellfileProtocolServer.QueueGearDbRawSnapshot(const Snapshot: TJSONObject);
var
  TypeValue, ArtifactsValue: TJSONValue;
begin
  if Snapshot = nil then
    raise Exception.Create('Snapshot payload cannot be nil.');
  ArtifactsValue := Snapshot.Values['artifacts'];
  if not (ArtifactsValue is TJSONArray) then
    raise Exception.Create('gearDbRawSnapshot requires an "artifacts" array.');
  TypeValue := Snapshot.Values['type'];
  if not ((TypeValue is TJSONString) and SameText(TJSONString(TypeValue).Value, 'gearDbRawSnapshot')) then
  begin
    if TypeValue <> nil then
      Snapshot.RemovePair('type').Free;
    Snapshot.AddPair('type', 'gearDbRawSnapshot');
  end;
  QueueRawCommand(Snapshot);
end;

procedure TSellfileProtocolServer.QueueGearDbRawDelta(const Delta: TJSONObject);
var
  TypeValue, OpsValue: TJSONValue;
begin
  if Delta = nil then
    raise Exception.Create('Delta payload cannot be nil.');
  OpsValue := Delta.Values['ops'];
  if not (OpsValue is TJSONArray) then
    raise Exception.Create('gearDbRawDelta requires an "ops" array.');
  TypeValue := Delta.Values['type'];
  if not ((TypeValue is TJSONString) and SameText(TJSONString(TypeValue).Value, 'gearDbRawDelta')) then
  begin
    if TypeValue <> nil then
      Delta.RemovePair('type').Free;
    Delta.AddPair('type', 'gearDbRawDelta');
  end;
  QueueRawCommand(Delta);
end;

procedure TSellfileProtocolServer.QueueRawCommand(const Payload: TJSONObject);
var
  CopyPayload: TJSONObject;
begin
  CopyPayload := NormalizeEventPayload(Payload); // Normalize once so queue storage is uniform.
  FQueueLock.Acquire;
  try
    FCommandQueue.Add(CopyPayload); // Append to the tail so events stay ordered.
    if FCommandQueue.Count > 200 then
      FCommandQueue.Delete(0); // Drop the oldest entry when capacity is exceeded.
  finally
    FQueueLock.Release;
  end;
  SignalWaiters; // Wake any blocked GET /commands calls so they flush immediately.
end;

procedure TSellfileProtocolServer.RegisterWaiter(const Waiter: TEvent);
begin
  FWaiterLock.Acquire;
  try
    FWaiters.Add(Waiter); // Track the event so QueueRawCommand can SetEvent later.
  finally
    FWaiterLock.Release;
  end;
end;

procedure TSellfileProtocolServer.RemoveWaiter(const Waiter: TEvent);
begin
  FWaiterLock.Acquire;
  try
    FWaiters.Remove(Waiter); // Remove prevents stale wait handles from leaking.
  finally
    FWaiterLock.Release;
  end;
end;

function TSellfileProtocolServer.WaitForCommands: Boolean;
var
  Waiter: TEvent;
begin
  Waiter := TEvent.Create(nil, True, False, ''); // Manual-reset so multiple QueueRawCommand calls wake the same waiter.
  RegisterWaiter(Waiter); // Track it before blocking so SignalWaiters can touch it.
  try
    Result := Waiter.WaitFor(FPollTimeoutMs) = wrSignaled; // True means QueueRawCommand fired before timeout.
  finally
    RemoveWaiter(Waiter); // Ensure subsequent events do not target a freed handle.
    Waiter.Free;
  end;
end;

procedure TSellfileProtocolServer.SignalWaiters;
var
  Waiter: TEvent;
begin
  FWaiterLock.Acquire;
  try
    for Waiter in FWaiters do
      Waiter.SetEvent; // Wake all blocked polls; first responder will drain the queue.
  finally
    FWaiterLock.Release;
  end;
end;

class function TSellfileProtocolServer.SanitizeSegment(const Segment: string): string;
var
  Builder: TStringBuilder;
  Ch: Char;
begin
  Builder := TStringBuilder.Create;
  try
    for Ch in Segment do
    begin
      if CharInSet(Ch, ['a' .. 'z', 'A' .. 'Z', '0' .. '9', '_', '.', '-']) then
        Builder.Append(Char.ToLower(Ch)) // Lowercase to keep filenames predictable.
      else
        Builder.Append('-'); // Replace unsafe characters with a dash.
    end;
    if Builder.Length = 0 then
      Builder.Append('upload'); // Fallback when the input was entirely invalid.
    Result := Builder.ToString;
  finally
    Builder.Free;
  end;
end;

end.
