# Decision library — calling it from your own program

This folder has everything you need to ask "keep or sell?" for a pile of gear from your
own Windows program, in C.

You give it a sell file and your gear. It gives you back, for every piece, whether to
keep it, which rule decided that, and whether a protection rule is the only reason it
survived. The answers are the same ones you would see in the app's own preview, because
it is the same decision code — that is the whole point of shipping it as a library rather
than leaving you to reimplement the rules.

## What is here

| File | What it is |
|---|---|
| `sfc_decide.h` | The interface. Three functions, all documented in the file. |
| `sfc_sample.c` | A complete working program: loads the library, gets decisions, prints them. |
| `build.bat` | Builds the example. Finds your compiler for you. |

The library itself (`sfc_engine.dll`) sits in the same folder as this README.

## Try it

```
build.bat
sfc_sample.exe
```

You should see a version line and then the decisions for two example pieces. If the
library is somewhere else, pass its path:

```
sfc_sample.exe C:\somewhere\sfc_engine.dll
```

You need a C compiler. The free Community edition of Visual Studio with the
"Desktop development with C++" option is enough, and `build.bat` will find it.

## How it works

Three functions, all taking and returning UTF-8 text:

- **`sfc_decide`** — hand it a sell file plus your gear, get decisions back.
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

**Send the real upgrade level.** Rules name specific levels, matched exactly. The library
rounds a level to the nearest one a rule can name, the way the app does, so a +9 piece is
judged as +8. Levels that sit between the named ones are ordinary gear and a large part of
any inventory.

**Send the set exactly as the game gives it, including "no set".** Rings, amulets and
banners with no set are their own kind of item and rules name them specifically; armour
with no set is simply setless. They look alike but must not be treated alike, and the
library keeps them apart.

**Send who is wearing what.** It is optional, but protection rules treat worn gear
differently, so leaving it out can change an answer.

In short: pass the raw numbers straight through. The library exists to get this right.

## Reading a decision

Each piece comes back with `keep`, `matched` and `safeguarded`:

- **`keep=true`, `matched=true`** — a rule decided to keep it.
- **`keep=true`, `matched=false`** — no rule mentioned it, so it was kept by default.
  Nothing said to sell it, and gear is never sold on silence. Worth showing differently
  from a real decision: it usually means the sell file does not cover that kind of gear.
- **`keep=false`, `matched=true`** — a rule decided to sell it.
- **`safeguarded=true`** — a rule would have sold it and a protection rule saved it. A
  written-out sell file cannot express this; only a live decision can tell you.

`safeguardRanks` gives you the reasoning behind protection: where each piece placed, which
group of similar pieces it was compared against, and whether it made the cut.

## Speed

A full inventory of around 8,000 pieces against a large sell file takes roughly two thirds
of a second. Most of that is turning the sell file into rules, which has to happen every
time because protection rules depend on the gear itself.

Every call is independent — nothing is remembered between calls, so there is no session to
open or state to invalidate. Call it whenever your gear changes.

Two things worth knowing:

- The optional `improvementChances` projection costs several times more than the decision
  and changes no keep-or-sell answer. Leave it off unless you show it.
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
