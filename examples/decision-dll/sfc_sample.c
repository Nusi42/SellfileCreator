/*
 * sfc_sample.c — a complete, working example of calling the decision library
 * from C on Windows.
 *
 * It loads the library, checks the version, asks for a decision on two pieces of
 * gear, prints the answers, then writes sell files the helper app can load - the
 * complete one, and the two halves it splits into - to show what the switches do.
 * Everything is plain C99 and the Windows API - no other libraries needed.
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
typedef char *(*sfc_build_hsf_fn)(const char *);
typedef char *(*sfc_version_fn)(void);
typedef void (*sfc_free_fn)(char *);

/*
 * A small sell file using all three sources, so the switches further down have something
 * to separate: a rule that sells 5-star Epic pieces with a Speed substat, a safeguard that
 * keeps the two best of them anyway, and a closing "sell the rest".
 *
 * A real one comes from a file on disk - this is inline only to keep the example to a
 * single source file. Note the escaped quotes: the sell file is passed as a JSON
 * string value inside the request, so its own quotes are escaped.
 */
static const char *SELL_FILE =
    "{"
    "\\\"Version\\\": \\\"1.0\\\","
    "\\\"Recipes\\\": [{"
    "\\\"keep\\\": false,"
    "\\\"Rank\\\": \\\"5\\\\u2605\\\","
    "\\\"Rarity\\\": \\\"Epic\\\","
    "\\\"substats\\\": [\\\"SPD\\\"],"
    "\\\"minCount\\\": 1"
    "}],"
    /* A safeguard: whatever the rule above would sell, keep the two best Speed
     * pieces anyway. This is the part the safeguards switch separates out. */
    "\\\"Safeguards\\\": [{"
    "\\\"activation\\\": \\\"protectExisting\\\","
    "\\\"requiredCount\\\": 2,"
    "\\\"substats\\\": [\\\"SPD\\\"],"
    "\\\"substatMatch\\\": \\\"any\\\""
    "}],"
    "\\\"SafeguardsEnabled\\\": true,"
    /* The closing catch-all: sell anything no rule above named, at any level. */
    "\\\"FinalSellRemainder\\\": {"
    "\\\"artifacts\\\": true,"
    "\\\"accessories\\\": true,"
    "\\\"levels\\\": [0, 4, 8, 12, 16]"
    "}"
    "}";

/*
 * Two pieces of gear, exactly as the game reports them.
 *
 * Both are 5-star Epic pieces carrying Speed, so the rule above would sell both - and the
 * safeguard then keeps them, which is what gives the split below something to show.
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
    "\"rankId\": 5,"
    "\"rarityId\": 4,"         /* 4 = Epic */
    "\"level\": 16,"
    "\"setKindId\": 5,"
    "\"primary\": { \"id\": 2, \"isAbsolute\": 0 },"
    /* Speed 10, so this piece is a weaker Speed candidate than 1001 above. */
    "\"secondary\": [ { \"id\": 4, \"level\": 1, \"isAbsolute\": 1, \"statValue\": 42949672960 } ]"
    "}"
    "]";

/*
 * Who is wearing what. Optional, but worth sending: safeguard rules treat worn gear
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
 * Build the request for a sell file. Caller frees with free().
 *
 * `switches` is pasted in as-is, so a caller can leave it empty for the complete file or
 * pass something like ", \"finalSell\": false" to leave a part out. The gear goes along
 * because a safeguard names the individual pieces it saves - without gear the file comes
 * back with no safeguards in it.
 */
static char *build_hsf_request(const char *switches)
{
    size_t capacity = strlen(SELL_FILE) + strlen(GEAR) + strlen(CHAMPIONS) + strlen(switches) + 256;
    char *buffer = (char *)malloc(capacity);
    if (!buffer) {
        return NULL;
    }
    _snprintf_s(buffer, capacity, _TRUNCATE,
                "{\"sfc\": \"%s\", \"artifacts\": %s, \"champions\": %s%s}",
                SELL_FILE, GEAR, CHAMPIONS, switches);
    return buffer;
}

/*
 * Report how many rules a sell file came back with, and say what it would be saved as.
 *
 * The answer holds the whole file in "hsf" - this only reads the count beside it, to keep
 * the example short. Real code pulls out "hsf" with its JSON library and writes that
 * string to a .hsf file exactly as it stands, without reformatting it.
 */
static void report_sell_file(const char *label, const char *answer)
{
    const char *count = strstr(answer, "\"ruleCount\":");

    if (strncmp(answer, "{\"error\"", 8) == 0) {
        fprintf(stderr, "  %-24s failed: %s\n", label, answer);
        return;
    }
    if (!count) {
        fprintf(stderr, "  %-24s no rule count in the answer.\n", label);
        return;
    }
    printf("  %-24s %lld rule(s)\n", label, _atoi64(count + strlen("\"ruleCount\":")));
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
    const char *verdicts_end = NULL;
    int count = 0;

    if (!cursor) {
        printf("No verdicts in the answer.\n");
        return;
    }

    /* Stop at the end of the verdicts array. "artifactId" also appears in
     * safeguardRanks, so a scan that ran to the end of the answer would report every
     * piece a second time, with the rank row's fields read as a verdict. */
    verdicts_end = strchr(cursor, ']');
    if (!verdicts_end) {
        printf("No verdicts in the answer.\n");
        return;
    }

    /* Each verdict object starts at an "artifactId" key. */
    while ((cursor = strstr(cursor, "\"artifactId\":")) != NULL && cursor < verdicts_end) {
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
            printf("  %lld  KEEP  - a rule would sell it, but a safeguard saved it\n", id);
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
    sfc_build_hsf_fn build_hsf = NULL;
    sfc_version_fn version = NULL;
    sfc_free_fn release = NULL;
    char *request = NULL;
    char *version_text = NULL;
    char *answer = NULL;
    char *hsf_request = NULL;
    char *hsf_answer = NULL;
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
    build_hsf = (sfc_build_hsf_fn)GetProcAddress(library, "sfc_build_hsf");
    version = (sfc_version_fn)GetProcAddress(library, "sfc_version");
    release = (sfc_free_fn)GetProcAddress(library, "sfc_free");
    if (!decide || !build_hsf || !version || !release) {
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

    /* 6. Ask for sell files the helper app could load.
     *
     * Three times over the SAME sell file and the same gear, to show what the switches
     * are for: the complete file, then the two halves it splits into. The halves do not
     * overlap and together they hold exactly the entries of the complete one, so writing
     * both covers everything the single file would.
     *
     * The switches have to be chosen HERE. A finished sell file is just a list of rules
     * and does not record which part each one came from, so there is nothing left to
     * sort out afterwards. */
    printf("\nSell files:\n");

    /* No switches: every source the sell file asks for. */
    hsf_request = build_hsf_request("");
    if (hsf_request) {
        hsf_answer = build_hsf(hsf_request);
        if (hsf_answer) {
            report_sell_file("everything", hsf_answer);
            release(hsf_answer);
            hsf_answer = NULL;
        }
        free(hsf_request);
        hsf_request = NULL;
    }

    /* One half: the rules the user wrote, plus the closing sell. */
    hsf_request = build_hsf_request(", \"safeguards\": false");
    if (hsf_request) {
        hsf_answer = build_hsf(hsf_request);
        if (hsf_answer) {
            report_sell_file("recipes + final sell", hsf_answer);
            release(hsf_answer);
            hsf_answer = NULL;
        }
        free(hsf_request);
        hsf_request = NULL;
    }

    /* The other half: only the pieces the safeguards rescue. */
    hsf_request = build_hsf_request(", \"recipes\": false, \"finalSell\": false");
    if (hsf_request) {
        hsf_answer = build_hsf(hsf_request);
        if (hsf_answer) {
            report_sell_file("safeguards only", hsf_answer);
            release(hsf_answer);
            hsf_answer = NULL;
        }
        free(hsf_request);
        hsf_request = NULL;
    }

    printf("\nTo save one, write its \"hsf\" text to a file ending in .hsf, as it stands.\n");
    exit_code = 0;

cleanup:
    /* Strings from the library are released with its own sfc_free, never free(). */
    if (answer && release) {
        release(answer);
    }
    if (version_text && release) {
        release(version_text);
    }
    if (hsf_answer && release) {
        release(hsf_answer);
    }
    /* The request buffers are ours, so they use the ordinary free(). */
    free(request);
    free(hsf_request);
    FreeLibrary(library);
    return exit_code;
}
