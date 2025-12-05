unit SellfileCreatorDelphiListener;
{
  Minimal Indy-based HTTP bridge for the Sellfile Creator Web Protocol.
  - Accepts PUT uploads at /{optionalName} and saves the raw .hsf payload.
  - Answers GET /commands with a draining event queue ({ events: [...] }).
  - Keeps GET requests parked (long-poll) via TEvent waiters until data arrives.
  - Replies to OPTIONS/* with permissive CORS headers so file:// launches work.
  - Exposes QueueSelectRule / QueueTesterItems helpers for RSL Helper glue code.
  Drop this unit into an existing Delphi/Indy project and wire Start/Stop
  lifetimes to your application lifecycle.

  Communication graph (each arrow is its own HTTP request; browser keeps GET open):

    Sellfile Creator UI                                Listener (this unit / RSL Helper)

         ┌──────────────────── OPTIONS /upload-path ───────────────────────┐
         │      (Origin: null, preflight)  ───────────────▶  204 + CORS     │
         │                                                                  │
  export/sync action:                                                       │
         │      PUT /Sellfile_YYYYMMDD_HHMM.hsf (body=.hsf JSON) ─────────▶ │
         │                                                                  │
         │◀─────────────── 204 No Content + CORS (payload persisted)        │
         │                                                                  │
  background polling (always on):                                           │
         │      GET /commands (long-poll, 30 s timeout) ──────────────────▶ │
         │                                                                  │
         │◀─────────────── 200 { "events": [...] }   or   204 No Content    │
         │                                                                  │
         └─────────────── immediately re-issues GET /commands ────────────▶ │

  When RSL Helper queues a command event (selectRule, testerItems, gearDbFile),
  this unit emits the JSON on the next pending GET /commands; multiple uploader
  PUTs can interleave with the long-poll while Indy handles concurrency.
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
  public
    constructor Create(APort: Integer; const AOutputDirectory: string;
      APollTimeoutMs: Cardinal = 30000);
    destructor Destroy; override;
    procedure Start;
    procedure Stop;
    procedure QueueSelectRule(const RowNumber: Integer);
    procedure QueueTesterItems(const Items: TJSONArray; const OpenTester: Boolean);
    procedure QueueRawCommand(const Payload: TJSONObject);
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
  AResponseInfo.ContentText := 'Only PUT /{name} and GET /commands are supported.';
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
  Segment: string;
  SlashPos: Integer;
begin
  Segment := Document; // Document is already absolute (e.g., '/Sellfile_20240214_1545.hsf').
  if Segment = '' then
    Segment := '/';
  if Segment.StartsWith('/') then
    Segment := Segment.Substring(1); // Trim leading slash before inspecting the name.
  SlashPos := Segment.IndexOf('/');
  if SlashPos >= 0 then
    Segment := Segment.Substring(0, SlashPos); // Only honor the first path segment.
  if Segment = '' then
    Segment := 'export.hsf'; // Mirror script default when no name was supplied by the browser.
  Segment := SanitizeSegment(Segment); // Drops characters outside [a-z0-9_.-].
  if not EndsText('.hsf', Segment) then
    Segment := Segment + '.hsf'; // Forces canonical extension so helper apps detect it.
  Result := TPath.Combine(FOutputDir, Segment); // Final absolute path for the upload.
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

procedure TSellfileProtocolServer.QueueTesterItems(const Items: TJSONArray; const OpenTester: Boolean);
var
  Payload: TJSONObject;
begin
  Payload := TJSONObject.Create; // Payload mirrors the Rule Tester contract.
  try
    Payload.AddPair('type', 'testerItems');
    Payload.AddPair('openTester', TJSONBool.Create(OpenTester)); // True opens the dialog immediately.
    Payload.AddPair('items', Items.Clone as TJSONArray); // Clone so caller keeps its array instance.
    QueueRawCommand(Payload); // Dispatch to the shared queue.
  finally
    Payload.Free;
  end;
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
