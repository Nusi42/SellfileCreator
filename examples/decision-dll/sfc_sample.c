/*
 * sfc_sample.c — a complete, working example of calling the decision library
 * from C on Windows.
 *
 * It loads the library, checks the version, asks for a decision on two pieces of
 * gear, prints the answers, and cleans up. Everything is plain C99 and the Windows
 * API - no other libraries needed.
 *
 * Build and run (from this folder):
 *
 *   build.bat
 *   sfc_sample.exe
 *
 * Or by hand, in a Developer Command Prompt:
 *
 *   cl /nologo sfc_sample.c
 *   sfc_sample.exe [path\to\the\dll]
 *
 * The library is loaded at run time, so your program keeps starting even when the
 * file is missing - you get a clear message instead of a failure to launch.
 */

#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <windows.h>

#include "sfc_decide.h"

/* The library file, if you do not pass a path on the command line. */
#define DEFAULT_LIBRARY_NAME "sfc_engine.dll"

/* The schema this example was written against. See sfc_version in the header. */
#define EXPECTED_SCHEMA_VERSION 1

/* The functions we call, as pointers we look up after loading the library. */
typedef char *(*sfc_decide_fn)(const char *);
typedef char *(*sfc_version_fn)(void);
typedef void (*sfc_free_fn)(char *);

/*
 * A sell file with one rule: keep 5-star Epic pieces that have a Speed substat.
 *
 * A real one comes from a file on disk - this is inline only to keep the example to a
 * single source file. Note the escaped quotes: the sell file is passed as a JSON
 * string value inside the request, so its own quotes are escaped.
 */
static const char *SELL_FILE =
    "{"
    "\\\"Version\\\": \\\"1.0\\\","
    "\\\"Recipes\\\": [{"
    "\\\"keep\\\": true,"
    "\\\"Rank\\\": \\\"5\\\\u2605\\\","
    "\\\"Rarity\\\": \\\"Epic\\\","
    "\\\"substats\\\": [\\\"SPD\\\"],"
    "\\\"minCount\\\": 1"
    "}],"
    "\\\"Safeguards\\\": [],"
    "\\\"SafeguardsEnabled\\\": false"
    "}";

/*
 * Two pieces of gear, exactly as the game reports them.
 *
 * The first is a 5-star Epic helmet with Speed, so the rule above keeps it. The second is
 * a 4-star Rare chestplate that no rule mentions.
 *
 * Note statValue: the game stores stats as fixed-point integers, where the number you
 * see in game is the stored value divided by 2^32. Pass the stored value through
 * unchanged - the library converts and rounds it the same way the app does. Converting
 * it yourself is the most common cause of a decision that disagrees with the app.
 * Here 90194313216 / 2^32 = 21, so this is a Speed 21 substat.
 */
static const char *GEAR =
    "["
    "{"
    "\"id\": 1001,"
    "\"kindId\": 1,"           /* which slot: 1 = helmet. See the table in sfc_decide.h -
                                  the weapon is 5, not 1. */
    "\"rankId\": 5,"           /* stars */
    "\"rarityId\": 4,"         /* 4 = Epic */
    "\"level\": 16,"
    "\"setKindId\": 10,"
    "\"primary\": { \"id\": 1, \"isAbsolute\": 0 },"
    "\"secondary\": [ { \"id\": 4, \"level\": 4, \"isAbsolute\": 1, \"statValue\": 90194313216 } ]"
    "},"
    "{"
    "\"id\": 1002,"
    "\"kindId\": 2,"           /* 2 = chestplate */
    "\"rankId\": 4,"
    "\"rarityId\": 3,"         /* 3 = Rare */
    "\"level\": 0,"
    "\"setKindId\": 5,"
    "\"primary\": { \"id\": 2, \"isAbsolute\": 0 },"
    "\"secondary\": [ { \"id\": 2, \"level\": 1, \"isAbsolute\": 0, \"statValue\": 4294967296 } ]"
    "}"
    "]";

/*
 * Who is wearing what. Optional, but worth sending: protection rules treat worn gear
 * differently, so leaving it out can change an answer. Champion 5000 wears piece 1001.
 */
static const char *CHAMPIONS =
    "[ { \"id\": 5000, \"artifacts\": { \"1\": 1001 } } ]";

/* Build the request object the library expects. Caller frees with free(). */
static char *build_request(void)
{
    /* Generous fixed buffer: the pieces above are known and small. A real program
     * building a request for a whole inventory should size this from the input. */
    size_t capacity = strlen(SELL_FILE) + strlen(GEAR) + strlen(CHAMPIONS) + 256;
    char *buffer = (char *)malloc(capacity);
    if (!buffer) {
        return NULL;
    }
    /* "rules": false — this example only reads decisions, and a real sell file compiles
     * to tens of thousands of rules. Ask for what you use. */
    _snprintf_s(buffer, capacity, _TRUNCATE,
                "{\"sfc\": \"%s\", \"artifacts\": %s, \"champions\": %s,"
                " \"rules\": false}",
                SELL_FILE, GEAR, CHAMPIONS);
    return buffer;
}

/*
 * Print one line per piece, in plain words.
 *
 * This walks the JSON with plain string searching to keep the example dependency-free.
 * Real code should use whatever JSON library it already has - the point here is which
 * fields to read and how the three of them combine, not this parsing.
 */
static void print_verdicts(const char *answer)
{
    const char *cursor = strstr(answer, "\"verdicts\"");
    int count = 0;

    if (!cursor) {
        printf("No verdicts in the answer.\n");
        return;
    }

    /* Each verdict object starts at an "artifactId" key. */
    while ((cursor = strstr(cursor, "\"artifactId\":")) != NULL) {
        long long id = 0;
        const char *object_end = NULL;
        int keep = 0, matched = 0, safeguarded = 0;
        size_t length = 0;
        char body[256];

        cursor += strlen("\"artifactId\":");
        id = _atoi64(cursor);

        /* Confine the flag search to this one object so we never read the next one. */
        object_end = strchr(cursor, '}');
        if (!object_end) {
            break;
        }

        length = (size_t)(object_end - cursor);
        if (length >= sizeof(body)) {
            length = sizeof(body) - 1;
        }
        memcpy(body, cursor, length);
        body[length] = '\0';

        keep = strstr(body, "\"keep\":true") != NULL;
        matched = strstr(body, "\"matched\":true") != NULL;
        safeguarded = strstr(body, "\"safeguarded\":true") != NULL;

        /* The three fields together are the whole answer for this piece. */
        if (!keep) {
            printf("  %lld  SELL  - a rule says to sell it\n", id);
        } else if (safeguarded) {
            printf("  %lld  KEEP  - a rule would sell it, but protection saved it\n", id);
        } else if (matched) {
            printf("  %lld  KEEP  - a rule says to keep it\n", id);
        } else {
            printf("  %lld  KEEP  - no rule mentions it, so it is kept by default\n", id);
        }

        ++count;
        cursor = object_end;
    }

    printf("\n%d piece(s) decided.\n", count);
}

/* Print the last Windows error in readable form. */
static void print_last_error(const char *what)
{
    DWORD code = GetLastError();
    char message[256] = { 0 };
    FormatMessageA(FORMAT_MESSAGE_FROM_SYSTEM | FORMAT_MESSAGE_IGNORE_INSERTS,
                   NULL, code, 0, message, (DWORD)sizeof(message), NULL);
    fprintf(stderr, "%s failed (error %lu): %s\n", what, (unsigned long)code, message);
}

int main(int argc, char *argv[])
{
    const char *library_path = (argc > 1) ? argv[1] : DEFAULT_LIBRARY_NAME;
    HMODULE library = NULL;
    sfc_decide_fn decide = NULL;
    sfc_version_fn version = NULL;
    sfc_free_fn release = NULL;
    char *request = NULL;
    char *version_text = NULL;
    char *answer = NULL;
    int exit_code = 1;

    /* 1. Load the library. */
    library = LoadLibraryA(library_path);
    if (!library) {
        print_last_error("Loading the decision library");
        fprintf(stderr, "Looked for: %s\n", library_path);
        fprintf(stderr, "Pass the full path as the first argument if it lives elsewhere.\n");
        return 1;
    }

    /* 2. Find the functions. */
    decide = (sfc_decide_fn)GetProcAddress(library, "sfc_decide");
    version = (sfc_version_fn)GetProcAddress(library, "sfc_version");
    release = (sfc_free_fn)GetProcAddress(library, "sfc_free");
    if (!decide || !version || !release) {
        fprintf(stderr, "The library loaded but does not have the expected functions.\n");
        fprintf(stderr, "It is probably an older or unrelated file.\n");
        goto cleanup;
    }

    /* 3. Check the version before trusting anything it returns.
     *
     * A real program should parse the number and compare it to
     * EXPECTED_SCHEMA_VERSION, stopping on a mismatch. Printing it is enough here. */
    version_text = version();
    if (version_text) {
        printf("Library version: %s\n", version_text);
        printf("This example expects schema %d.\n\n", EXPECTED_SCHEMA_VERSION);
        release(version_text);
        version_text = NULL;
    }

    /* 4. Ask for the decisions. */
    request = build_request();
    if (!request) {
        fprintf(stderr, "Out of memory building the request.\n");
        goto cleanup;
    }

    answer = decide(request);
    if (!answer) {
        /* Documented never to happen, so this means something is badly wrong. */
        fprintf(stderr, "The library returned nothing at all.\n");
        goto cleanup;
    }

    /* 5. Use the answer. Check for a reported problem before reading anything else.
     *
     * A failure reply is the whole object - {"error":"..."} and nothing else - so look for
     * it at the START. Searching the whole text would also match the word inside a rule
     * name, and report a problem on a perfectly good answer. */
    if (strncmp(answer, "{\"error\"", 8) == 0) {
        fprintf(stderr, "The library reported a problem:\n%s\n", answer);
        goto cleanup;
    }

    printf("Decisions:\n");
    print_verdicts(answer);
    exit_code = 0;

cleanup:
    /* Strings from the library are released with its own sfc_free, never free(). */
    if (answer && release) {
        release(answer);
    }
    if (version_text && release) {
        release(version_text);
    }
    /* The request buffer is ours, so it uses the ordinary free(). */
    free(request);
    FreeLibrary(library);
    return exit_code;
}
