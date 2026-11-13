# Conquest of Elysium 5 Mod validator

A validator for Conquest of Elysium 5 mod files. Point it at your mod and it
tells you what is wrong with it, with a line number.

The game will not do this for you. A broken mod either loads silently wrong or
crashes on startup without saying where, which turns a misspelled monster name
into an afternoon of bisecting your own file.

```
mods/mymod/mymod.c5m
   14:15  error   no weapon named "Grave Iron"  unknown-weapon
      │ meleeweapon 4 "Grave Iron"
      │               ~~~~~~~~~~~~
      └ not in the base game and not defined earlier in this mod
   22:7   warning argument 1 (1-9) is documented as 1-9, got 12  arg-range
      │ level 12
      │       ~~

1 error(s), 1 warning(s)
```

## Running it

You need [Node.js](https://nodejs.org) 18 or newer. Install it, restart your
terminal, then from the folder you unpacked this into:

```
node bin/coe5-modcheck.js "C:\path\to\mods\mymod"
```

That path is the folder your mod lives in, the one containing `mymod.c5m`. You
can also hand it a single file:

```
node bin/coe5-modcheck.js "C:\path\to\mods\mymod\mymod.c5m"
```

Checking the whole folder is better: only then can it verify the folder layout
and that every image and sound your mod names is actually present.

There is nothing to install and no dependencies to download. To see it work
before pointing it at anything of your own, try the deliberately broken example
that ships with it:

```
node bin/coe5-modcheck.js examples/graveyard
```

## What it checks

`node bin/coe5-modcheck.js --rules` lists every check and how loudly it
complains.

**Typing mistakes.** Unknown commands, with a suggestion when it can guess what
you meant. Strings that are never closed, since mod text has to stay on one line
and `^` is the paragraph break. Curly quotes, which sneak in from Word and which
the game does not recognise. A `#` inside quoted text, where the game may cut
your line short.

**Command arguments.** Too few or too many, the wrong kind (text where a number
belongs), and values outside the range the manual documents.

**What the command is talking to.** A mod is one long list of commands, and each
one applies to whatever `newmonster`, `selectclass` or `newritual` last named.
Put `hometerr` after a `newritual` and the game stops loading the mod with
`mod command 'hometerr' did nothing`; inside an event it skips the line and logs
`No event command called`. The checker follows that pointer and says so, using
where the game itself accepts each command.

**What the game does with it.** Values the game clamps or rejects (`hp 0`,
`modprio 12`, a `combatsum` mode outside -1 to 1), commands the game does not
recognise even though older references list them (`wander2`), commands the game
accepts that no reference lists (`holyvengeance`), and a handful of verified
hazards: `removeanimalcorpses` aborts the game, `+hascom` can never be true,
`newunits` ignores counts of three or more digits.

**Names.** Every monster, weapon, magic item, ritual and class you name is
checked against the base game plus everything your own mod has defined *above*
that line, including names given after the fact with `name`, `setname` and
`setclassname`. Referring to something you define later is an error. Assigning
a weapon to a monster before the weapon exists is the one case the manual
promises will crash the game and reports as `use-before-define`; every other
forward reference reports as `forward-reference`, which can be turned down if
you know better than the checker does. Terrain numbers,
resource types, player numbers and ritual school numbers are range checked.
Summon strings like `"c*Captain & 2d6*Spearman"` and recruitment conditions like
`"+Baron"` are pulled apart and the names inside them checked too.

**Packaging.** The required `icon` and `description`. The `mods/<name>/<name>.c5m`
layout, including the case of the filename, which matters on Linux even though it
does not on your machine. Every `.tga`, `.png`, `.sw`, `.ttf` and `.coem` your
mod names being present in the folder.

Duplicate names are a warning, not an error, and the message reminds you of the
`"1:Longdead"` offset form. The base game does this on purpose all the time.

## Options

```
-f, --format <name>   pretty (default), compact, github, json
-r, --rule <id=level> change one check: error, warning, info, off
-q, --quiet           errors only
    --max-warnings N  fail if warnings exceed N
    --no-colour
    --rules           list every check and its default level
```

Any check can be turned down or off if it is wrong about your mod:

```
node bin/coe5-modcheck.js mods/mymod -r duplicate-name=off
node bin/coe5-modcheck.js mods/mymod -r forward-reference=warning
```

The exit code is 1 when something is wrong, so this drops straight into a build
script. `--format github` prints annotations that GitHub Actions shows inline on
a pull request.

## Where the rules come from

The list of commands is not hand written. It is built by merging three sources:
the body of Illwinter's modding manual for argument shapes and documented
ranges, the manual's index for the full list of command names, and the base
game's own data for how each command is really used.

That comes to 853 commands, along with the names of 1779 monsters, 926 weapons,
274 magic items, 552 rituals, 354 terrains and 29 classes.

Where the manual and the game disagree, both are accepted. `power` is documented
as taking one argument, but every use of it in the game passes two, so either
works. `fear` is documented as taking a value but is often written bare, so
either works. The checker never guesses at behaviour neither source shows.

On top of that, `data/engine.json` records what the CoE5 5.42 game binary
itself does with each command: where its parser acts on it, the bounds it
enforces, and verified quirks. It is built by `tools/build-engine.mjs` from the
clean findings of a reverse-engineering pass (facts in our own words, no game
code). Where it disagrees with the manual about where a command belongs, the
game wins, because the game is what loads the mod.

It has been run over the base game's own data, around 26,000 lines, and the only
things it reports there are real quirks: 137 pairs of same named weapons the game
ships deliberately, and two commands the manual forgot to document.

## Using it from your own code

```js
import { lintSource, lintMod } from "coe5-modcheck";

lintSource(fs.readFileSync("mymod.c5m", "utf8"), { file: "mymod.c5m" });
lintMod("mods/mymod", { severity: { "duplicate-name": "off" } });
```

Both return an array of `{ severity, rule, file, line, col, end, message, hint }`.

The source is laid out one concern per file. `src/rules/` holds the checks, one
module each, and every module exports the checks it owns and a `check` function.
Adding a check is adding a module and one line in `src/rules/index.js`.

## What it does not check

Bitmask arguments (`gems`, `squarespec`, damage types 12 and 13) are checked for
being numbers and nothing more. Plane numbers, afflictions and benefits are not
range checked.

The base game name lists come from the extracted game data, so a name the
extraction never mentions will read as unknown even though the game has it. If
you hit one, `-r unknown-monster=warning` gets you moving again.

Whether your mod is balanced, and whether two mods you have both enabled step on
each other, are beyond it.

## Thanks

**Illwinter Game Design**, for Conquest of Elysium 5 and for writing a modding
manual at all. Most games this deep never get one.

**Colonel Dracula**, for the extraction of the game's own data into mod format.
Half of what this tool knows comes from that work, and there is no other way to
learn most of it.

Neither is affiliated with this tool, and any mistakes in it are mine.

## Licence

MIT. See LICENSE.
