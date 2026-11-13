#!/usr/bin/env node
/**
 * Builds data/engine.json: what the shipped game binary itself accepts.
 *
 * Input is the clean side of the reverse-engineering workspace (coe5re
 * findings/<version>/): facts in our own words, no game code. Output is the
 * subset the validator acts on, keyed by catalog command name:
 *
 *   sections  where the game's parser acts on the command; anywhere else it
 *             reports "mod command '%s' did nothing" (or, in an event, logs
 *             "No event command called")
 *   clamps    argument bounds the game enforces, per section
 *   quirks    verified behaviour a modder must be warned about
 *
 * plus the commands the game knows that the catalog lacks (added) and the
 * catalog commands the game does not recognise (removed).
 *
 * Usage: node tools/build-engine.mjs <coe5re>/findings/5.42
 */
import fs from "node:fs";
import path from "node:path";

const dir = process.argv[2];
if (!dir) {
  console.error("usage: node tools/build-engine.mjs <coe5re findings/<version> dir>");
  process.exit(1);
}

const root = path.join(import.meta.dirname, "..");
const read = (file) => JSON.parse(fs.readFileSync(file, "utf8"));
const catalog = read(path.join(root, "data", "commands.json")).commands;
const rows = read(path.join(dir, "parser-map.json"));
const diff = read(path.join(dir, "catalog-diff.json"));
const triggers = new Set(read(path.join(dir, "parser-map", "D1.json")).map((row) => row.command));
const version = rows[0]?.version ?? "unknown";

// Hand-checked against the code; each one is in coe5re DECISIONS.md or a mechanics finding.
const QUIRKS = {
  removeanimalcorpses: {
    level: "error",
    message: "this event command aborts the game in 5.42 (fatal error \"rd: bad ct\")",
  },
  "+hascom": {
    level: "warning",
    message: "`+hascom` can never be true in 5.42 (the commander lookup runs with no square); `-hascom` always passes",
  },
  "+minunitshere": {
    level: "warning",
    message: "in a squareevent the first square short of units ends the whole event, not just that square",
  },
  newunits: {
    level: "warning",
    when: "(^|&\\s*)\\d{3,}\\*",
    message: "a count of three or more digits is not understood and creates one unit; use dice (e.g. `3d6*`) or a count up to 99",
  },
};

// Event conditions are written with a +/- prefix and the catalog keys them as `+name`.
function catalogKey(row) {
  if (row.parser !== "parse_event_line" || !triggers.has(row.command)) return row.command;
  if (catalog[row.command] && !catalog[`+${row.command}`]) return row.command;
  return `+${row.command}`;
}

function contextsOf(row) {
  if (row.parser === "parse_event_line") return ["event"];
  return row.contexts ?? [];
}

const commands = {};
for (const row of rows) {
  const key = catalogKey(row);
  const entry = (commands[key] ??= { sections: new Set(), clamps: [] });
  for (const section of contextsOf(row)) entry.sections.add(section);
  (row.args ?? []).forEach((arg, index) => {
    // Reference arguments (terrain, class, resource, player numbers) are the
    // values rule's business; only plain numeric fields get engine bounds.
    if (arg.type !== "int" || catalog[key]?.args?.[index]?.ref) return;
    // A row covering several sections may clamp in only one of them. Such rows
    // say where in clamp_sections; without it only single-section rows count.
    if (!row.clamp_sections && contextsOf(row).length !== 1) return;
    const min = Number.isInteger(arg.min) ? arg.min : null;
    const max = Number.isInteger(arg.max) ? arg.max : null;
    if (min === null && max === null) return;
    const sections = row.clamp_sections ?? contextsOf(row);
    const same = entry.clamps.find((clamp) => clamp.index === index && clamp.min === min && clamp.max === max);
    if (same) same.sections = [...new Set([...same.sections, ...sections])].sort();
    else entry.clamps.push({ index, min, max, sections });
  });
}

const out = {};
for (const [key, entry] of Object.entries(commands).sort(([a], [b]) => a.localeCompare(b))) {
  const value = { sections: [...entry.sections].sort() };
  if (entry.clamps.length) value.clamps = entry.clamps;
  if (QUIRKS[key]) value.quirk = QUIRKS[key];
  out[key] = value;
}

const removed = diff.filter((e) => e.class.includes("catalog-only")).map((e) => e.catalog_key ?? e.command);
const added = Object.keys(out).filter((key) => !catalog[key]);

const engine = {
  meta: {
    game: version,
    source: "coe5re reverse-engineering findings (clean side)",
    generated: new Date().toISOString().slice(0, 10),
    commands: Object.keys(out).length,
  },
  removed: removed.sort(),
  added: added.sort(),
  commands: out,
};

fs.writeFileSync(path.join(root, "data", "engine.json"), JSON.stringify(engine, null, 1) + "\n");
console.log(`engine.json: ${engine.meta.commands} commands, ${added.length} added, ${removed.length} removed (game ${version})`);
