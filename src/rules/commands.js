import { engine, engineFacts, lookupCommand, removedFromEngine, suggestCommand } from "../catalog.js";
import { describedArgs } from "../args.js";
import { atCommand, atToken } from "../diagnostics.js";
import { patterns } from "../grammar.js";

/**
 * Does the command exist, does it have the right number of arguments, and are
 * they the right shape.
 *
 * All of this is table driven. The permitted arity is often wider than the
 * manual's signature: where the shipped game data contradicts the manual, the
 * generator widens rather than picking a winner, so `power` accepts the one
 * argument the manual documents and the two every base game monster passes.
 */

export const levels = {
  "unknown-command": "error",
  "undocumented-command": "warning",
  arity: "error",
  "arg-type": "error",
  "arg-range": "warning",
  "not-in-game": "error",
  "engine-clamp": "warning",
  "engine-hazard": "error",
  "engine-quirk": "warning",
};

export function check({ statements }, bag) {
  for (const statement of statements) {
    const spec = lookupCommand(statement.name);

    if (!spec) {
      reportUnknown(statement, bag);
      continue;
    }

    if (removedFromEngine(statement.name)) {
      reportRemoved(statement, bag);
      continue;
    }

    if (!spec.documented) reportUndocumented(statement, spec, bag);
    checkArity(statement, spec, bag);
    checkEngine(statement, bag);
  }

  for (const { statement, token, arg, index } of describedArgs(statements)) {
    checkType(statement, token, arg, index, bag);
    checkRange(statement, token, arg, index, bag);
  }
}

function reportUnknown(statement, bag) {
  const suggestion = suggestCommand(statement.name);
  bag.report({
    rule: "unknown-command",
    at: atCommand(statement),
    message: `unknown command \`${statement.name}\``,
    hint: suggestion ? `did you mean \`${suggestion}\`?` : undefined,
  });
}

function reportRemoved(statement, bag) {
  bag.report({
    rule: "not-in-game",
    at: atCommand(statement),
    message: `\`${statement.name}\` is not a mod command in CoE5 ${engine.meta.game}`,
    hint: "the game's parser does not recognise it and stops with \"mod command '...' did nothing\"",
  });
}

function reportUndocumented(statement, spec, bag) {
  bag.report({
    rule: "undocumented-command",
    at: atCommand(statement),
    message: `\`${statement.name}\` is not in the modding manual`,
    hint: spec.engineOnly
      ? `the CoE5 ${engine.meta.game} game accepts it, but it is not in the manual or the base game data`
      : `used ${spec.attested} time(s) in the base game data, so the engine knows it, but its behaviour is unverified`,
  });
}

/** Bounds the game clamps to, and verified hazards, from the binary. */
function checkEngine(statement, bag) {
  const facts = engineFacts(statement.name);
  if (!facts) return;

  for (const { index, min, max, sections } of facts.clamps ?? []) {
    if (!sections.includes(statement.section)) continue;
    const token = statement.args[index];
    if (token?.type !== "number") continue;
    if ((min === null || token.value >= min) && (max === null || token.value <= max)) continue;
    const bounds = min !== null && max !== null ? `${min}-${max}` : min !== null ? `at least ${min}` : `at most ${max}`;
    bag.report({
      rule: "engine-clamp",
      at: atToken(statement, token),
      message: `argument ${index + 1} of \`${statement.name}\` is ${token.value}, but the game only takes ${bounds}`,
      hint: `CoE5 ${engine.meta.game} clamps or ignores values outside that range`,
    });
  }

  const quirk = facts.quirk;
  if (!quirk) return;
  if (quirk.when) {
    const pattern = new RegExp(quirk.when);
    if (!statement.args.some((token) => token.type === "string" && pattern.test(token.value))) return;
  }
  bag.report({
    rule: quirk.level === "error" ? "engine-hazard" : "engine-quirk",
    at: atCommand(statement),
    message: quirk.message,
    hint: `verified against the CoE5 ${engine.meta.game} game binary`,
  });
}

function checkArity(statement, spec, bag) {
  const given = statement.args.length;
  const { min, max } = spec.arity;
  if (given >= min && given <= max) return;

  // Point at the first surplus argument if there is one, otherwise at the
  // command itself, which is where a missing argument should have gone.
  const surplus = statement.args[max];
  const expected = min === max ? `${min}` : `${min}-${max}`;

  bag.report({
    rule: "arity",
    at: surplus ? atToken(statement, surplus) : atCommand(statement),
    message: `\`${statement.name}\` takes ${expected} argument(s), got ${given}`,
    hint: spec.signature ? `${statement.name} ${spec.signature}` : undefined,
  });
}

const TOKEN_TYPES = { string: "str", number: "int", word: "word" };
const DESCRIBE = { str: "a string", int: "a number", word: "a bare word" };

function checkType(statement, token, arg, index, bag) {
  const actual = TOKEN_TYPES[token.type];
  if (!actual || arg.types.includes(actual)) return;

  bag.report({
    rule: "arg-type",
    at: atToken(statement, token),
    message: `argument ${index + 1} (${arg.name}) should be ${arg.types.join(" or ")}, got ${DESCRIBE[actual]}`,
    hint: typeHint(statement, token, actual, index),
  });
}

function typeHint(statement, token, actual, index) {
  const next = statement.args[index + 1];

  // `2:"Spearman"` instead of `"2:Spearman"`. Frequent enough to be worth naming.
  if (token.type === "word" && next?.type === "string" && patterns.offsetOutsideQuotes.test(token.raw)) {
    return `the offset goes inside the quotes: "${token.raw}${next.value}"`;
  }

  return actual === "word" ? `quote it if it is text: "${token.raw}"` : undefined;
}

function checkRange(statement, token, arg, index, bag) {
  if (token.type !== "number" || arg.min === undefined) return;
  if (token.value >= arg.min && token.value <= arg.max) return;

  bag.report({
    rule: "arg-range",
    at: atToken(statement, token),
    message: `argument ${index + 1} (${arg.name}) is documented as ${arg.min}-${arg.max}, got ${token.value}`,
  });
}
