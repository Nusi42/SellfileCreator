# Decision library — calling it from your own program

This folder has everything you need to ask "keep or sell?" for a pile of gear from your
own Windows program, in C — and to write a sell file the helper app can load.

You give it a sell file and your gear. It gives you back, for every piece, whether to
keep it, which rule decided that, and whether a safeguard rule is the only reason it
survived. The answers are the same ones you would see in the app's own preview, because
it is the same decision code — that is the whole point of shipping it as a library rather
than leaving you to reimplement the rules.

It can also hand you a finished `.hsf` sell file built from the same sell file and gear,
with separate switches for the recipes, the safeguards, and the closing "sell the rest".

## What is here

| File | What it is |
|---|---|
| `sfc_engine.dll` | The library itself. Ship it alongside your program. |
| `sfc_decide.h` | The interface. Four functions, all documented in the file. |
| `sfc_sample.c` | A complete working program: loads the library, gets decisions, prints them, and splits a sell file into parts. |
| `build.bat` | Builds the example. Finds your compiler for you. |

## Try it

```
build.bat
sfc_sample.exe
```

You should see a version line, the decisions for two example pieces, and the size of
three sell files — the complete one and the two halves it splits into. The example finds
the library beside it; if you move it elsewhere, pass its path instead:

```
sfc_sample.exe path\to\sfc_engine.dll
```

You need a C compiler. The free Community edition of Visual Studio with the
"Desktop development with C++" option is enough, and `build.bat` will find it.

## How it works

Four functions, all taking and returning UTF-8 text:

- **`sfc_decide`** — hand it a sell file plus your gear, get decisions back.
- **`sfc_build_hsf`** — same input, plus three switches; get a sell file back as text.
- **`sfc_version`** — which build you are talking to. Check it at startup.
- **`sfc_free`** — release anything the library gave you.

Everything crosses the boundary as JSON, so any language that can call a C function and
parse JSON can use it. `sfc_decide.h` documents the exact shapes; `sfc_sample.c`
shows the whole sequence.

Load the library at run time (as the example does) rather than linking against it. Your
program then still starts when the file is missing, and can say so clearly.

## Four things that decide whether your answers are right

These are the mistakes that make a decision differ from what the app shows for the same
sell file and the same gear. Each one is silent — you get a confident wrong answer, not
an error — and each is already handled for you **as long as you pass the game's values
through untouched**.

**Send stat values exactly as the game reports them.** They are fixed-point integers: the
number you see in game is the stored value divided by 2³². The library converts and rounds
them the same way the app does. If you convert them yourself first, you will round
differently, and roughly half of all substats sit just under a whole number — a piece the
game calls "Speed 12" is stored a hair under 12. Compared raw against a "12 or more" rule
it fails, and gear that should be kept gets sold.

**Send the real upgrade level.** Rules name specific levels — 0, 4, 8, 12 and 16 — and match
them exactly, so an off-milestone level has to be mapped onto one of them. The library does
that the same way the app does, which is what keeps the two in step: pass the real level
through and let it map, rather than rounding first and rounding differently.

Levels between the named ones are ordinary gear and a large part of many inventories, so
this reaches a lot of pieces.

**Send the set exactly as the game gives it, including "no set".** Rings, amulets and
banners can come without a set, and rules name that "no set" specifically, as a set of its
own. The library turns the game's "no set" into the value those rules expect, so pass it
through unchanged rather than leaving the set out or replacing it.

**Send who is wearing what.** It is optional, but safeguard rules treat worn gear
differently, so leaving it out can change an answer.

In short: pass the raw numbers straight through. The library exists to get this right.

### One thing it cannot do for you: a saved file's dynamic overrides

A sell file can carry *dynamic overrides* — questions the file's note asks, whose answers
change the rules it means. A file the app **pushed** over its connection already has those
answers applied, so it decides here exactly as it does there.

A file the user **saved** from the app does not. It holds the rules as authored plus the
answers, and applying one to the other is the app's own step. Judged straight, such a file
decides by the authored defaults, which can differ sharply from the app's preview of the
very same file. There is no error and nothing looks wrong.

So prefer a pushed document. If you must take a saved one, look at `NoteRecipeOverridesDisabled`:
`true` means the user switched the overrides off, the authored rules are what the app uses too,
and the file decides here exactly as it does there. Otherwise, if it has a `Note` alongside
`NoteRecipeOverridesAnswers` or `NoteSafeguardOverridesAnswers`, treat its decisions as
approximate and say so before anything is sold.

## Reading a decision

Each piece comes back with `keep`, `matched` and `safeguarded`:

- **`keep=true`, `matched=true`** — a rule decided to keep it.
- **`keep=true`, `matched=false`** — no rule mentioned it, so it was kept by default.
  Nothing said to sell it, and gear is never sold on silence. Worth showing differently
  from a real decision: it usually means the sell file does not cover that kind of gear.
- **`keep=false`, `matched=true`** — a rule decided to sell it.
- **`safeguarded=true`** — a rule would have sold it and a safeguard rule saved it. A
  written-out sell file cannot express this; only a live decision can tell you.

`safeguardRanks` gives you the reasoning behind the safeguards: where each piece placed, which
group of similar pieces it was compared against, and whether it made the cut.

## Writing a sell file

`sfc_build_hsf` takes the same sell file and gear and gives you back a finished `.hsf` as
text, ready to write to disk.

A sell file is written from three separate sources, and one switch each leaves one out:

- **`recipes`** — the keep and sell rules the user wrote.
- **`safeguards`** — keep entries for the individual pieces the safeguard rules save.
- **`finalSell`** — the closing "sell everything not mentioned above". Turn it off for a
  cautious file that only ever sells what a rule actually names.

Leave a switch out and that source is written the way the sell file itself asks for, so
sending none of them gives you the complete file — the same one the app would write. Set
one to `false` and that source is left out.

A switch only ever takes a source away. Setting one to `true` adds nothing, because there
is nothing to add: a sell file with its safeguards turned off, or with no closing sell
defined, has none to begin with — and a file must never sell gear its author did not ask
to sell.

### Splitting one sell file into several

Ask twice over the same sell file and the same gear, leaving out a different source each
time:

| Request | What you get |
|---|---|
| `{ …, "safeguards": false }` | the recipes and the closing sell |
| `{ …, "recipes": false, "finalSell": false }` | the safeguards on their own |
| `{ … }` | all three together |

Together the two parts hold every entry of the complete file, so you can write them as
separate files and still have covered everything the complete one would. They can share
one kind of entry: when a keep rule the user wrote already keeps a piece a safeguard would
also save, the safeguard part keeps it again. That repeats a keep and never changes what
happens to a piece.

You have to choose here, though: a finished sell file is just a list of rules and does not
record which part each one came from, so there is nothing to sort out afterwards.

One more thing worth knowing. The gear matters even though a sell file describes rules
rather than pieces: a safeguard works by naming the pieces it saves, so a request with no
gear comes back with no safeguards in it however the switch is set.

Write the returned text to a file ending in `.hsf` exactly as it stands. Do not reformat it.

## Speed

A full inventory of around 8,000 pieces against a large sell file takes roughly a second
and a half. Most of that is checking the safeguard rules against your gear and turning the
sell file into rules, which has to happen every time because safeguard rules depend on the
gear itself.

Every call is independent — nothing is remembered between calls, so there is no session to
open or state to invalidate. Call it whenever your gear changes.

Two things worth knowing:

- The optional `improvementChances` projection adds a little more time and changes no
  keep-or-sell answer. Leave it off unless you show it.
- Calls are safe to make from several threads at once, and each is self-contained. That
  helps when you have separate requests to answer; it does not make a single answer
  arrive sooner, because each call does the whole job from scratch.

## If something goes wrong

The library never returns nothing. On failure you get `{"error":"..."}` describing the
problem, so check for an `error` key before reading the rest. A result of nothing at all
means the library itself did not load.

Check `sfc_version` at startup and stop if the schema number is not what your code expects.
That turns a version mismatch into a clear message rather than fields quietly read wrong.

## A warning worth repeating

Selling gear cannot be undone. Show the user what will be sold and let them confirm before
acting on any decision — the same preview-then-confirm the app itself uses.

## License

The files in this folder (the header, the sample program, the build script and this README)
are under the MIT license (see `LICENSE`): copy them into your own program, open or closed.
The decision library itself, `sfc_engine.dll`, is part of Sellfile Creator and is licensed
under the GNU Affero General Public License, version 3 or later.
