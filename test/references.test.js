import { test } from "node:test";
import assert from "node:assert/strict";
import { assertClean, firstProblem, rulesOf, CLASS_PREAMBLE } from "./helpers.js";

test("names resolve against the base game", () => {
  assertClean('newmonster "X"\nmeleeweapon 4 "Broadsword"');
  assert.deepEqual(rulesOf('newmonster "X"\nmeleeweapon 4 "Broadsord"'), ["unknown-weapon"]);
});

test("names resolve against the mod itself", () => {
  assertClean('newweapon "Grave Iron"\ndmg 7\nnewmonster "X"\nmeleeweapon 4 "Grave Iron"');
});

test("a forward reference is an error, because the game crashes on one", () => {
  const source = 'newmonster "X"\nmeleeweapon 4 "Grave Iron"\nnewweapon "Grave Iron"\ndmg 7';
  assert.deepEqual(rulesOf(source), ["use-before-define"]);
});

test("a monster a class needs before it exists is a forward reference, not the documented crash", () => {
  const source = CLASS_PREAMBLE + 'addunitrec "Warlord" 100 3 20 5 0\nnewmonster "Warlord"\nhp 10';
  assert.deepEqual(rulesOf(source), ["forward-reference"]);
});

test("a class an event needs before it exists is a forward reference", () => {
  const source =
    'squareevent\n+turnnbr 3\n+class 1 "Gravekeeper"\nendevent\n' +
    'newclass\nsetclassname "Gravekeeper"\nhometerr 30';
  assert.deepEqual(rulesOf(source), ["forward-reference"]);
});

test("forward-reference turns down without touching the documented crash", () => {
  const general = CLASS_PREAMBLE + 'addunitrec "Warlord" 100 3 20 5 0\nnewmonster "Warlord"\nhp 10';
  const softened = firstProblem(general, { severity: { "forward-reference": "warning" } });
  assert.equal(softened.rule, "forward-reference");
  assert.equal(softened.severity, "warning");

  const crash = 'newmonster "X"\nmeleeweapon 4 "Grave Iron"\nnewweapon "Grave Iron"\ndmg 7';
  assert.deepEqual(rulesOf(crash, { severity: { "forward-reference": "off" } }), [
    "use-before-define",
  ]);
});

test("matching ignores case, as the manual's own examples do", () => {
  assertClean('newritual "R"\naddstring "2d6*spearman"');
});

test("an offset past the last copy is flagged", () => {
  const source = 'newmonster "Twin"\nnewmonster "Twin"\n' + CLASS_PREAMBLE + 'addstartunits "5:Twin" 1';
  assert.ok(rulesOf(source).includes("bad-offset"));
});

test("duplicate definitions point at the offset form", () => {
  const problem = firstProblem('newmonster "Twin"\nnewmonster "Twin"');

  assert.equal(problem.rule, "duplicate-name");
  assert.match(problem.hint, /<nbr>:"Twin"/);
});

test("a renamed monster answers to both names", () => {
  assertClean('selectmonster "Baron"\nname "Warlord"\nselectclass 1\nsetmaincom "Warlord"');
  assertClean('selectmonster "Baron"\nname "Warlord"\nselectclass 1\nsetmaincom "Baron"');
});

test("name inside an item block registers an item name", () => {
  assertClean('selectitem "Ring of Protection"\nname "Bone Ring"\nnewmonster "X"\nstartitem "Bone Ring"');
});

test("setname only names terrain groups; in a ritual block the game rejects it", () => {
  assertClean('selectterrgroup -1001\nsetname "Barrows"');
  const problem = firstProblem('selectritual "Raise Dead"\nsetname "Raise Them"');
  assert.equal(problem.rule, "wrong-section");
  assert.match(problem.hint, /did nothing/);
});

test("setclassname makes the class reachable by name", () => {
  assertClean(
    'newclass\nsetclassname "Gravekeeper"\nhometerr 30\n' +
      'squareevent\n+turnnbr 3\n+class 1 "Gravekeeper"\nendevent',
  );
});

test("naming a terrain is legal even though nothing refers to terrains by name", () => {
  assertClean('selectterr 700\nname "Barrow"');
});

test("a rename onto an existing mod name is not a duplicate definition", () => {
  assertClean('newmonster "Warlord"\nhp 5\nselectmonster "Baron"\nname "Warlord"');
});

test("a typo against a renamed monster is still caught", () => {
  assert.deepEqual(rulesOf('selectmonster "Baron"\nname "Warlord"\nselectclass 1\nsetmaincom "Warlrd"'), [
    "unknown-monster",
  ]);
});

test("summon lists resolve the monsters inside them", () => {
  assertClean('newritual "R"\naddstring "1d3*Ghoul & c*Baron"');
  assert.deepEqual(rulesOf('newritual "R"\naddstring "1d3*Nonexistent Thing"'), ["summon-string"]);
});

test("reclimiter needs a sigil and a real monster", () => {
  assertClean(CLASS_PREAMBLE + 'addunitrec "Spearman" 100 3 20 5 0\nreclimiter "+Baron"');
  assert.deepEqual(
    rulesOf(CLASS_PREAMBLE + 'addunitrec "Spearman" 100 3 20 5 0\nreclimiter "Baron"'),
    ["reclimiter-string"],
  );
});

test("copy commands resolve against the kind the block defines", () => {
  assertClean('newmonster "My Golem"\ncopyspr "Stone Golem"');
  assertClean('newmonster "My Golem"\ncopystats "Stone Golem"');
  assertClean('newitem "My Brand"\ncopyspr "Frost Brand"');
  assert.deepEqual(rulesOf('newmonster "My Golem"\ncopyspr "No Such Beast"'), ["unknown-monster"]);
});
