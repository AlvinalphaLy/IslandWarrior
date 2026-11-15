export interface DialogEntry {
  name: string;
  lines: string[];
}

/** Placeholder dialog, keyed by the `dialog` property on Spawns objects in the map. */
export const DIALOG: Record<string, DialogEntry> = {
  mira: { name: 'Mira', lines: ['Morning, warrior! The flowers by my door finally bloomed.', 'If you head east past the cliffs, the forest road leads to the other houses.'] },
  tobin: { name: 'Old Tobin', lines: ['Sit by the fire a while.', 'In my day, the island had no bridges. We swam. Both ways.'] },
  pip: { name: 'Pip', lines: ['Shh! I am counting the flowers in this garden.', '...thirty-one, thirty-two... oh, you made me lose count!'] },
  kai: { name: 'Kai', lines: ['The crabs on this beach are friendlier than they look.', 'Try the pier on the west side, the little islet is great for fishing.'] },
  wren: { name: 'Wren', lines: ['The road north goes deep into the orchard.', 'Help yourself to an apple, just not the purple ones.'] },
  sign_0: { name: 'Sign', lines: ['North: Orchard Road.'] },
  sign_1: { name: 'Sign', lines: ['Village Square ->'] },
  sign_2: { name: 'Sign', lines: ['Beach. Mind the crabs.'] },
  sign_3: { name: 'Sign', lines: ['Fishing spot. Patience required.'] },
  sign_4: { name: 'Sign', lines: ['Welcome to the island!'] },
  sign_5: { name: 'Sign', lines: ['Garden. Please keep off the flowers.'] },

  // ---- cave (under every house) ----
  fungus_king: { name: 'Fungus King', lines: ['So. A surface-dweller finds the way down through a cellar.', 'Every house on your island sits upon my kingdom. Tread softly, warrior.'] },
  fungus_red: { name: 'Rufus', lines: ['Spores! Spores everywhere! ...Sorry, that was me.'] },
  fungus_violet: { name: 'Violet', lines: ['Do not step into the chasms. Nobody who fell has ever written back.'] },
  fungus_ghost: { name: 'Wisp', lines: ['Ooooo... I used to be a mushroom like you.', '...You are not a mushroom? How rude.'] },
  cleric: { name: 'Sister Ada', lines: ['We fled the sewers and found shelter down here.', 'The Fungus King tolerates us, as long as we bring him compost.'] },
  refugee1: { name: 'Bram', lines: ['Mind the crates, they hold everything we own.'] },
  refugee3: { name: 'Nell', lines: ['The ladder by the pickaxes goes back up to the surface.'] },
  chest_0: { name: 'Chest', lines: ['You found a glowing spore!'] },
  chest_1: { name: 'Chest', lines: ['You found an old map of the sewers.'] },

  // ---- sewer dungeon ----
  chest_golem: { name: 'Treasure', lines: ["The Gumball Golem's hoard! You found the Sewer Crown."] },
};

export function dialogFor(key: string): DialogEntry {
  return DIALOG[key] ?? { name: '???', lines: ['...'] };
}
