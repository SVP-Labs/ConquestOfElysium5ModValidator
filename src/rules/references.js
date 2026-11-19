import { referenceArgs } from "../args.js";
import { atToken } from "../diagnostics.js";
import { label } from "../sections.js";

/**
 * Does the thing this argument names actually exist, and does it exist yet.
 *
 * Names resolve against the base game plus whatever the mod has defined *above*
 * the line doing the referring. Order matters: mod commands run top to bottom,
 * so a name defined further down does not exist yet when the line runs.
 */

const KINDS = ["monster", "weapon", "item", "ritual", "class"];

/**
 * The manual singles out one forward reference: "modding a new weapon must be
 * done before assigning it to a new monster (or an existing monster) or the mod
 * will crash". It keeps its own rule id, `use-before-define`, so it can stay
 * loud while `forward-reference` is turned down.
 *
 * It does not crash. Tested in CoE5 5.43 (2026-11-18): a monster naming a weapon
 * defined further down loads and plays; the game cannot find the weapon yet and
 * ignores the line, so the monster simply lacks that attack. Still an error:
 * the line does nothing.
 */
const MANUAL_FORWARD_REFERENCES = [{ ref: "weapon", section: "monster" }];

export const levels = {
  "unknown-monster": "error",
  "unknown-weapon": "error",
  "unknown-item": "error",
  "unknown-ritual": "error",
  "unknown-class": "error",
  "use-before-define": "error",
  "forward-reference": "error",
  "bad-offset": "warning",
};

export function check({ statements, registry }, bag) {
  for (const { statement, token, arg } of referenceArgs(statements, KINDS)) {
    // Weapons and a few others also accept a raw engine index, which is a
    // different question and not one this rule answers.
    if (token.type !== "string") continue;

    const kind = arg.ref;
    const found = registry.resolve(kind, token.value);
    const at = atToken(statement, token);

    if (!found.known) {
      bag.report({
        rule: `unknown-${kind}`,
        at,
        message: `no ${label(kind)} named "${token.value}"`,
        hint: "not in the base game and not defined earlier in this mod",
      });
      continue;
    }

    if (isForwardReference(found, statement)) {
      const named = namedByManual(kind, statement);
      bag.report({
        rule: named ? "use-before-define" : "forward-reference",
        at,
        message: `"${token.value}" is not defined until line ${found.definedAt}`,
        hint: named
          ? "the game ignores this line (the weapon does not exist yet), so the monster gets no such attack; move the weapon above it"
          : "mod commands run top to bottom, move the definition above this line",
      });
    }

    if (isOffsetOutOfRange(found)) {
      bag.report({
        rule: "bad-offset",
        at,
        message: `offset ${found.offset} but only ${found.copies} ${label(kind)}(s) named "${found.name}" are defined here`,
      });
    }
  }
}

/**
 * Base game names always exist by the time any mod line runs, so only a name
 * this mod defines can be referred to too early.
 */
function isForwardReference(found, statement) {
  return !found.inBaseGame && found.definedAt !== null && found.definedAt > statement.line;
}

function namedByManual(kind, statement) {
  return MANUAL_FORWARD_REFERENCES.some(
    (crash) => crash.ref === kind && crash.section === statement.section,
  );
}

/** Only checkable for mod defined names; the base game index is not tracked per name. */
function isOffsetOutOfRange(found) {
  return found.offset > 0 && !found.inBaseGame && found.definedAt !== null && found.offset >= found.copies;
}
