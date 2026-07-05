/*
 * rule_engine_native — C/C++ integration example and smoke test.
 *
 * Loads the DLL at runtime, calls sfc_generate with a hardcoded NativeInput,
 * validates the output, and exits 0 on success / 1 on any failure.
 * Suitable as a CI sanity test on both Linux (debug .so) and Windows (.dll).
 *
 * Build & run — Linux/WSL (debug .so), from wasm/rule_engine_native/example/:
 *   make run                         # builds the .so and the binary, then runs
 * or manually, from the repo root:
 *   cargo build -p rule_engine_native
 *   g++ wasm/rule_engine_native/example/main.cpp -o wasm/rule_engine_native/example/run_example -ldl
 *   wasm/rule_engine_native/example/run_example wasm/target/debug/librule_engine_native.so
 *
 * Build & run — Windows release .dll (Developer Command Prompt), from the repo root:
 *   cargo build --release --target x86_64-pc-windows-msvc -p rule_engine_native
 *   cl /EHsc wasm\rule_engine_native\example\main.cpp /Fe:run_example.exe
 *   run_example.exe wasm\target\x86_64-pc-windows-msvc\release\rule_engine_native.dll
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

typedef char* (*SfcGenerateFn)(const char*);
typedef void  (*SfcFreeFn)(char*);

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

/* Two artifacts in the RAW RSL-Helper wire shape (kindId/rankId/primary/secondary) —
 * exactly what RSL Helper pipes in. #1 matches (5★ Epic with SPD), #2 does not.
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
    "    \"secondary\": [ { \"id\": 4, \"level\": 4, \"isAbsolute\": 1 } ]"  /* SPD */
    "  },"
    "  {"
    "    \"id\": 1002,"
    "    \"kindId\": 2,"    /* Helmet */
    "    \"rankId\": 4,"
    "    \"rarityId\": 3,"  /* Rare */
    "    \"level\": 0,"
    "    \"setKindId\": 5,"
    "    \"primary\": { \"id\": 2, \"isAbsolute\": 0 },"
    "    \"secondary\": [ { \"id\": 2, \"level\": 1, \"isAbsolute\": 0 } ]"
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
    const char* dll_path = argc > 1 ? argv[1] : ".\\rule_engine_native.dll";
#else
    const char* dll_path = argc > 1 ? argv[1] : "./librule_engine_native.so";
#endif

    printf("[example] Loading DLL: %s\n", dll_path);
    DllHandle lib = DLL_OPEN(dll_path);
    if (!lib) {
        fprintf(stderr, "[example] FAIL: could not load DLL: %s\n", dll_error().c_str());
        return 1;
    }

    /* Resolve entry points. */
    auto sfc_generate = reinterpret_cast<SfcGenerateFn>(DLL_SYM(lib, "sfc_generate"));
    auto sfc_free_fn  = reinterpret_cast<SfcFreeFn>(DLL_SYM(lib, "sfc_free"));
    if (!sfc_generate || !sfc_free_fn) {
        fprintf(stderr, "[example] FAIL: could not resolve symbols: %s\n", dll_error().c_str());
        DLL_CLOSE(lib);
        return 1;
    }
    printf("[example] Symbols resolved.\n");

    /* Build and call. */
    std::string input_json = build_input();
    printf("[example] Calling sfc_generate (%zu bytes)...\n", input_json.size());
    char* output = sfc_generate(input_json.c_str());
    if (!output) {
        fprintf(stderr, "[example] FAIL: sfc_generate returned NULL\n");
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
