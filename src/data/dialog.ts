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
  cyclops_head: {
    name: 'Head of Polyphemus',
    lines: [
      'Words are scratched into the stone brow: "Nobody did this to me."',
      'The open jaw breathes wine and the smell of sheep. You climb down into the dark...',
    ],
  },
  cyclops_head_awaken: {
    name: 'Polyphemus',
    lines: [
      '"Wine... strong, sweet wine! More, little stranger. What is your name?"',
      '"Nobody," you answer. The stone jaw grinds open onto a cave below. Press E at the head to enter.',
    ],
  },
  // ---- the Laestrygonians: the giant's fist on the narrow islet, and their harbour (src/entities/Harbor.ts) ----
  homer: {
    name: 'Homer',
    lines: [
      '"...to Telepylus, land of the Laestrygonians, and its harbour ringed with sheer cliffs."',
      'The golden lyre rings. A wave lifts the ship and sweeps it into the tale...',
    ],
  },
  homer_awaken: {
    name: 'Homer',
    lines: [
      'The blind poet\'s stone lyre turns to gold. "Sing to me, Muse, of the man of many turns..."',
      '"...and of the giants who hurled boulders from the cliffs." Press E at Homer to sail into the tale.',
    ],
  },
  harbor_intro: {
    name: 'Telepylus',
    lines: [
      'Giants on the cliffs! Watch for the shadows on the water, and sail south out of the harbour mouth!',
    ],
  },
  // the homecoming outro (MapScene.startHomecoming): Mira welcomes Odysseus home after all three trials
  homecoming_mira: {
    name: 'Mira',
    lines: [
      'Odysseus! The whole island watched the sea for your sail.',
      "The witch, the Cyclops and the giants of Telepylus... they're telling the story in the square already.",
      'Welcome home to Ithaca.',
    ],
  },
  // ---- the cave of Polyphemus (tools/build_cyclops_cave.py, src/entities/Archery.ts) ----
  // Antinous, a suitor straining at the unstrung bow; talking to him starts the string-the-bow mini-game
  suitor_intro: {
    name: 'Antinous',
    lines: [
      'Hnngh! This cursed bow of Odysseus... I pull with all my strength and it only bends the wrong way!',
      'You, beggar? Ha! Go on then, try. A recurve is not a longbow, they say. Bend it back against its curve... if you can.',
    ],
  },
  suitor_laughs: {
    name: 'Antinous',
    lines: ['Ha! It sprang right back at you. Nobody strings that bow. Try again, if your arms can take it.'],
  },
  suitor_amazed: {
    name: 'Antinous',
    lines: [
      'It... it bent? You strung it, without even straining?',
      'You did not force it forward like a longbow. You bent it back, with the curve. Who ARE you?',
    ],
  },
  suitor_after: {
    name: 'Antinous',
    lines: ['That bow knew its master. Go on, the axes are waiting below. I will just... stand here.'],
  },
  bow_found: {
    name: 'The bow of Odysseus',
    lines: [
      'Your great bow, the one no other man can string!',
      'Press F to shoot (on touch: the Bow button).',
      'Below is the test of the axes: six axes in a row, each with a ring at the top, and a boulder sealing the den.',
      'Stand on the chalk mark where the gold arrow bounces and press F. Your arrow will fly through every ring into the bronze target.',
    ],
  },
  chest_cyclops: {
    name: "Polyphemus' hoard",
    lines: ['Cheeses, fleeces, wine jars... and a flask of ambrosia, hidden from his own flock.'],
  },
  horse_statue: {
    name: 'Wooden Horse',
    lines: [
      'A great horse carved from ship timber, rearing toward the sea.',
      'The plaque reads: "Beware of Greeks bearing gifts."',
    ],
  },

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
  circe_statue: {
    name: 'Statue of Circe',
    lines: [
      'A stone witch stands in a cloud of black smoke. Her eyes glow violet.',
      'The smoke curls around you and pulls you down into the dark...',
    ],
  },
  circe_awaken: {
    name: 'Circe',
    lines: [
      'Gold for the greedy, smoke for the fool...',
      'A stone witch rises where the treasure stood. Her eyes burn violet. Press E at her statue to enter her grotto.',
    ],
  },
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
