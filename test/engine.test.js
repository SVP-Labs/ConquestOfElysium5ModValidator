import { test } from "node:test";
import assert from "node:assert/strict";
import { lintSource } from "../src/linter.js";
import { assertClean, firstProblem, rulesOf } from "./helpers.js";

test("a catalog command the game does not recognise is an error", () => {
  const problem = firstProblem('newmonster "X"\nwander2 10');
  assert.equal(problem.rule, "not-in-game");
  assert.match(problem.hint, /did nothing/);
});

test("a command only the game knows is accepted with a warning", () => {
  assert.deepEqual(rulesOf('newmonster "X"\nholyvengeance 5'), ["undocumented-command"]);
});

test("the game decides where a command is accepted", () => {
  const problem = firstProblem('newweapon "X"\nhp 10');
  assert.equal(problem.rule, "wrong-section");
  assert.match(problem.hint, /mod command 'hp' did nothing/);
  assertClean('newmonster "X"\nhp 10');
  assertClean('newitem "X"\nhp 10'); // an item hp bonus, through a second handler
});

test("inside an event the game logs instead of stopping", () => {
  const problem = firstProblem("playerevent\nhp 10\nendevent");
  assert.equal(problem.rule, "wrong-section");
  assert.match(problem.hint, /No event command called/);
});

test("values the game clamps are flagged", () => {
  assert.deepEqual(rulesOf('newmonster "X"\nhp 0'), ["engine-clamp"]);
  assertClean('newmonster "X"\nhp 1');
});

test("verified hazards are reported", () => {
  assert.ok(rulesOf("playerevent\nremoveanimalcorpses 3\nendevent").includes("engine-hazard"));
  assert.ok(rulesOf("playerevent\n+hascom 1 \"Baron\"\nendevent").includes("engine-quirk"));
});

test("a hazard tested in the real game says so; one read from code says that", () => {
  const tested = lintSource("playerevent\nremoveanimalcorpses 3\nendevent").find((p) => p.rule === "engine-hazard");
  assert.match(tested.hint, /tested in the real game, CoE5 5\.\d+/);
  const read = lintSource('playerevent\n+hascom 1 "Baron"\nendevent').find((p) => p.rule === "engine-quirk");
  assert.match(read.hint, /read from the CoE5 5\.\d+ game code/);
});

test("the weapon-before-monster hint says the line is ignored, not that it crashes", () => {
  const problem = lintSource('newmonster "X"\nmeleeweapon 4 "Later Blade"\n\nnewweapon "Later Blade"\ndmg 3').find((p) => p.rule === "use-before-define");
  assert.match(problem.hint, /ignores this line/);
  assert.doesNotMatch(problem.hint, /crash/);
});

test("a quirk with a condition only fires when it matches", () => {
  assert.ok(rulesOf('playerevent\nnewunits -2 "100*Spearman"\nendevent').includes("engine-quirk"));
  assert.ok(!rulesOf('playerevent\nnewunits -2 "12*Spearman"\nendevent').includes("engine-quirk"));
});

test("terrain numbers above 1999 do not exist", () => {
  const problem = firstProblem("selectterr 2500");
  assert.equal(problem.rule, "unknown-terrain");
  assert.match(problem.hint, /0-1999/);
  assertClean("selectterr 1500");
});

test("mod terrains go up to 1999", () => {
  assertClean("selectterr 1800\nname \"Barrow\"\nnewclass\nsetclassname \"C\"\nhometerr 1800");
});
