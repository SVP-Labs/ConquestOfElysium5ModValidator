import { referenceArgs } from "../args.js";
import { atToken } from "../diagnostics.js";
import { baseGameClass, baseGameTerrain, isBaseGameRitualSchool, resourceTypes } from "../catalog.js";

/**
 * Arguments that are numbers with a meaning: terrain, class, ritual school,
 * resource type, player.
 *
 * These are not free integers. Each indexes a table, and a number outside its
 * table is either ignored by the engine or lands on something the author never
 * intended.
 */

const KINDS = ["terrain", "classnbr", "ritpow", "resource", "player"];

/**
 * Manual p40. 0-23 are real players, 24-30 the special factions (independents,
 * horrors, Hades, the Kingdom), and -1 to -4 are contextual: everyone, the
 * event player, the square owner, the army owner.
 */
const PLAYER_RANGE = { min: -4, max: 30 };

/** Terrains 0-499 belong to the base game, 500-1999 are the modder's to create (5.42 raised the cap from 1000). */
const MOD_TERRAIN_RANGE = { min: 500, max: 1999 };

export const levels = {
  "unknown-terrain": "warning",
  "unknown-class": "error",
  "unknown-ritpow": "warning",
  "bad-resource-type": "error",
  "bad-player": "warning",
};

const CHECKS = {
  terrain: checkTerrain,
  classnbr: checkClassNumber,
  ritpow: checkRitualSchool,
  resource: checkResourceType,
  player: checkPlayer,
};

export function check({ statements, registry }, bag) {
  for (const { statement, token, arg } of referenceArgs(statements, KINDS)) {
    if (token.type !== "number") continue;
    CHECKS[arg.ref](token.value, atToken(statement, token), registry, bag);
  }
}

function checkTerrain(number, at, registry, bag) {
  // Negative numbers address terrain *groups*, a separate namespace this does
  // not track.
  if (number < 0) return;
  if (baseGameTerrain(number) !== undefined || registry.definesTerrain(number)) return;

  const inModRange = number >= MOD_TERRAIN_RANGE.min && number <= MOD_TERRAIN_RANGE.max;

  bag.report({
    rule: "unknown-terrain",
    at,
    message: `terrain ${number} is neither a base game terrain nor created by this mod`,
    hint: inModRange
      ? "select it with selectterr first"
      : number > MOD_TERRAIN_RANGE.max
        ? `the game has terrains 0-${MOD_TERRAIN_RANGE.max} only`
        : "base game terrains are 0-499",
  });
}

function checkClassNumber(number, at, registry, bag) {
  if (baseGameClass(number) !== undefined) return;

  bag.report({
    rule: "unknown-class",
    at,
    message: `class ${number} does not exist in the base game`,
    hint: "use newclass to add one, selectclass only reaches the built in classes",
  });
}

function checkRitualSchool(number, at, registry, bag) {
  // Positive numbers name a base game school. Zero and below are relative back
  // references to schools this mod created with newritpow.
  const known = number > 0 ? isBaseGameRitualSchool(number) : registry.definesRitualSchool(number);
  if (known) return;

  bag.report({
    rule: "unknown-ritpow",
    at,
    message:
      number > 0
        ? `ritual school ${number} is not one the base game defines`
        : `${number} refers to a ritual school this mod never creates`,
    hint: "0 means the last newritpow, -1 the one before it, and so on",
  });
}

function checkResourceType(number, at, registry, bag) {
  if (number >= 0 && number < resourceTypes.length) return;

  bag.report({
    rule: "bad-resource-type",
    at,
    message: `resource type ${number} is out of range 0-${resourceTypes.length - 1}`,
    hint: resourceTypes.map((name, index) => `${index}=${name}`).join(", "),
  });
}

function checkPlayer(number, at, registry, bag) {
  if (number >= PLAYER_RANGE.min && number <= PLAYER_RANGE.max) return;

  bag.report({
    rule: "bad-player",
    at,
    message: `player ${number} is outside ${PLAYER_RANGE.min}-${PLAYER_RANGE.max}`,
    hint: "0-23 players, 24 independents, 30 kingdom, -1 everyone, -2 event player, -3 square owner, -4 army owner",
  });
}
