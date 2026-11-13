import { engine, engineFacts, lookupCommand } from "../catalog.js";
import { atCommand } from "../diagnostics.js";
import { label, openerFor } from "../sections.js";

/**
 * Is this command talking to the right kind of object.
 *
 * `hometerr` inside a ritual block is not a syntax error and the engine will
 * not say a word about it; the line simply lands somewhere it makes no sense.
 */

export const levels = {
  "wrong-section": "error",
  "no-active-object": "error",
};

export function check({ statements }, bag) {
  for (const statement of statements) {
    const spec = lookupCommand(statement.name);
    if (!spec) continue; // the commands rule has already said so

    // Where the game binary says where a command is accepted, that wins over
    // the manual and the rips. Openers and closers move the pointer themselves.
    const facts = statement.opens || statement.closes ? null : engineFacts(statement.name);
    const sections = facts?.sections.length ? facts.sections : spec.sections;

    // Mod level commands (icon, description, sample, translation) set global
    // state instead of touching the active object, so they are legal anywhere.
    // Flagging `icon` inside a monster block would be a false positive.
    if (sections.includes("mod")) continue;

    if (statement.section === null) {
      bag.report({
        rule: "no-active-object",
        at: atCommand(statement),
        message: `\`${statement.name}\` needs an active ${sections.map(label).join(" or ")} but none has been selected`,
        hint: `open one first, for example ${openerFor(sections[0])}`,
      });
      continue;
    }

    if (!sections.includes(statement.section)) {
      bag.report({
        rule: "wrong-section",
        at: atCommand(statement),
        message: `\`${statement.name}\` applies to ${sections.map(label).join("/")}, but the active object is a ${label(statement.section)}`,
        hint: facts ? rejection(statement) : undefined,
      });
    }
  }
}

function rejection(statement) {
  return statement.section === "event"
    ? `CoE5 ${engine.meta.game} skips it inside events and logs "No event command called: ${statement.name}"`
    : `CoE5 ${engine.meta.game} stops loading the mod with "mod command '${statement.name}' did nothing"`;
}
