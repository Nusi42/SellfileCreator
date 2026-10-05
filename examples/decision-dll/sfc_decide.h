/*
 * sfc_decide.h — the decision library's C interface.
 *
 * Drop this header next to your own code and load the library at run time (see
 * sfc_sample.c for a complete, working loader). Everything the library does is
 * reachable through the four functions below.
 *
 * All strings are UTF-8 and null-terminated. Every string the library hands back is
 * heap-allocated by the library itself, so it must be released with sfc_free — never
 * with free() from your own runtime, which may not be the same allocator.
 */

#ifndef SFC_DECIDE_H
#define SFC_DECIDE_H

#ifdef __cplusplus
extern "C" {
#endif

/*
 * Decide keep or sell for every piece of gear you supply.
 *
 * ===========================================================================
 * WHAT YOU SEND
 * ===========================================================================
 *
 * One JSON object. Only "sfc" and "artifacts" are required:
 *
 *   {
 *     "sfc":       "<the sell file's text, as a JSON string>",
 *     "artifacts": [ <gear row>, ... ],
 *     "champions": [ <champion row>, ... ],
 *
 *     "improvementChances": false,
 *     "rules":              true
 *   }
 *
 *   sfc                 The sell file's entire text, passed as a JSON string VALUE -
 *                       so every quote and backslash inside it is escaped. You do not
 *                       parse or pre-process it; hand over the file contents as read.
 *
 *                       One caveat if the file came from the app's "Save .sfc" rather
 *                       than from a push: a saved file stores the rules as AUTHORED plus
 *                       the user's dynamic-overrides answers, and applying those answers
 *                       to the rules is the app's own step, not this library's. Judged
 *                       here, such a file decides by the authored defaults - which is not
 *                       what the app's preview of it shows. A document the app PUSHED has
 *                       the answers already applied and needs nothing.
 *
 *   artifacts           Your gear. Optional and defaulting to empty, though an empty list
 *                       simply yields no verdicts, so in practice you always send it.
 *                       Shape below.
 *
 *   champions           Who is wearing what. Optional, but it changes answers:
 *                       safeguard rules treat worn gear differently. Shape below.
 *
 *   improvementChances  Off by default. Adds a per-piece "how likely is this to get
 *                       better" projection. It adds to the time each call takes and
 *                       changes no keep-or-sell answer, so leave it off unless you
 *                       display it.
 *
 *   rules               On by default. Set false if you only want decisions and never
 *                       write a sell file of your own - a real sell file compiles to
 *                       tens of thousands of rules you would otherwise carry back.
 *
 * ---------------------------------------------------------------------------
 * A gear row (one entry in "artifacts")
 * ---------------------------------------------------------------------------
 *
 * This is the game's own shape. Send the fields through UNCHANGED. Extra fields the
 * game includes (price, revision, isSeen, ...) are ignored, so you can pass a row
 * along verbatim rather than rebuilding it.
 *
 *   {
 *     "id":               7380,   // your identifier for the piece; echoed in the verdict
 *     "kindId":           8,      // which slot - see the table below
 *     "rankId":           6,      // stars, 1-6
 *     "rarityId":         4,      // 1 Common, 2 Uncommon, 3 Rare, 4 Epic,
 *                                 // 5 Legendary, 6 Mythical
 *     "level":            16,     // the REAL upgrade level, 0-16. Do not round it -
 *                                 // the library snaps it to the level rules can name.
 *     "setKindId":        0,      // the set, for EVERY slot including accessories.
 *                                 // 0 means no set, which only accessories have; the
 *                                 // library handles it for you (see "no set" below).
 *     "requiredFraction": 12,     // accessory faction code, 0 when none. This is a
 *                                 // FACTION, never a set - do not put a set id here.
 *     "rerollsCount":     null,   // times reworked with chaos ore; null means never.
 *                                 // Some rules only apply to reworked gear.
 *     "readOnly":         false,  // locked in game. The library ignores it; check it
 *                                 // yourself if you want to flag "marked sell but
 *                                 // the game will refuse".
 *
 *     "primary":   { <stat> },        // the main stat; may be omitted
 *     "secondary": [ <stat>, ... ]    // up to 4 substats; may be empty or omitted
 *   }
 *
 * Slots (kindId):
 *
 *   1 Helmet   2 Chestplate   3 Gauntlets   4 Boots   5 Weapon   6 Shield
 *   7 Ring     8 Amulet       9 Banner
 *
 * Rings, amulets and banners are the accessories: only they carry a faction, and only
 * they can come without a set.
 *
 * ---------------------------------------------------------------------------
 * A stat (the "primary" object, and each entry of "secondary")
 * ---------------------------------------------------------------------------
 *
 *   {
 *     "id":         4,             // which stat - see the table below
 *     "level":      4,             // how many times this substat has rolled, 0-5.
 *                                  // Meaningless on the main stat; send 0.
 *     "isAbsolute": 1,             // 1 = a flat amount, 0 = a percentage.
 *                                  // HP, ATK and DEF come in BOTH forms and this is
 *                                  // the only thing telling them apart.
 *     "statValue":  90194313216,   // the amount, in the game's fixed-point form
 *     "mValue":     0,             // mythical bonus (see below)
 *     "rValue":     0,             // the same bonus under its other name
 *     "glyphValue": 25769803776    // glyph share - IGNORED, see below
 *   }
 *
 * Stats (id):
 *
 *   1 HP    2 ATK    3 DEF    4 SPD    5 RES    6 ACC    7 C.RATE    8 C.DMG
 *
 *   Ids 1-3 are percentage or flat depending on isAbsolute; 4-8 are always the one
 *   form. Higher ids exist for the mode-damage substats on accessories and are handled
 *   the same way - pass whatever the game reports.
 *
 * statValue is fixed point: the number shown in game equals this divided by 2^32.
 * The example above is 90194313216 / 2^32 = 21, a Speed 21 substat.
 *
 * PASS IT THROUGH UNCONVERTED. The library decodes and rounds it exactly as the app
 * does. Converting it yourself is the single most common cause of decisions that
 * disagree with the app: roughly half of all substats land just under a whole number
 * (a "Speed 12" is stored a hair below 12), so a rule asking for "12 or more" fails
 * against the raw value and gear that should be kept gets sold.
 *
 * mValue / rValue carry the mythical bonus, which counts toward what a rule compares
 * against. Two spellings exist because different sources name it differently; only one
 * is ever filled in, and the library reads both, so just forward what you receive.
 *
 * glyphValue is deliberately NOT counted. Rules compare against the amount before
 * glyphs, matching the app. Send it or leave it out - either way it changes nothing.
 *
 * ---------------------------------------------------------------------------
 * A champion row (one entry in "champions")
 * ---------------------------------------------------------------------------
 *
 * Only two fields are read; anything else in the row is ignored.
 *
 *   {
 *     "id": 900,                   // the champion
 *     "artifacts": {               // slot number -> the id of the piece worn there
 *       "1": 7380,
 *       "5": 7381
 *     }
 *   }
 *
 * Keys are slot numbers as STRINGS, values are gear ids matching "id" in your gear
 * rows. A piece listed here counts as worn. Empty slots can be left out or set to 0.
 *
 * ---------------------------------------------------------------------------
 * Accessories with "no set"
 * ---------------------------------------------------------------------------
 *
 * Send setKindId 0 whenever a ring, amulet or banner has no set, exactly as the game
 * reports it. Rules treat that "no set" as a set of its own and name it directly, and the
 * library turns the 0 into the value those rules expect. This is handled for you - it is
 * described here only so you do not try to "fix" it before sending.
 *
 * ===========================================================================
 * WHAT YOU GET BACK
 * ===========================================================================
 *
 *   {
 *     "verdicts": [
 *       {
 *         "artifactId":  7380,     // matches the "id" you sent
 *         "keep":        true,     // the decision
 *         "matched":     true,     // did any rule cover this piece at all
 *         "ruleName":    "...",    // name of the deciding rule, or null if the rule
 *                                  // has no name or nothing matched
 *         "safeguarded": false     // kept only because a safeguard overrode a sell rule
 *       }
 *     ],
 *
 *     "safeguardRanks": [
 *       {
 *         "artifactId":    7380,
 *         "ruleOrdinal":   2,      // which safeguard rule, counting from 1 in file order
 *         "score":         41.5,   // how well this piece scored for that rule
 *         "candidateRank": 7,      // its place across everything that rule considered
 *         "bucketRank":    2,      // its place among the similar pieces it competes with
 *         "bucketKey":     "4:12:1025:0",   // which group of similar pieces that was
 *         "isWithinQuota": true,   // did it make the cut
 *         "groupId":       null,   // set when several rules share one quota
 *         "substatBuckets": [      // per-substat placings, for rules that rank that way
 *           { "variant": 1025, "bucketRank": 1, "isWithinQuota": true }
 *         ]
 *       }
 *     ],
 *
 *     "improvementChances": [       // empty unless you asked for it
 *       { "artifactId": 7380, "chancePercent": 72.4 }
 *     ],
 *
 *     "rules": [ ... ]              // the compiled rules, unless you turned them off
 *   }
 *
 * A piece appears in "verdicts" once. It appears in "safeguardRanks" once per
 * safeguard rule that considered it, or not at all if none did.
 *
 * Reading the three verdict fields together:
 *
 *   keep=true,  matched=true   A rule decided to keep it.
 *   keep=true,  matched=false  No rule mentioned it. It is kept because nothing said to
 *                              sell it - never sell what the file did not name. Worth
 *                              showing differently: it usually means the sell file does
 *                              not cover that kind of gear.
 *   keep=false, matched=true   A rule decided to sell it.
 *   safeguarded=true           A rule would have sold it and a safeguard rule saved it.
 *                              Only a live decision can tell you this; a written-out
 *                              sell file has no way to express it.
 *
 * keep=false with matched=false never happens: nothing is sold on silence.
 *
 * ===========================================================================
 * CALLING IT SAFELY
 * ===========================================================================
 *
 * You may call this from several threads at once. Each call is self-contained and
 * shares nothing with the others, so nothing needs locking on your side.
 *
 * That helps you answer separate requests in parallel. It does NOT make one answer
 * arrive sooner: every call does the whole job from scratch, because the safeguard
 * rules depend on the gear you send and cannot be prepared in advance.
 *
 * Nothing is remembered between calls - there is no session to open, nothing to
 * invalidate, and no order you must call things in. Call it whenever your gear changes.
 *
 * On failure the result is {"error":"<what went wrong>"} instead. The function never
 * returns NULL, so a NULL result means the library did not load properly.
 *
 * Release the result with sfc_free.
 */
char *sfc_decide(const char *input_json);


/*
 * Write a sell file (.hsf) that the helper app can load.
 *
 * Same sell file and same gear as sfc_decide, plus three switches choosing what goes
 * into the result. Use this when you want to hand the helper app a file; use sfc_decide
 * when you want the answers yourself.
 *
 * ===========================================================================
 * WHAT YOU SEND
 * ===========================================================================
 *
 *   {
 *     "sfc":       "<the sell file's text, as a JSON string>",
 *     "artifacts": [ <gear row>, ... ],
 *     "champions": [ <champion row>, ... ],
 *
 *     "recipes":    true,
 *     "safeguards": true,
 *     "finalSell":  true
 *   }
 *
 * "sfc", "artifacts" and "champions" are exactly as described for sfc_decide above -
 * same shapes, same rules about passing the game's numbers through untouched.
 *
 * The gear matters even though the result describes rules rather than pieces. A safeguard
 * works by naming the individual pieces it saves, so a request with no gear produces a
 * file with no safeguards in it, whichever way the switch is set.
 *
 * ---------------------------------------------------------------------------
 * The three switches
 * ---------------------------------------------------------------------------
 *
 * A sell file is written from three separate sources. Each switch leaves one of them out,
 * which is how you split one sell file into several files by where its entries came from.
 *
 * Leave a switch out and that source is written the way the sell file itself asks for -
 * so a request naming none of them gives you the complete file, the same one the app
 * would write. Set it to false and that source is left out entirely.
 *
 * A switch can only ever take a source AWAY. Setting one to true does not add anything,
 * because there is nothing to add: a sell file with its safeguards turned off, or with no
 * closing sell defined, has none to begin with, and a file must never sell gear its author
 * did not ask to sell.
 *
 *   recipes      The keep and sell rules the user wrote.
 *
 *   safeguards   Extra keep entries for the specific pieces the sell file's safeguard
 *                rules rescue. Turn off and those pieces are no longer spared.
 *
 *   finalSell    The closing "sell everything not mentioned above". Turn off and anything
 *                no rule names is simply left alone instead of sold. Worth turning off
 *                when you want a cautious file that only ever sells what it names.
 *
 * ---------------------------------------------------------------------------
 * Splitting one sell file into several
 * ---------------------------------------------------------------------------
 *
 * Ask twice over the same sell file and the same gear, leaving out a different source
 * each time:
 *
 *   { ..., "safeguards": false }                    the recipes and the closing sell
 *   { ..., "recipes": false, "finalSell": false }   the safeguards on their own
 *   { ... }                                         all three together
 *
 * Together the two parts hold every entry of the complete file, so you can write them as
 * separate files and still have covered everything the complete one would. They can share
 * one kind of entry: when a keep rule the user wrote already keeps a piece a safeguard
 * would also save, the safeguard part keeps it again. That repeats a keep and never
 * changes what happens to a piece.
 *
 * You must choose HERE. The finished file does not record which entry came from where,
 * so you cannot sort them out afterwards - a written sell file is just a list of rules.
 *
 * ===========================================================================
 * WHAT YOU GET BACK
 * ===========================================================================
 *
 *   {
 *     "hsf":       "<the complete file>",
 *     "ruleCount": 412
 *   }
 *
 *   hsf         The whole file as text. Write it to disk exactly as it is - do not
 *               reformat it or add anything. Name it with a .hsf ending.
 *
 *   ruleCount   How many rules it contains, so you can show or check the size without
 *               reading the file back.
 *
 * A big sell file turns into tens of thousands of rules, so expect a large string.
 *
 * On failure the result is {"error":"<what went wrong>"} instead, exactly as for
 * sfc_decide. The function never returns NULL.
 *
 * You may call this from several threads at once, like everything else here.
 *
 * Release the result with sfc_free.
 */
char *sfc_build_hsf(const char *input_json);


/*
 * Report which build you are talking to: {"crate":"<version>","schema":<number>}.
 *
 * "crate" is the version of Sellfile Creator this library shipped with, so it matches
 * the version shown in the app. It is useful in bug reports; do not gate on it.
 *
 * Check "schema" once at startup and refuse to run if it is not the number your code
 * was written against. That turns a version mismatch into a clear message instead of
 * silently misreading fields. Release the result with sfc_free.
 */
char *sfc_version(void);

/*
 * Release a string returned by any of the functions above. Passing NULL is safe and
 * does nothing.
 */
void sfc_free(char *ptr);

#ifdef __cplusplus
} /* extern "C" */
#endif

#endif /* SFC_DECIDE_H */
