#include <websocketpp/config/asio_no_tls.hpp>
#include <websocketpp/server.hpp>

#include <nlohmann/json.hpp>
#include <sqlite3.h>

#include <algorithm>
#include <atomic>
#include <chrono>
#include <cctype>
#include <cstdint>
#include <cstdlib>
#include <cstring>
#include <filesystem>
#include <fstream>
#include <functional>
#include <iostream>
#include <mutex>
#include <memory>
#include <optional>
#include <random>
#include <set>
#include <sstream>
#include <string>
#include <thread>
#include <unordered_map>
#include <vector>

#if defined(_WIN32)
#include <conio.h>
#else
#include <sys/select.h>
#include <termios.h>
#include <unistd.h>
#endif

namespace fs = std::filesystem;
using json = nlohmann::json;
using WsServer = websocketpp::server<websocketpp::config::asio>;
using ConnectionHdl = websocketpp::connection_hdl;
using ClientSet = std::set<ConnectionHdl, std::owner_less<ConnectionHdl>>;

// Keep protocol names centralized so parsing + framing stay aligned.
constexpr const char* kProtocolJsonRpc = "jsonrpc";
constexpr const char* kProtocolHelper = "helper";

// Keep request method names centralized for both protocols.
constexpr const char* kUploadSellfileMethod = "uploadSellfile";

// New endpoint event name we send after SQL conversion.
constexpr const char* kArtifactLogSnapshotEvent = "artifactLogSnapshot";

// Poll and read staleness windows are tuned to avoid partial file reads.
constexpr std::chrono::milliseconds kWatchPollInterval(500);
constexpr std::chrono::milliseconds kMinStableFileAge(500);

struct AppConfig {
  // Local endpoint bind port for the local app connection.
  int port = 8765;
  // Required app entry path used to build file:// launch URL.
  fs::path appEntryPath;
  // Output path used by uploadSellfile request handling.
  fs::path outputPath = fs::path("exported-sellfile.hsf");
  // Input path for RSL Helper DB file or containing folder.
  fs::path gearDbPath;
  // Enable/disable DB watcher loop.
  bool watchGearDb = true;
  // Protocol mode controls request/notification envelope shape.
  std::string protocol = kProtocolHelper;
  // Browser auto-open flag for launch URL parity.
  bool openBrowser = true;
};

struct SnapshotCache {
  // Serialized payload event body reused for late joiners.
  json payload;
  // Signature avoids rebroadcasting unchanged snapshots.
  std::string signature;
};

struct StatementColumns {
  // Case-insensitive lookup from column name to sqlite index.
  std::unordered_map<std::string, int> byName;
};

static std::string toLower(std::string value) {
  // Normalize tokens to lowercase for case-insensitive comparisons.
  std::transform(value.begin(), value.end(), value.begin(), [](unsigned char c) {
    return static_cast<char>(std::tolower(c));
  });
  return value;
}

static std::optional<std::string> getText(sqlite3_stmt* stmt, const StatementColumns& cols, const std::vector<std::string>& names) {
  // Return first non-null text from alias list.
  for (const auto& name : names) {
    const auto it = cols.byName.find(toLower(name));
    if (it == cols.byName.end()) continue;
    const int idx = it->second;
    if (sqlite3_column_type(stmt, idx) == SQLITE_NULL) continue;
    const unsigned char* raw = sqlite3_column_text(stmt, idx);
    if (raw == nullptr) continue;
    return std::string(reinterpret_cast<const char*>(raw));
  }
  return std::nullopt;
}

static std::optional<int64_t> getInt(sqlite3_stmt* stmt, const StatementColumns& cols, const std::vector<std::string>& names) {
  // Return first integer-like value from alias list.
  for (const auto& name : names) {
    const auto it = cols.byName.find(toLower(name));
    if (it == cols.byName.end()) continue;
    const int idx = it->second;
    if (sqlite3_column_type(stmt, idx) == SQLITE_NULL) continue;
    if (sqlite3_column_type(stmt, idx) == SQLITE_INTEGER) {
      return sqlite3_column_int64(stmt, idx);
    }
    if (sqlite3_column_type(stmt, idx) == SQLITE_FLOAT) {
      return static_cast<int64_t>(sqlite3_column_double(stmt, idx));
    }
    const auto text = getText(stmt, cols, {name});
    if (!text.has_value()) continue;
    try {
      return std::stoll(text.value());
    } catch (...) {
      continue;
    }
  }
  return std::nullopt;
}

static std::optional<double> getDouble(sqlite3_stmt* stmt, const StatementColumns& cols, const std::vector<std::string>& names) {
  // Return first numeric-like value preserving floating point precision.
  for (const auto& name : names) {
    const auto it = cols.byName.find(toLower(name));
    if (it == cols.byName.end()) continue;
    const int idx = it->second;
    if (sqlite3_column_type(stmt, idx) == SQLITE_NULL) continue;
    if (sqlite3_column_type(stmt, idx) == SQLITE_INTEGER || sqlite3_column_type(stmt, idx) == SQLITE_FLOAT) {
      return sqlite3_column_double(stmt, idx);
    }
    const auto text = getText(stmt, cols, {name});
    if (!text.has_value()) continue;
    try {
      return std::stod(text.value());
    } catch (...) {
      continue;
    }
  }
  return std::nullopt;
}

static int64_t getIntOr(sqlite3_stmt* stmt, const StatementColumns& cols, const std::vector<std::string>& names, int64_t fallback = 0) {
  // Collapse optional integer reads into one fallback path.
  const auto value = getInt(stmt, cols, names);
  return value.value_or(fallback);
}

static bool tableExists(sqlite3* db, const std::string& tableName) {
  // Check sqlite_master to avoid hard failures when optional tables are absent.
  sqlite3_stmt* stmt = nullptr;
  const char* sql = "SELECT 1 FROM sqlite_master WHERE type='table' AND lower(name)=lower(?) LIMIT 1";
  if (sqlite3_prepare_v2(db, sql, -1, &stmt, nullptr) != SQLITE_OK) {
    return false;
  }
  sqlite3_bind_text(stmt, 1, tableName.c_str(), -1, SQLITE_TRANSIENT);
  const int rc = sqlite3_step(stmt);
  sqlite3_finalize(stmt);
  return rc == SQLITE_ROW;
}

static StatementColumns buildColumns(sqlite3_stmt* stmt) {
  // Build once-per-query column lookup table.
  StatementColumns cols;
  const int count = sqlite3_column_count(stmt);
  for (int i = 0; i < count; ++i) {
    const char* rawName = sqlite3_column_name(stmt, i);
    if (rawName == nullptr) continue;
    cols.byName[toLower(std::string(rawName))] = i;
  }
  return cols;
}

static json buildPrimaryStat(sqlite3_stmt* stmt, const StatementColumns& cols) {
  // Convert SQL main-stat columns into ArtifactLog primary shape.
  return {
    {"id", getIntOr(stmt, cols, {"mid"})},
    {"level", getIntOr(stmt, cols, {"mlvl"})},
    {"isAbsolute", getIntOr(stmt, cols, {"mfl"})},
    {"statValue", getIntOr(stmt, cols, {"mlvlid"})},
    {"mValue", 0},
    {"glyphValue", getIntOr(stmt, cols, {"mgv"})}
  };
}

static std::optional<json> buildAscendStat(sqlite3_stmt* stmt, const StatementColumns& cols) {
  // Convert SQL ascension columns into ArtifactLog ascend shape.
  const int64_t ascendId = getIntOr(stmt, cols, {"ASCID"});
  if (ascendId <= 0) return std::nullopt;
  return json{
    {"id", ascendId},
    {"level", getIntOr(stmt, cols, {"ASCLVL"})},
    {"isAbsolute", getIntOr(stmt, cols, {"ASCFL"})},
    {"statValue", getIntOr(stmt, cols, {"ASCLVLID"})},
    {"mValue", 0},
    {"glyphValue", getIntOr(stmt, cols, {"ASCGV"})}
  };
}

static json buildSecondaryStats(sqlite3_stmt* stmt, const StatementColumns& cols) {
  // Flatten s1..s4 SQL columns into ArtifactLog secondary[] entries.
  json secondary = json::array();
  for (int slot = 1; slot <= 4; ++slot) {
    const std::string p = "s" + std::to_string(slot);
    const int64_t id = getIntOr(stmt, cols, {p + "id"});
    if (id <= 0) continue;
    secondary.push_back({
      {"id", id},
      {"level", getIntOr(stmt, cols, {p + "lvl"})},
      {"isAbsolute", getIntOr(stmt, cols, {p + "fl"})},
      {"statValue", getIntOr(stmt, cols, {p + "lvlid"})},
      {"mValue", getIntOr(stmt, cols, {p + "mlvlid"})},
      {"glyphValue", getIntOr(stmt, cols, {p + "gv"})}
    });
  }
  return secondary;
}

static std::optional<json> convertArtifactRow(sqlite3_stmt* stmt, const StatementColumns& cols) {
  // Convert one SQL artifact row into ArtifactLog row shape.
  const int64_t id = getIntOr(stmt, cols, {"ID"});
  if (id <= 0) return std::nullopt;

  const auto ascend = buildAscendStat(stmt, cols);
  json row = {
    {"id", id},
    {"revision", getIntOr(stmt, cols, {"revision", "Revision"})},
    {"sellPrice", getIntOr(stmt, cols, {"sellPrice", "SellPrice"})},
    {"price", getIntOr(stmt, cols, {"price"})},
    {"level", getIntOr(stmt, cols, {"lvl"})},
    {"upgradeTimeTicks", nullptr},
    {"ascendLevel", getIntOr(stmt, cols, {"ASCLEVEL"})},
    {"rerollsCount", getIntOr(stmt, cols, {"REROLLCOUNT"})},
    {"ascendRerollsCount", nullptr},
    {"kindId", getIntOr(stmt, cols, {"type"})},
    {"rankId", getIntOr(stmt, cols, {"rank"})},
    {"rarityId", getIntOr(stmt, cols, {"rarity"})},
    {"setKindId", getIntOr(stmt, cols, {"aset"})},
    {"requiredFraction", getIntOr(stmt, cols, {"accset"})},
    {"failedUpgrades", 0},
    {"isActivated", true},
    {"isSeen", true},
    {"readOnly", false},
    {"primary", buildPrimaryStat(stmt, cols)},
    {"ascend", ascend.has_value() ? ascend.value() : json(nullptr)},
    {"secondary", buildSecondaryStats(stmt, cols)}
  };
  return row;
}

static json readArtifactTable(sqlite3* db, const std::string& tableName, std::unordered_map<int64_t, std::unordered_map<std::string, int64_t>>* byHero) {
  // Read Artifacts/InboxArtifacts and convert each row into ArtifactLog shape.
  json rows = json::array();
  if (!tableExists(db, tableName)) return rows;

  sqlite3_stmt* stmt = nullptr;
  const std::string sql = "SELECT * FROM \"" + tableName + "\"";
  if (sqlite3_prepare_v2(db, sql.c_str(), -1, &stmt, nullptr) != SQLITE_OK) {
    return rows;
  }

  StatementColumns cols = buildColumns(stmt);
  while (sqlite3_step(stmt) == SQLITE_ROW) {
    const auto converted = convertArtifactRow(stmt, cols);
    if (!converted.has_value()) continue;
    rows.push_back(converted.value());

    // Build hero->slot->artifact map from equipped artifacts only.
    if (byHero != nullptr) {
      const int64_t heroId = getIntOr(stmt, cols, {"cID"});
      const int64_t slotId = getIntOr(stmt, cols, {"type"});
      const int64_t artifactId = getIntOr(stmt, cols, {"ID"});
      if (heroId > 0 && slotId > 0 && artifactId > 0) {
        (*byHero)[heroId][std::to_string(slotId)] = artifactId;
      }
    }
  }
  sqlite3_finalize(stmt);
  return rows;
}

static json readChampions(sqlite3* db) {
  // Read Champs table into the expected champion payload rows.
  json champions = json::array();
  if (!tableExists(db, "Champs")) return champions;

  sqlite3_stmt* stmt = nullptr;
  if (sqlite3_prepare_v2(db, "SELECT * FROM Champs", -1, &stmt, nullptr) != SQLITE_OK) {
    return champions;
  }

  StatementColumns cols = buildColumns(stmt);
  while (sqlite3_step(stmt) == SQLITE_ROW) {
    const int64_t id = getIntOr(stmt, cols, {"ID"});
    if (id <= 0) continue;
    champions.push_back({
      {"ID", id},
      {"Name", getText(stmt, cols, {"Name"}).value_or(std::string())},
      {"Vault", getIntOr(stmt, cols, {"Vault"})},
      {"RVault", getIntOr(stmt, cols, {"RVault"})},
      {"BaseHeroID", getIntOr(stmt, cols, {"BaseHeroID"})},
      {"Rarity", getIntOr(stmt, cols, {"Rarity"})}
    });
  }
  sqlite3_finalize(stmt);
  return champions;
}

static json readLastUsed(sqlite3* db) {
  // Read LastUsedArtifacts into expected id/lastUse rows.
  json entries = json::array();
  if (!tableExists(db, "LastUsedArtifacts")) return entries;

  sqlite3_stmt* stmt = nullptr;
  if (sqlite3_prepare_v2(db, "SELECT * FROM LastUsedArtifacts", -1, &stmt, nullptr) != SQLITE_OK) {
    return entries;
  }

  StatementColumns cols = buildColumns(stmt);
  while (sqlite3_step(stmt) == SQLITE_ROW) {
    const int64_t id = getIntOr(stmt, cols, {"id", "ID"});
    if (id <= 0) continue;

    // Keep sqlite REAL timestamps as numbers and TEXT timestamps as strings.
    const auto asText = getText(stmt, cols, {"lastUse", "lastuse"});
    const auto asNumber = getDouble(stmt, cols, {"lastUse", "lastuse"});

    json row = {
      {"id", id}
    };
    if (asText.has_value()) {
      row["lastUse"] = asText.value();
    } else if (asNumber.has_value()) {
      row["lastUse"] = asNumber.value();
    } else {
      row["lastUse"] = nullptr;
    }
    entries.push_back(row);
  }
  sqlite3_finalize(stmt);
  return entries;
}

static std::optional<json> buildArtifactLogSnapshotFromSqlite(const fs::path& dbPath, const std::string& snapshotId) {
  // Open sqlite read-only to avoid locking side-effects on Helper writes.
  sqlite3* rawDb = nullptr;
  if (sqlite3_open_v2(dbPath.string().c_str(), &rawDb, SQLITE_OPEN_READONLY, nullptr) != SQLITE_OK) {
    if (rawDb != nullptr) sqlite3_close(rawDb);
    return std::nullopt;
  }

  // Ensure sqlite handle gets closed on every exit path.
  std::unique_ptr<sqlite3, std::function<void(sqlite3*)>> db(rawDb, [](sqlite3* ptr) {
    if (ptr != nullptr) sqlite3_close(ptr);
  });

  // Build hero mapping while reading main artifacts table.
  std::unordered_map<int64_t, std::unordered_map<std::string, int64_t>> byHeroMap;
  const json artifactLog = readArtifactTable(db.get(), "Artifacts", &byHeroMap);
  const json inboxArtifactLog = readArtifactTable(db.get(), "InboxArtifacts", nullptr);
  const json champions = readChampions(db.get());
  const json lastUsed = readLastUsed(db.get());

  // Convert hero map into JSON object using string keys like sample file.
  json artifactByHero = json::object();
  for (const auto& [heroId, slotMap] : byHeroMap) {
    json slots = json::object();
    for (const auto& [slotId, artifactId] : slotMap) {
      slots[slotId] = artifactId;
    }
    artifactByHero[std::to_string(heroId)] = slots;
  }

  // Emit payload shape consumed by new artifactLogSnapshot pathway.
  json payload = {
    {"snapshotId", snapshotId},
    {"payloadVersion", 1},
    {"artifactLog", artifactLog},
    {"artifactByHeroIDLog", artifactByHero},
    {"inboxArtifactLog", inboxArtifactLog},
    {"champions", champions},
    {"lastUsed", lastUsed}
  };

  return payload;
}

#if !defined(_WIN32)
class ScopedRawStdinMode {
public:
  ScopedRawStdinMode() {
    // Only switch to raw mode when stdin is an interactive terminal.
    if (!isatty(STDIN_FILENO)) return;
    if (tcgetattr(STDIN_FILENO, &original_) != 0) return;

    termios raw = original_;
    raw.c_lflag &= static_cast<tcflag_t>(~(ICANON | ECHO));
    raw.c_cc[VMIN] = 0;
    raw.c_cc[VTIME] = 0;
    if (tcsetattr(STDIN_FILENO, TCSANOW, &raw) != 0) return;

    active_ = true;
  }

  ~ScopedRawStdinMode() {
    // Restore terminal mode so shell input remains usable after exit.
    if (!active_) return;
    tcsetattr(STDIN_FILENO, TCSANOW, &original_);
  }

  bool active() const { return active_; }

private:
  bool active_ = false;
  termios original_{};
};
#endif

class WatcherServer {
public:
  explicit WatcherServer(AppConfig config)
    : config_(std::move(config)) {}

  int run() {
    // Validate/normalize config before server startup.
    if (!initializeConfig()) return 1;

    // Wire websocket handlers and transport state.
    configureServer();

    // Start background DB watcher if enabled.
    startWatcherThread();
    startShortcutThread();

    // Print endpoint + launch URL for local troubleshooting.
    std::cout << "[cpp-watcher] endpoint: " << endpointUrl() << "\n";
    std::cout << "[cpp-watcher] launch URL: " << buildLaunchUrl() << "\n";

    // Mirror watcher helper behavior by opening the URL by default.
    if (config_.openBrowser) {
      const bool launched = openLaunchUrl(buildLaunchUrl());
      if (!launched) {
        std::cerr << "[cpp-watcher] browser launch failed; open URL manually\n";
      }
    }

    // Run websocket accept loop until process exits.
    try {
      server_.listen(config_.port);
      server_.start_accept();
      server_.run();
    } catch (const std::exception& ex) {
      std::cerr << "[cpp-watcher] server error: " << ex.what() << "\n";
      stop();
      return 1;
    }

    // Join background resources on graceful exit.
    stop();
    return 0;
  }

private:
  bool initializeConfig() {
    // Keep app entry explicit so launch URL construction is deterministic.
    if (config_.appEntryPath.empty()) {
      std::cerr << "[cpp-watcher] --app-entry-path is required\n";
      return false;
    }

    // Resolve app entry path once to avoid relative path ambiguity.
    std::error_code ec;
    config_.appEntryPath = fs::weakly_canonical(config_.appEntryPath, ec);
    if (ec || !fs::exists(config_.appEntryPath)) {
      std::cerr << "[cpp-watcher] app entry not found: " << config_.appEntryPath << "\n";
      return false;
    }

    // Populate default DB watch path from APPDATA when omitted.
    if (config_.gearDbPath.empty()) {
      const char* appData = std::getenv("APPDATA");
      if (appData != nullptr && std::strlen(appData) > 0) {
        config_.gearDbPath = fs::path(appData) / "RslHelper" / "Config";
      }
    }

    // Normalize protocol token for deterministic comparisons.
    config_.protocol = toLower(config_.protocol);
    if (config_.protocol != kProtocolHelper && config_.protocol != kProtocolJsonRpc) {
      std::cerr << "[cpp-watcher] unsupported protocol: " << config_.protocol << "\n";
      return false;
    }

    return true;
  }

  void configureServer() {
    // Use explicit structured logs instead of websocketpp channels.
    server_.clear_access_channels(websocketpp::log::alevel::all);
    server_.clear_error_channels(websocketpp::log::elevel::all);
    server_.init_asio();

    // Add client + replay latest converted snapshot payload.
    server_.set_open_handler([this](ConnectionHdl hdl) {
      std::lock_guard<std::mutex> lock(mutex_);
      clients_.insert(hdl);
      std::cout << "[cpp-watcher] client connected\n";
      if (lastSnapshot_.has_value()) {
        sendSnapshotToClient(hdl, lastSnapshot_.value().payload);
      }
    });

    // Remove disconnected clients from broadcast set.
    server_.set_close_handler([this](ConnectionHdl hdl) {
      std::lock_guard<std::mutex> lock(mutex_);
      clients_.erase(hdl);
      std::cout << "[cpp-watcher] client disconnected\n";
    });

    // Parse inbound text frames for uploadSellfile requests.
    server_.set_message_handler([this](ConnectionHdl hdl, WsServer::message_ptr msg) {
      if (msg->get_opcode() != websocketpp::frame::opcode::text) return;
      handleTextMessage(hdl, msg->get_payload());
    });
  }

  void startWatcherThread() {
    // Skip DB thread when watcher toggle is disabled.
    if (!config_.watchGearDb) return;

    // Poll file system and broadcast converted snapshots on changes.
    watchThread_ = std::thread([this]() {
      while (!stopRequested_.load(std::memory_order_relaxed)) {
        tryWatchAndBroadcastSnapshot();
        std::this_thread::sleep_for(kWatchPollInterval);
      }
    });
  }

  void startShortcutThread() {
    // Run keyboard shortcuts on a dedicated thread so WS handling stays responsive.
    shortcutThread_ = std::thread([this]() {
      runShortcutLoop();
    });
  }

  void runShortcutLoop() {
    // Advertise local console shortcuts used for quick protocol checks.
    std::cout << "[cpp-watcher] shortcuts: [R] queue sample selectRule, [F] force DB snapshot\n";

#if defined(_WIN32)
    while (!stopRequested_.load(std::memory_order_relaxed)) {
      if (_kbhit() != 0) {
        const int key = _getch();
        handleShortcutKey(static_cast<char>(key));
      }
      std::this_thread::sleep_for(std::chrono::milliseconds(50));
    }
#else
    ScopedRawStdinMode stdinMode;
    if (!stdinMode.active()) {
      std::cout << "[cpp-watcher] stdin is not interactive; shortcuts disabled\n";
      return;
    }

    while (!stopRequested_.load(std::memory_order_relaxed)) {
      fd_set readSet;
      FD_ZERO(&readSet);
      FD_SET(STDIN_FILENO, &readSet);

      timeval timeout{};
      timeout.tv_sec = 0;
      timeout.tv_usec = 50 * 1000;

      const int rc = select(STDIN_FILENO + 1, &readSet, nullptr, nullptr, &timeout);
      if (rc <= 0) continue;
      if (!FD_ISSET(STDIN_FILENO, &readSet)) continue;

      char key = '\0';
      if (read(STDIN_FILENO, &key, 1) == 1) {
        handleShortcutKey(key);
      }
    }
#endif
  }

  void handleShortcutKey(char rawKey) {
    // Normalize key presses so uppercase/lowercase shortcuts behave the same.
    const char key = static_cast<char>(std::tolower(static_cast<unsigned char>(rawKey)));
    if (key == 'r') {
      queueSampleSelectRule();
      return;
    }
    if (key == 'f') {
      requestForcedSnapshot();
    }
  }

  void queueSampleSelectRule() {
    // Reuse a deterministic sample list so repeated presses are predictable.
    static const std::vector<int> kSampleRows{5, 10, 15, 20, 25, 30, 35, 40};
    const uint64_t seq = selectRuleSequence_.fetch_add(1, std::memory_order_relaxed);
    const int rowNumber = kSampleRows[seq % kSampleRows.size()];

    {
      std::lock_guard<std::mutex> lock(mutex_);
      for (const auto& hdl : clients_) {
        sendSelectRuleToClient(hdl, rowNumber);
      }
    }

    std::cout << "[cpp-watcher] shortcut R -> queued selectRule row " << rowNumber << "\n";
  }

  void requestForcedSnapshot() {
    // Flag next watcher pass to rebroadcast the current DB state even if unchanged.
    if (!config_.watchGearDb) {
      std::cout << "[cpp-watcher] shortcut F ignored; --watch-gear-db is disabled\n";
      return;
    }
    forceSnapshotRequested_.store(true, std::memory_order_relaxed);
    std::cout << "[cpp-watcher] shortcut F -> forcing artifactLogSnapshot refresh\n";
  }

  void stop() {
    // Signal loops once, then stop socket listener.
    const bool alreadyStopped = stopRequested_.exchange(true);
    if (!alreadyStopped) {
      std::error_code ec;
      server_.stop_listening(ec);
      server_.stop();
    }

    // Join watcher thread after stop signal.
    if (watchThread_.joinable()) {
      watchThread_.join();
    }
    if (shortcutThread_.joinable()) {
      shortcutThread_.join();
    }
  }

  std::string endpointUrl() const {
    // Keep endpoint host fixed to localhost for local tooling flows.
    std::ostringstream out;
    out << "ws://127.0.0.1:" << config_.port << "/";
    return out.str();
  }

  std::string buildLaunchUrl() const {
    // Build file URL and append endpoint query parameter.
    std::ostringstream out;
    out << "file:///";
    std::string path = config_.appEntryPath.generic_string();
    if (!path.empty() && path.front() == '/') {
      path.erase(path.begin());
    }
    out << path << "?endpoint=" << endpointUrl();
    return out.str();
  }

  bool openLaunchUrl(const std::string& url) const {
    // Dispatch URL to platform-specific default browser opener.
#if defined(_WIN32)
    const std::string cmd = "start \"\" \"" + url + "\"";
#elif defined(__APPLE__)
    const std::string cmd = "open \"" + url + "\"";
#else
    const std::string cmd = "xdg-open \"" + url + "\"";
#endif
    return std::system(cmd.c_str()) == 0;
  }

  void handleTextMessage(ConnectionHdl hdl, const std::string& payloadText) {
    // Parse JSON safely and ignore malformed payloads.
    json message;
    try {
      message = json::parse(payloadText);
    } catch (...) {
      std::cerr << "[cpp-watcher] ignored malformed JSON frame\n";
      return;
    }

    // Dispatch inbound request by configured protocol mode.
    if (config_.protocol == kProtocolHelper) {
      handleHelperRequest(hdl, message);
      return;
    }
    handleJsonRpcRequest(hdl, message);
  }

  void handleHelperRequest(ConnectionHdl hdl, const json& message) {
    // Accept only helper request envelopes.
    if (!message.is_object()) return;
    if (message.value("type", "") != "req") return;
    if (message.value("cmd", "") != kUploadSellfileMethod) return;

    // Validate payload fields before disk write.
    const json payload = message.value("payload", json::object());
    const std::string data = payload.value("data", "");
    const std::string requestedName = payload.value("name", "");
    const int id = message.value("id", 0);

    if (data.empty()) {
      sendHelperResponse(hdl, id, false, "Missing data", json::object());
      return;
    }

    const auto saved = saveSellfilePayload(data, requestedName);
    if (!saved.has_value()) {
      sendHelperResponse(hdl, id, false, "Failed to save", json::object());
      return;
    }

    sendHelperResponse(hdl, id, true, "", json{{"savedAs", saved.value()}});
  }

  void handleJsonRpcRequest(ConnectionHdl hdl, const json& message) {
    // Accept only JSON-RPC uploadSellfile requests.
    if (!message.is_object()) return;
    if (message.value("jsonrpc", "") != "2.0") return;
    if (message.value("method", "") != kUploadSellfileMethod) return;

    // Validate params before write.
    const json params = message.value("params", json::object());
    const std::string data = params.value("data", "");
    const std::string requestedName = params.value("name", "");
    const int id = message.value("id", 0);

    if (data.empty()) {
      sendJsonRpcError(hdl, id, -32602, "Invalid params");
      return;
    }

    const auto saved = saveSellfilePayload(data, requestedName);
    if (!saved.has_value()) {
      sendJsonRpcError(hdl, id, -32603, "Internal error");
      return;
    }

    sendJsonRpcResult(hdl, id, json{{"ok", true}, {"savedAs", saved.value()}});
  }

  void sendHelperResponse(ConnectionHdl hdl, int id, bool ok, const std::string& error, const json& payload) {
    // Build helper response with optional error field.
    json response = {
      {"id", id},
      {"type", "res"},
      {"ok", ok},
      {"payload", payload}
    };
    if (!error.empty()) response["error"] = error;

    std::error_code ec;
    server_.send(hdl, response.dump(), websocketpp::frame::opcode::text, ec);
  }

  void sendJsonRpcResult(ConnectionHdl hdl, int id, const json& result) {
    // Build JSON-RPC success response envelope.
    json response = {
      {"jsonrpc", "2.0"},
      {"id", id},
      {"result", result}
    };

    std::error_code ec;
    server_.send(hdl, response.dump(), websocketpp::frame::opcode::text, ec);
  }

  void sendJsonRpcError(ConnectionHdl hdl, int id, int code, const std::string& message) {
    // Build JSON-RPC error response envelope.
    json response = {
      {"jsonrpc", "2.0"},
      {"id", id},
      {"error", {{"code", code}, {"message", message}}}
    };

    std::error_code ec;
    server_.send(hdl, response.dump(), websocketpp::frame::opcode::text, ec);
  }

  std::optional<std::string> saveSellfilePayload(const std::string& data, const std::string& requestedName) {
    // Resolve output directory from configured path.
    fs::path output = config_.outputPath;
    fs::path dir = output.parent_path();
    if (dir.empty()) dir = fs::current_path();

    // Use requested filename when provided.
    fs::path fileName = output.filename();
    if (!requestedName.empty()) {
      fileName = sanitizeRequestedName(requestedName);
    }

    std::error_code ec;
    fs::create_directories(dir, ec);
    if (ec) return std::nullopt;

    const fs::path target = dir / fileName;
    std::ofstream out(target, std::ios::binary | std::ios::trunc);
    if (!out.is_open()) return std::nullopt;
    out.write(data.data(), static_cast<std::streamsize>(data.size()));
    out.close();

    std::cout << "[cpp-watcher] saved sellfile: " << target << "\n";
    return target.filename().string();
  }

  fs::path sanitizeRequestedName(const std::string& requested) const {
    // Replace unsupported filename chars with '-'.
    std::string safe;
    safe.reserve(requested.size());
    for (const char ch : requested) {
      const bool ok = std::isalnum(static_cast<unsigned char>(ch)) || ch == '_' || ch == '-' || ch == '.';
      safe.push_back(ok ? ch : '-');
    }

    // Keep .hsf extension parity with watcher behavior.
    if (safe.size() < 4 || safe.substr(safe.size() - 4) != ".hsf") {
      safe += ".hsf";
    }
    return fs::path(safe);
  }

  void tryWatchAndBroadcastSnapshot() {
    // Skip watcher work when DB path is unresolved.
    if (config_.gearDbPath.empty()) return;

    const fs::path dbFile = resolveDbFilePath();
    if (dbFile.empty()) return;

    // Require file to exist and be stable before read.
    std::error_code ec;
    if (!fs::exists(dbFile, ec) || ec) return;

    const auto size = fs::file_size(dbFile, ec);
    if (ec) return;
    const auto writeTime = fs::last_write_time(dbFile, ec);
    if (ec) return;

    const auto now = fs::file_time_type::clock::now();
    if ((now - writeTime) < kMinStableFileAge) return;

    // Signature guards against duplicate conversion + broadcasts.
    std::ostringstream sig;
    sig << size << ":" << writeTime.time_since_epoch().count();
    const std::string signature = sig.str();
    const bool forceSnapshot = forceSnapshotRequested_.exchange(false, std::memory_order_relaxed);
    if (lastSignature_ == signature && !forceSnapshot) return;

    // Convert SQL tables into new artifactLogSnapshot payload shape.
    const std::string snapshotId = dbFile.filename().string() + ":" + signature;
    const auto converted = buildArtifactLogSnapshotFromSqlite(dbFile, snapshotId);
    if (!converted.has_value()) {
      return;
    }

    SnapshotCache cache{converted.value(), signature};

    {
      std::lock_guard<std::mutex> lock(mutex_);
      lastSnapshot_ = cache;
      // Broadcast converted payload to every connected client.
      for (const auto& hdl : clients_) {
        sendSnapshotToClient(hdl, cache.payload);
      }
    }

    lastSignature_ = signature;
    std::cout << "[cpp-watcher] queued artifactLogSnapshot from " << dbFile
              << " (artifacts=" << converted->value("artifactLog", json::array()).size()
              << ", inbox=" << converted->value("inboxArtifactLog", json::array()).size()
              << (forceSnapshot ? ", forced=1" : ", forced=0")
              << ")\n";
  }

  fs::path resolveDbFilePath() const {
    // Accept either a direct .db file or a containing directory.
    std::error_code ec;
    if (fs::is_regular_file(config_.gearDbPath, ec)) return config_.gearDbPath;
    if (ec) return {};

    if (!fs::is_directory(config_.gearDbPath, ec) || ec) return {};

    // Pick newest .db in the folder to mirror watcher intent.
    fs::path newest;
    fs::file_time_type newestTime;
    bool hasCandidate = false;

    for (const auto& entry : fs::directory_iterator(config_.gearDbPath, ec)) {
      if (ec) break;
      if (!entry.is_regular_file()) continue;
      if (toLower(entry.path().extension().string()) != ".db") continue;
      const auto t = entry.last_write_time(ec);
      if (ec) continue;
      if (!hasCandidate || t > newestTime) {
        newest = entry.path();
        newestTime = t;
        hasCandidate = true;
      }
    }

    return hasCandidate ? newest : fs::path{};
  }

  void sendSnapshotToClient(ConnectionHdl hdl, const json& payload) {
    // Emit helper or JSON-RPC event envelope around converted payload.
    json envelope;
    if (config_.protocol == kProtocolHelper) {
      envelope = {
        {"type", "evt"},
        {"name", kArtifactLogSnapshotEvent},
        {"payload", payload}
      };
    } else {
      envelope = {
        {"jsonrpc", "2.0"},
        {"method", kArtifactLogSnapshotEvent},
        {"params", payload}
      };
    }

    std::error_code ec;
    server_.send(hdl, envelope.dump(), websocketpp::frame::opcode::text, ec);
  }

  void sendSelectRuleToClient(ConnectionHdl hdl, int rowNumber) {
    // Emit selectRule in the same protocol mode as other outbound events.
    json envelope;
    if (config_.protocol == kProtocolHelper) {
      envelope = {
        {"type", "evt"},
        {"name", "selectRule"},
        {"payload", {{"rowNumber", rowNumber}}}
      };
    } else {
      envelope = {
        {"jsonrpc", "2.0"},
        {"method", "selectRule"},
        {"params", {{"rowNumber", rowNumber}}}
      };
    }

    std::error_code ec;
    server_.send(hdl, envelope.dump(), websocketpp::frame::opcode::text, ec);
  }

private:
  AppConfig config_;
  WsServer server_;
  std::atomic<bool> stopRequested_{false};
  std::atomic<bool> forceSnapshotRequested_{false};
  std::atomic<uint64_t> selectRuleSequence_{0};
  std::thread watchThread_;
  std::thread shortcutThread_;
  std::mutex mutex_;
  ClientSet clients_;
  std::optional<SnapshotCache> lastSnapshot_;
  std::string lastSignature_;
};

static void printUsage() {
  // Keep usage compact and focused on the supported CLI flags.
  std::cout
    << "cpp-watcher-example\n"
    << "  --app-entry-path <path>   (required)\n"
    << "  [--port <int>]            (default 8765)\n"
    << "  [--output-path <path>]    (default exported-sellfile.hsf)\n"
    << "  [--gear-db-path <path>]   (default %APPDATA%/RslHelper/Config)\n"
    << "  [--watch-gear-db 0|1]     (default 1)\n"
    << "  [--open-browser 0|1]      (default 1)\n"
    << "  [--protocol helper|jsonrpc] (default helper)\n";
}

static std::optional<AppConfig> parseArgs(int argc, char** argv) {
  // Start with defaults, then apply CLI overrides.
  AppConfig cfg;

  for (int i = 1; i < argc; ++i) {
    const std::string arg = argv[i];

    // Print usage and exit for help switch.
    if (arg == "--help" || arg == "-h") {
      printUsage();
      return std::nullopt;
    }

    // Validate that key/value switches include a value token.
    auto requireValue = [&](const std::string& key) -> std::optional<std::string> {
      if (i + 1 >= argc) {
        std::cerr << "missing value for " << key << "\n";
        return std::nullopt;
      }
      ++i;
      return std::string(argv[i]);
    };

    if (arg == "--port") {
      const auto v = requireValue(arg);
      if (!v.has_value()) return std::nullopt;
      cfg.port = std::stoi(v.value());
      continue;
    }
    if (arg == "--app-entry-path") {
      const auto v = requireValue(arg);
      if (!v.has_value()) return std::nullopt;
      cfg.appEntryPath = fs::path(v.value());
      continue;
    }
    if (arg == "--output-path") {
      const auto v = requireValue(arg);
      if (!v.has_value()) return std::nullopt;
      cfg.outputPath = fs::path(v.value());
      continue;
    }
    if (arg == "--gear-db-path") {
      const auto v = requireValue(arg);
      if (!v.has_value()) return std::nullopt;
      cfg.gearDbPath = fs::path(v.value());
      continue;
    }
    if (arg == "--watch-gear-db") {
      const auto v = requireValue(arg);
      if (!v.has_value()) return std::nullopt;
      cfg.watchGearDb = (v.value() == "1" || v.value() == "true" || v.value() == "on");
      continue;
    }
    if (arg == "--open-browser") {
      const auto v = requireValue(arg);
      if (!v.has_value()) return std::nullopt;
      cfg.openBrowser = (v.value() == "1" || v.value() == "true" || v.value() == "on");
      continue;
    }
    if (arg == "--protocol") {
      const auto v = requireValue(arg);
      if (!v.has_value()) return std::nullopt;
      cfg.protocol = v.value();
      continue;
    }

    std::cerr << "unknown argument: " << arg << "\n";
    return std::nullopt;
  }

  // Require app entry path so launch URL is deterministic.
  if (cfg.appEntryPath.empty()) {
    std::cerr << "--app-entry-path is required\n";
    return std::nullopt;
  }

  return cfg;
}

int main(int argc, char** argv) {
  // Parse CLI and return non-zero on usage error.
  const auto maybeConfig = parseArgs(argc, argv);
  if (!maybeConfig.has_value()) {
    return 1;
  }

  // Construct watcher server and run until shutdown.
  WatcherServer watcher(maybeConfig.value());
  return watcher.run();
}
