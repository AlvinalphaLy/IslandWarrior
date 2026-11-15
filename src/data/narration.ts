import { VOYAGE_BEATS } from './voyage';
/** Fixed scripts from the v2 team plan. Scene owners opt in through narrate(key). */
export type Voice =
  'narrator' | 'oracle' | 'dragon' | 'telemachus' | 'spartan' | 'achilles' | 'kalos';
export interface NarrationCard {
  key: string;
  speaker: string;
  voice: Voice;
  text: string;
}
export const NARRATION: Record<string, NarrationCard[]> = {
  intro: [
    {
      key: 'intro_1',
      speaker: 'Narrator',
      voice: 'narrator',
      text: 'Ten years we laid siege to Troy. Tonight the war ends, with a gift.',
    },
    {
      key: 'intro_2',
      speaker: 'Narrator',
      voice: 'narrator',
      text: 'The city fell. Twenty years later Odysseus is home on Ithaca, and something old has woken beneath the sea.',
    },
  ],
  telemachus: [
    {
      key: 'telemachus_1',
      speaker: 'Narrator',
      voice: 'narrator',
      text: 'Your son has waited all his life to spar with his father.',
    },
    {
      key: 'telemachus_2',
      speaker: 'Telemachus',
      voice: 'telemachus',
      text: "Go easy on me... or don't. I need to learn.",
    },
  ],
  spartan: [
    {
      key: 'spartan_1',
      speaker: 'Narrator',
      voice: 'narrator',
      text: 'The Spartan never strikes first. He waits behind his shield, then punishes. Watch the shield, not the sword.',
    },
  ],
  achilles: [
    {
      key: 'achilles_1',
      speaker: 'Narrator',
      voice: 'narrator',
      text: 'The greatest of the Greeks remembers every move you make.',
    },
    {
      key: 'achilles_2',
      speaker: 'Achilles',
      voice: 'achilles',
      text: 'Show me something new, old man.',
    },
  ],
  kalos: [
    {
      key: 'kalos_1',
      speaker: 'Kalos',
      voice: 'kalos',
      text: "A hero with coins! Swords, shields, a little luck. Everything a legend needs, nothing a legend can't afford.",
    },
  ],
  oracle: [
    {
      key: 'oracle_1',
      speaker: 'The Oracle',
      voice: 'oracle',
      text: 'I see the dragon stirring in the deep. When it wakes, I will call you. Show me your hands, so I know them.',
    },
  ],
  sail: [
    {
      key: 'sail_1',
      speaker: 'Narrator',
      voice: 'narrator',
      text: "Across the wine-dark sea to the dragon's lair. This one you cannot win alone. Call your crew.",
    },
  ],
  victory: [
    {
      key: 'victory_1',
      speaker: 'Narrator',
      voice: 'narrator',
      text: 'The dragon falls. Ithaca is safe, for one more week. Like the horse at Troy, it was not strength that won, but the crew inside. The Oracle will call again.',
    },
  ],
  defeat: [
    {
      key: 'defeat_1',
      speaker: 'Narrator',
      voice: 'narrator',
      text: 'Even Odysseus lost his ships. Visit Kalos, train, and sail again.',
    },
  ],
  unlock: [
    {
      key: 'unlock_1',
      speaker: 'Narrator',
      voice: 'narrator',
      text: 'The next door on Ithaca opens.',
    },
  ],
};

/** Original homecoming story: these cards are unlocked by live map interactions, not a movie transcript. */
NARRATION.journey = [
  {
    key: 'journey_opening_1',
    speaker: 'Narrator',
    voice: 'narrator',
    text: 'Troy is behind you. Ithaca is still beyond the horizon. You are Odysseus, and a victory means nothing if you never reach home.',
  },
  {
    key: 'journey_opening_2',
    speaker: 'The Oracle',
    voice: 'oracle',
    text: 'The sea has scattered your course across this island. Find the sailor Kai by the shore. Every person you meet may hold a piece of the way home.',
  },
  {
    key: 'journey_shore_1',
    speaker: 'Narrator',
    voice: 'narrator',
    text: 'On the shore, Kai turns a splintered oar in his hands. You recognize the wood of your own ship.',
  },
  {
    key: 'journey_shore_2',
    speaker: 'Kai',
    voice: 'narrator',
    text: 'A storm can take your sails, captain. Do not let it take your purpose. Mira keeps a garden inland. Ask her what grows where men forget their homes.',
  },
  {
    key: 'journey_lotus_1',
    speaker: 'Narrator',
    voice: 'narrator',
    text: 'Mira offers a flower sweet enough to quiet every sorrow. For a moment, you cannot remember why the name Ithaca hurts.',
  },
  {
    key: 'journey_lotus_2',
    speaker: 'Mira',
    voice: 'oracle',
    text: 'You may rest, wanderer. But a life without longing can become another prison. You set the flower down. Beneath a house, the Fungus King guards an older secret.',
  },
  {
    key: 'journey_circe_1',
    speaker: 'Narrator',
    voice: 'narrator',
    text: 'In the lantern-lit cavern, a strange king offers safety beneath the earth. You remember Circe, and companions who forgot the shape of being human.',
  },
  {
    key: 'journey_circe_2',
    speaker: 'Fungus King',
    voice: 'narrator',
    text: 'The deepest spell is the comfort you refuse to leave. If you still seek the sea, speak with Sister Ada here in the cave. She keeps watch for those who have lost their way.',
  },
  {
    key: 'journey_underworld_1',
    speaker: 'Narrator',
    voice: 'narrator',
    text: 'Sister Ada speaks the names of sailors who never returned. In her voice you hear the land of the dead, where even a king must listen.',
  },
  {
    key: 'journey_underworld_2',
    speaker: 'Sister Ada',
    voice: 'oracle',
    text: 'Carry their memory, not their chains. A guardian waits in the sewer dungeon, entered through the house on the right. Face it, and remember how cunning once freed you from the Cyclops.',
  },
  {
    key: 'journey_cyclops_1',
    speaker: 'Narrator',
    voice: 'narrator',
    text: 'The dungeon guardian falls. For a heartbeat, the darkness becomes the cave of Polyphemus, and you remember the name that saved your crew: Nobody.',
  },
  {
    key: 'journey_cyclops_2',
    speaker: 'The Oracle',
    voice: 'oracle',
    text: 'Strength opened this passage. Restraint will carry you through the next. Return to the village and seek Wren near the orchard. Listen for what the song leaves unsaid.',
  },
  {
    key: 'journey_sirens_1',
    speaker: 'Narrator',
    voice: 'narrator',
    text: 'Among the trees, a melody promises every answer you ever wanted. You remember the Sirens, the mast, and the hands that bound you to life.',
  },
  {
    key: 'journey_sirens_2',
    speaker: 'Wren',
    voice: 'oracle',
    text: 'You do not have to follow every voice that calls your name. The song passes. Old Tobin has kept a place by his fire. Go to him, and tell him where you belong.',
  },
  {
    key: 'journey_home_1',
    speaker: 'Old Tobin',
    voice: 'narrator',
    text: 'He sets another cup beside the fire. No king is announced. No trumpet sounds. You speak of Penelope, of Telemachus, of the hearth you carried through every storm.',
  },
  {
    key: 'journey_home_2',
    speaker: 'Narrator',
    voice: 'narrator',
    text: 'At last, you understand the way home. Not another conquest, but a promise kept. The sea grows quiet. Ithaca waits, and this time you know its name.',
  },
];

/** Generate only the current boat-first island story with npm run voices -- --only=voyage. */
NARRATION.voyage = Object.values(VOYAGE_BEATS).flat();
