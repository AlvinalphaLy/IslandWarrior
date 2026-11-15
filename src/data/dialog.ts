export interface DialogEntry {
  name: string;
  lines: string[];
}

/** Placeholder dialog, keyed by the `dialog` property on Spawns objects in the map. */
export const DIALOG: Record<string, DialogEntry> = {
  mira: {
    name: 'Mira',
    lines: [
      'Morning, warrior! The flowers by my door finally bloomed.',
      'If you head east past the cliffs, the forest road leads to the other houses.',
    ],
  },
  tobin: {
    name: 'Old Tobin',
    lines: [
      'Sit by the fire a while.',
      'In my day, the island had no bridges. We swam. Both ways.',
    ],
  },
  pip: {
    name: 'Pip',
    lines: [
      'Shh! I am counting the flowers in this garden.',
      '...thirty-one, thirty-two... oh, you made me lose count!',
    ],
  },
  kai: {
    name: 'Kai',
    lines: [
      'The crabs on this beach are friendlier than they look.',
      'Try the pier on the west side, the little islet is great for fishing.',
    ],
  },
  wren: {
    name: 'Wren',
    lines: [
      'The road north goes deep into the orchard.',
      'Help yourself to an apple, just not the purple ones.',
    ],
  },
  sign_0: { name: 'Sign', lines: ['North: Orchard Road.'] },
  sign_1: { name: 'Sign', lines: ['Village Square ->'] },
  sign_2: { name: 'Sign', lines: ['Beach. Mind the crabs.'] },
  sign_3: { name: 'Sign', lines: ['Fishing spot. Patience required.'] },
  sign_4: { name: 'Sign', lines: ['Welcome to the island!'] },
  sign_5: { name: 'Sign', lines: ['Garden. Please keep off the flowers.'] },
  // the head of Polyphemus: pour the amphora of wine into its mouth (pourWine), then E at the head enters his cave
  cyclops_head: { name: 'Head of Polyphemus', lines: ["The stone jaw gapes open, breathing wine and the smell of sheep. You climb down into the dark..."] },
  cyclops_head_awaken: { name: 'Polyphemus', lines: ["\"Wine! What is your name?\" \"Nobody.\" The stone jaw grinds open: press E at the head to enter."] },
  // ---- the Laestrygonians: the giant's fist on the narrow islet, and their harbour (src/entities/Harbor.ts) ----
  homer: { name: 'Homer', lines: ["The golden lyre rings, and a wave sweeps the ship into the tale..."] },
  homer_awaken: { name: 'Homer', lines: ["Homer's stone lyre turns to gold as he sings of the giants. Press E at Homer to sail into the tale."] },
  harbor_intro: {
    name: 'Telepylus',
    lines: [
      'Giants on the cliffs! Watch for the shadows on the water, and sail south out of the harbour mouth!',
    ],
  },
  // the homecoming outro (MapScene.startHomecoming): Mira welcomes Odysseus home after all three trials
  homecoming_mira: { name: 'Mira', lines: ["Odysseus! The whole island watched the sea for your sail. Welcome home to Ithaca."] },
  // ---- the cave of Polyphemus (tools/build_cyclops_cave.py, src/entities/Archery.ts) ----
  // Antinous, a suitor straining at the unstrung bow; talking to him starts the string-the-bow mini-game
  suitor_intro: { name: 'Antinous', lines: ["\"This cursed bow only bends the wrong way! Go on, beggar: bend it back against its curve... if you can.\""] },
  suitor_laughs: {
    name: 'Antinous',
    lines: ['Ha! It sprang right back at you. Nobody strings that bow. Try again, if your arms can take it.'],
  },
  suitor_amazed: { name: 'Antinous', lines: ["\"You bent it back, with the curve, without even straining... Who ARE you?\""] },
  suitor_after: {
    name: 'Antinous',
    lines: ['That bow knew its master. Go on, the axes are waiting below. I will just... stand here.'],
  },
  bow_found: { name: 'The bow of Odysseus', lines: ["The bow of Odysseus is yours! Press F to shoot: from the chalk mark, send an arrow through every axe ring."] },
  chest_cyclops: {
    name: "Polyphemus' hoard",
    lines: ['Cheeses, fleeces, wine jars... and a flask of ambrosia, hidden from his own flock.'],
  },
  horse_statue: { name: 'Wooden Horse', lines: ["A wooden horse rearing toward the sea. The plaque reads: \"Beware of Greeks bearing gifts.\""] },

  // the ship of Odysseus: board it from the shore and sail it; the south edge of the map is the voyage to the lair
  ship_board: {
    name: 'The black ship',
    lines: [
      "All aboard! Arrows/WASD to sail, E to go ashore. The open sea to the south leads to the dragon's lair.",
    ],
  },
  ship_noland: {
    name: 'The black ship',
    lines: ['No place to land here. Sail closer to the shore.'],
  },
  ship_voyage_locked: {
    name: 'The black ship',
    lines: ["The crew won't row into the open sea for an untested captain. Defeat Achilles first."],
  },
  ship_voyage_soon: {
    name: 'The black ship',
    lines: ["The Oracle has not yet shown the way to the dragon's lair."],
  },
  ship_sail: {
    name: 'The black ship',
    lines: ["The crew takes up the oars. Across the wine-dark sea to the dragon's lair!"],
  },

  // Circe's statue on the islet: closing these lines takes you into her grotto (tools/build_dungeon.py circe)
  circe_statue: { name: 'Statue of Circe', lines: ["Black smoke curls around you and pulls you down into Circe's grotto..."] },
  circe_awaken: { name: 'Circe', lines: ["A stone witch rises where the treasure stood. Press E at her statue to enter her grotto."] },
  chest_circe: {
    name: 'Chest',
    lines: ["A sprig of moly, the herb Hermes gave Odysseus against Circe's magic."],
  },

  // ---- cave (under every house) ----
  fungus_king: {
    name: 'Fungus King',
    lines: [
      'So. A surface-dweller finds the way down through a cellar.',
      'Every house on your island sits upon my kingdom. Tread softly, warrior.',
    ],
  },
  fungus_red: { name: 'Rufus', lines: ['Spores! Spores everywhere! ...Sorry, that was me.'] },
  fungus_violet: {
    name: 'Violet',
    lines: ['Do not step into the chasms. Nobody who fell has ever written back.'],
  },
  fungus_ghost: {
    name: 'Wisp',
    lines: ['Ooooo... I used to be a mushroom like you.', '...You are not a mushroom? How rude.'],
  },
  cleric: {
    name: 'Sister Ada',
    lines: [
      'We fled the sewers and found shelter down here.',
      'The Fungus King tolerates us, as long as we bring him compost.',
    ],
  },
  refugee1: { name: 'Bram', lines: ['Mind the crates, they hold everything we own.'] },
  refugee3: { name: 'Nell', lines: ['The ladder by the pickaxes goes back up to the surface.'] },
  chest_0: { name: 'Chest', lines: ['You found a glowing spore!'] },
  chest_1: { name: 'Chest', lines: ['You found an old map of the sewers.'] },

  // ---- sewer dungeon ----
  chest_golem: {
    name: 'Treasure',
    lines: [
      "Polyphemus' hoard! Among the cheeses and wine jars lies a bronze helmet fit for a king of Ithaca.",
    ],
  },
};

export function dialogFor(key: string): DialogEntry {
  return DIALOG[key] ?? { name: '???', lines: ['...'] };
}
