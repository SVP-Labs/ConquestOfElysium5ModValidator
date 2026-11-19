import { atFileStart } from "../diagnostics.js";

/**
 * The two commands every mod must carry: an icon and a description.
 * Without `icon` the game stops at the mod with "no icon command found (or empty
 * icon command)" (tested in CoE5 5.43, 2026-11-18).
 *
 * Only meaningful for a whole mod, so this stays quiet unless the caller says
 * it is looking at one. A single .c5m pulled out of a larger mod is allowed to
 * be missing them.
 */

export const levels = {
  "missing-icon": "error",
  "missing-description": "error",
};

const REQUIRED = [
  { command: "icon", rule: "missing-icon" },
  { command: "description", rule: "missing-description" },
];

export function check({ statements, options }, bag) {
  if (!options.mod) return;

  const present = new Set(statements.map((statement) => statement.name));

  for (const { command, rule } of REQUIRED) {
    if (present.has(command)) continue;

    bag.report({
      rule,
      at: atFileStart,
      message: `mod has no \`${command}\` command`,
      hint:
        command === "icon"
          ? 'the game refuses to load the mod: "no icon command found (or empty icon command)"'
          : "icon and description are required for every mod",
    });
  }
}
