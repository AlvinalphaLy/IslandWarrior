import type { NarrationCard } from './narration';

/** Original dialogue, organized by game trigger; no scene layout or combat rules live in this file. */
export const VOYAGE_BEATS: Record<string, NarrationCard[]> = {
  voyage_departure: [
    {
      key: 'voyage_departure_1',
      speaker: 'Narrator',
      voice: 'narrator',
      text: 'Troy burns behind the horizon. You climb aboard the black ship, carrying one promise through the smoke: bring your people home to Ithaca.',
    },
    {
      key: 'voyage_departure_2',
      speaker: 'The Oracle',
      voice: 'oracle',
      text: 'The war is over, Odysseus. The journey is not. Your water jars are nearly empty. Follow the coast to the island sanctuary, and take only what your crew needs.',
    },
  ],
  voyage_landfall: [
    {
      key: 'voyage_landfall_1',
      speaker: 'Narrator',
      voice: 'narrator',
      text: 'Green slopes rise above a quiet shore. There is fresh water inland, fruit beneath the trees, and a stone woman watching from the sanctuary. No one comes to greet you.',
    },
  ],
  voyage_food: [
    {
      key: 'voyage_food_1',
      speaker: 'Odysseus',
      voice: 'narrator',
      text: 'Water first. Then food for every oarsman. We came here to keep the crew alive, not to win another war.',
    },
  ],
  voyage_treasure: [
    {
      key: 'voyage_treasure_1',
      speaker: 'Narrator',
      voice: 'narrator',
      text: 'A trail of bronze glints beneath the vines. Enough wealth to repair the ship, perhaps. Your men follow it toward the stone woman, leaving their empty water jars behind.',
    },
  ],
  voyage_challenge: [
    {
      key: 'voyage_challenge_1',
      speaker: 'Narrator',
      voice: 'narrator',
      text: 'The sanctuary opens into a grotto. A voice offers a feast, a warm bed, and a life without storms. Then your scouts stop answering. Shadows gather where your companions stood.',
    },
    {
      key: 'voyage_challenge_2',
      speaker: 'The Oracle',
      voice: 'oracle',
      text: 'This is Aeaea, the island of Circe. Do not trust the feast. Find the pale herb called moly. Carry it back to the ship before this welcome becomes a prison.',
    },
  ],
  voyage_first_victory: [
    {
      key: 'voyage_first_victory_1',
      speaker: 'Narrator',
      voice: 'narrator',
      text: 'The enchantment falters. For a moment you hear your crew calling beyond the stone. Fighting has bought you time, but it has not broken the spell. Keep looking for the moly.',
    },
  ],
  voyage_moly: [
    {
      key: 'voyage_moly_1',
      speaker: 'Narrator',
      voice: 'narrator',
      text: 'Beneath the treasure lies a white flower with a black root. Moly. Its scent cuts through the sweetness in the air, and you remember every name on your ship.',
    },
    {
      key: 'voyage_moly_2',
      speaker: 'The Oracle',
      voice: 'oracle',
      text: 'You have what you came to find. Leave the golden cups. Bring the herb to the boat. A captain returns with his people, not merely with a story of his own courage.',
    },
  ],
  voyage_departure_aeaea: [
    {
      key: 'voyage_departure_aeaea_1',
      speaker: 'Narrator',
      voice: 'narrator',
      text: 'You return to the black ship with the moly. Your men wake as if from a fever. Water jars are filled, bread is shared, and the oars find their rhythm again.',
    },
    {
      key: 'voyage_departure_aeaea_2',
      speaker: 'The Oracle',
      voice: 'oracle',
      text: 'One island behind you. A long sea ahead. Remember the cost of a welcome that asks you to forget home. Ithaca is still waiting.',
    },
  ],
};
