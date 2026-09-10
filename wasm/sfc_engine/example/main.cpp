/*
 * sfc_engine — C/C++ integration example and smoke test.
 *
 * Loads the DLL at runtime, calls sfc_version and sfc_decide with a hardcoded input,
 * validates the output, and exits 0 on success / 1 on any failure.
 * Suitable as a CI sanity test on both Linux (debug .so) and Windows (.dll).
 *
 * Build & run — Linux/WSL (debug .so), from wasm/sfc_engine/example/:
 *   make run                         # builds the .so and the binary, then runs
 * or manually, from the repo root:
 *   cargo build -p sfc_engine
 *   g++ wasm/sfc_engine/example/main.cpp -o wasm/sfc_engine/example/run_example -ldl
 *   wasm/sfc_engine/example/run_example wasm/target/debug/libsfc_engine.so
 *
 * Build & run — Windows release .dll (Developer Command Prompt), from the repo root:
 *   npm run sfc-engine:build
 *   cl /EHsc wasm\sfc_engine\example\main.cpp /Fe:run_example.exe
 *   run_example.exe wasm\target\x86_64-pc-windows-msvc\release\sfc_engine.dll
 */

#include <cstdio>
#include <cstring>
#include <cstdlib>
#include <string>

/* Platform-agnostic DLL loading */
#ifdef _WIN32
  #include <windows.h>
  #define DLL_OPEN(path)     LoadLibraryA(path)
  #define DLL_SYM(lib, name) GetProcAddress((HMODULE)(lib), name)
  #define DLL_CLOSE(lib)     FreeLibrary((HMODULE)(lib))
  typedef HMODULE DllHandle;
  static std::string dll_error() {
      DWORD code = GetLastError();
      char buf[256] = {};
      FormatMessageA(FORMAT_MESSAGE_FROM_SYSTEM, nullptr, code, 0, buf, sizeof(buf), nullptr);
      return std::string(buf);
  }
#else
  #include <dlfcn.h>
  #define DLL_OPEN(path)     dlopen(path, RTLD_LAZY)
  #define DLL_SYM(lib, name) dlsym(lib, name)
  #define DLL_CLOSE(lib)     dlclose(lib)
  typedef void* DllHandle;
  static std::string dll_error() { const char* e = dlerror(); return e ? e : "(unknown)"; }
#endif

typedef char* (*SfcDecideFn)(const char*);
typedef void  (*SfcFreeFn)(char*);
typedef char* (*SfcVersionFn)(void);

/* Minimal JSON helpers — avoids a JSON library dependency. */
static bool json_has_key(const std::string& json, const char* key) {
    std::string needle = std::string("\"") + key + "\"";
    return json.find(needle) != std::string::npos;
}

static bool json_array_nonempty(const std::string& json, const char* key) {
    std::string needle = std::string("\"") + key + "\"";
    size_t pos = json.find(needle);
    if (pos == std::string::npos) return false;
    /* Scan forward past ':' and whitespace to find '[' */
    pos = json.find('[', pos + needle.size());
    if (pos == std::string::npos) return false;
    /* If the next non-space character after '[' is ']' the array is empty. */
    for (size_t i = pos + 1; i < json.size(); ++i) {
        if (json[i] == ' ' || json[i] == '\n' || json[i] == '\r' || json[i] == '\t') continue;
        return json[i] != ']';
    }
    return false;
}

/* ─── NativeInput — embedded test payload ─────────────────────────────────── */

/* SFC: one "keep 5★ Epic with any SPD" recipe, safeguards disabled. */
static const char* SFC_CONTENT =
    "{"
    "  \"Version\": \"1.0\","
    "  \"Recipes\": ["
    "    {"
    "      \"keep\": true,"
    "      \"Rank\": \"5\\u2605\","          /* 5★ */
    "      \"Rarity\": \"Epic\","
    "      \"substats\": [\"SPD\"],"
    "      \"minCount\": 1"
    "    }"
    "  ],"
    "  \"Safeguards\": [],"
    "  \"SafeguardsEnabled\": false"
    "}";

/* Two artifacts in the RAW game wire shape (kindId/rankId/primary/secondary) —
 * exactly what a consumer pipes in. #1 matches (5★ Epic with SPD), #2 does not.
 * SPD is stat id 4, flat (isAbsolute=1). #1 is equipped by champion 5000 (see below). */
static const char* ARTIFACT_ARRAY =
    "["
    "  {"
    "    \"id\": 1001,"
    "    \"kindId\": 1,"    /* Weapon */
    "    \"rankId\": 5,"
    "    \"rarityId\": 4,"  /* Epic */
    "    \"level\": 16,"
    "    \"setKindId\": 10,"
    "    \"primary\": { \"id\": 1, \"isAbsolute\": 0 },"
    "    \"secondary\": [ { \"id\": 4, \"level\": 4, \"isAbsolute\": 1, \"statValue\": 90194313216 } ]"  /* SPD 21 (32.32 fixed point) */
    "  },"
    "  {"
    "    \"id\": 1002,"
    "    \"kindId\": 2,"    /* Helmet */
    "    \"rankId\": 4,"
    "    \"rarityId\": 3,"  /* Rare */
    "    \"level\": 0,"
    "    \"setKindId\": 5,"
    "    \"primary\": { \"id\": 2, \"isAbsolute\": 0 },"
    "    \"secondary\": [ { \"id\": 2, \"level\": 1, \"isAbsolute\": 0, \"statValue\": 4294967296 } ]"  /* ATK% 1.0 */
    "  }"
    "]";

/* Raw champions array — champion 5000 equips artifact 1001 in slot 1 (the DLL inverts
 * this to fill cID / equipped_in_collection). Mirrors the separate `champions` packet. */
static const char* CHAMPION_ARRAY =
    "["
    "  { \"id\": 5000, \"artifacts\": { \"1\": 1001 } }"
    "]";

/* Build the outer NativeInput JSON, embedding the SFC as a JSON string value. */
static std::string build_input() {
    /* Escape the SFC string so it can be embedded as a JSON string value. */
    std::string sfc_escaped;
    sfc_escaped.reserve(512);
    for (const char* p = SFC_CONTENT; *p; ++p) {
        switch (*p) {
            case '"':  sfc_escaped += "\\\""; break;
            case '\\': sfc_escaped += "\\\\"; break;
            case '\n': sfc_escaped += "\\n";  break;
            case '\r': sfc_escaped += "\\r";  break;
            default:   sfc_escaped += *p;
        }
    }
    std::string result;
    result.reserve(1024);
    result += "{\"sfc\": \"";
    result += sfc_escaped;
    result += "\", \"artifacts\": ";
    result += ARTIFACT_ARRAY;
    result += ", \"champions\": ";
    result += CHAMPION_ARRAY;
    result += "}";
    return result;
}

/* ─── main ────────────────────────────────────────────────────────────────── */

int main(int argc, char* argv[]) {
    /* Accept optional DLL path argument; default to platform-appropriate name. */
#ifdef _WIN32
    const char* dll_path = argc > 1 ? argv[1] : ".\\sfc_engine.dll";
#else
    const char* dll_path = argc > 1 ? argv[1] : "./libsfc_engine.so";
#endif

    printf("[example] Loading DLL: %s\n", dll_path);
    DllHandle lib = DLL_OPEN(dll_path);
    if (!lib) {
        fprintf(stderr, "[example] FAIL: could not load DLL: %s\n", dll_error().c_str());
        return 1;
    }

    /* Resolve entry points. */
    auto sfc_decide     = reinterpret_cast<SfcDecideFn>(DLL_SYM(lib, "sfc_decide"));
    auto sfc_free_fn    = reinterpret_cast<SfcFreeFn>(DLL_SYM(lib, "sfc_free"));
    auto sfc_version_fn = reinterpret_cast<SfcVersionFn>(DLL_SYM(lib, "sfc_version"));
    if (!sfc_decide || !sfc_free_fn || !sfc_version_fn) {
        fprintf(stderr, "[example] FAIL: could not resolve symbols: %s\n", dll_error().c_str());
        DLL_CLOSE(lib);
        return 1;
    }
    printf("[example] Symbols resolved.\n");

    /* Version first: a consumer holding a prebuilt DLL checks this before trusting the
     * JSON shape, so the smoke test exercises the same order. */
    char* version_out = sfc_version_fn();
    if (!version_out) {
        fprintf(stderr, "[example] FAIL: sfc_version returned NULL\n");
        DLL_CLOSE(lib);
        return 1;
    }
    std::string version(version_out);
    sfc_free_fn(version_out);
    printf("[example] Version: %s\n", version.c_str());

    /* Build and call. */
    std::string input_json = build_input();
    printf("[example] Calling sfc_decide (%zu bytes)...\n", input_json.size());
    char* output = sfc_decide(input_json.c_str());
    if (!output) {
        fprintf(stderr, "[example] FAIL: sfc_decide returned NULL\n");
        DLL_CLOSE(lib);
        return 1;
    }
    std::string result(output);
    sfc_free_fn(output);
    DLL_CLOSE(lib);

    printf("[example] Output (%zu bytes): %.200s%s\n",
           result.size(), result.c_str(),
           result.size() > 200 ? "..." : "");

    /* ── Validation ─────────────────────────────────────────────────────── */
    int failures = 0;

#define CHECK(cond, msg) \
    do { if (!(cond)) { fprintf(stderr, "[example] FAIL: %s\n", msg); ++failures; } \
         else { printf("[example] OK: %s\n", msg); } } while(0)

    /* Must not contain "error" key. */
    CHECK(!json_has_key(result, "error"),
          "output must not contain an error key");

    /* The version must name both the crate and the JSON schema. */
    CHECK(json_has_key(version, "crate"), "sfc_version must report a crate version");
    CHECK(json_has_key(version, "schema"), "sfc_version must report a schema version");

    /* Verdicts are the point of the call: one per artifact supplied. */
    CHECK(json_has_key(result, "verdicts"),
          "output must contain a verdicts field");
    CHECK(json_array_nonempty(result, "verdicts"),
          "verdicts array must be non-empty");
    CHECK(result.find("\"artifactId\":1001") != std::string::npos,
          "the first artifact must receive a verdict");
    CHECK(result.find("\"artifactId\":1001,\"keep\":true,\"matched\":true") != std::string::npos,
          "the 5-star Epic with SPD must be MATCHED and kept by the keep recipe");

    /* Safeguard ranks are present as a field even when no safeguard is configured. */
    CHECK(json_has_key(result, "safeguardRanks"),
          "output must contain a safeguardRanks field");

    /* Must have a non-empty rules array. */
    CHECK(json_has_key(result, "rules"),
          "output must contain a rules field");
    CHECK(json_array_nonempty(result, "rules"),
          "rules array must be non-empty");

    /* Must have an improvementChances field (may be empty when safeguards are off). */
    CHECK(json_has_key(result, "improvementChances"),
          "output must contain an improvementChances field");

    /* At least one rule must have "Keep":true */
    CHECK(result.find("\"Keep\":true") != std::string::npos
          || result.find("\"keep\":true") != std::string::npos
          || result.find("\"Keep\": true") != std::string::npos
          || result.find("\"keep\": true") != std::string::npos,
          "at least one rule must have Keep=true");

#undef CHECK

    if (failures) {
        fprintf(stderr, "[example] %d validation check(s) failed.\n", failures);
        return 1;
    }
    printf("[example] All checks passed.\n");
    return 0;
}
