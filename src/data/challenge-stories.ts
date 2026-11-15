import type { NarrationCard } from './narration';

/** Original dialogue tied to implemented challenge mechanics and actual victory rewards. */
export const CHALLENGE_BEATS: Record<string, NarrationCard[]> = {
  cyclops_arrival: [
    {
      key: 'cyclops_arrival_1',
      speaker: 'Narrator',
      voice: 'narrator',
      text: 'The wine disappears into the stone mouth, and the cave opens. Sheep, cheese, shelter: everything a hungry crew could want. Then you see the stone that seals the way.',
    },
    {
      key: 'cyclops_arrival_2',
      speaker: 'Polyphemus',
      voice: 'dragon',
      text: 'Come closer, little stranger. Tell me your name. A guest should not hide from his host.',
    },
    {
      key: 'cyclops_arrival_3',
      speaker: 'The Oracle',
      voice: 'oracle',
      text: 'You have answered Nobody. Now let your hands be clever too. Find your bow. The marks, the axes and the stone belong to the same escape.',
    },
  ],
  cyclops_bow: [
    {
      key: 'cyclops_bow_1',
      speaker: 'The Oracle',
      voice: 'oracle',
      text: 'The bow remembers your hand. Stand on the marked ground and face the line of axes. One straight arrow can do what a hundred sword blows cannot.',
    },
  ],
  cyclops_success: [
    {
      key: 'cyclops_success_1',
      speaker: 'Narrator',
      voice: 'narrator',
      text: 'The arrow flies true. The great stone falls, and the Cyclops loses his hold on the cave. You return to the ship with Maron’s wine and a stronger heart.',
    },
    {
      key: 'cyclops_success_2',
      speaker: 'The Oracle',
      voice: 'oracle',
      text: 'Your courage has grown, but remember the name that kept your crew alive. Nobody. A quiet escape is worth more than a boast carried across the sea.',
    },
  ],
  cyclops_failure: [
    {
      key: 'cyclops_failure_1',
      speaker: 'Narrator',
      voice: 'narrator',
      text: 'The cave has beaten you back, but it has not taken your name. Recover, look again at the marks, and return when your hand is steady.',
    },
  ],
  circe_success: [
    {
      key: 'circe_success_1',
      speaker: 'Narrator',
      voice: 'narrator',
      text: 'The last song breaks. The moly is yours, and your companions remember the ship waiting beyond the grotto. You return wearing a new mantle: the FaZe Odysseus prize.',
    },
    {
      key: 'circe_success_2',
      speaker: 'The Oracle',
      voice: 'oracle',
      text: 'Wear the colors of this victory, but do not mistake them for the journey’s end. Every shore will ask you again what you are willing to leave behind.',
    },
  ],
  circe_failure: [
    {
      key: 'circe_failure_1',
      speaker: 'The Oracle',
      voice: 'oracle',
      text: 'The spell has driven you out for now. Rest, restore your strength, and return. A captain can lose a battle without surrendering the people who depend on him.',
    },
  ],
  telepylus_arrival: [
    {
      key: 'telepylus_arrival_1',
      speaker: 'Homer',
      voice: 'narrator',
      text: 'A harbor sheltered by high cliffs. A place to repair the hull and rest the oars. So the sailors thought, until the first stone fell from the heights.',
    },
    {
      key: 'telepylus_arrival_2',
      speaker: 'The Oracle',
      voice: 'oracle',
      text: 'The Laestrygonians hold the cliffs. Do not fight a mountain. Watch the shadows, change your course, and row south toward the harbor mouth.',
    },
  ],
  telepylus_success: [
    {
      key: 'telepylus_success_1',
      speaker: 'Narrator',
      voice: 'narrator',
      text: 'The last boulder falls behind the stern. In open water, the crew rebuilds the ship with bronze across her hull and a crimson sail above the oars.',
    },
    {
      key: 'telepylus_success_2',
      speaker: 'Homer',
      voice: 'narrator',
      text: 'They escaped by rowing together, not by standing alone. The stronger ship is their prize. The way to Ithaca remains a promise, not a possession.',
    },
  ],
  telepylus_failure: [
    {
      key: 'telepylus_failure_1',
      speaker: 'Narrator',
      voice: 'narrator',
      text: 'The hull gives way beneath the stones. You wash ashore alive, with the sound of falling rock still in your ears. Next time, watch the shadow before the splash.',
    },
  ],
};
