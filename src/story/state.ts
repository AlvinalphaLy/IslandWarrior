/** The playable first island is an Odyssey-inspired adaptation of Aeaea, Circe's island. */
export type VoyageStage = 'harbor' | 'sailing' | 'landfall' | 'grotto' | 'returning' | 'complete';
export type LandingReason = 'food' | 'treasure';
export type VoyageEvent =
  | { type: 'board' }
  | { type: 'landfall'; island: 'aeaea' }
  | { type: 'choose_reason'; reason: LandingReason }
  | { type: 'enter_grotto' }
  | { type: 'victory'; enemy: string }
  | { type: 'recover_moly' };
export interface VoyageProgress {
  version: 1;
  stage: VoyageStage;
  reason: LandingReason;
  defeated: string[];
  hasMoly: boolean;
  seen: string[];
}
export interface VoyageTransition {
  progress: VoyageProgress;
  beats: string[];
}
export const newVoyage = (): VoyageProgress => ({
  version: 1,
  stage: 'harbor',
  reason: 'food',
  defeated: [],
  hasMoly: false,
  seen: [],
});

/** Advance only from verified game events; replayed hooks never repeat a story beat or grant inventory. */
export function advanceVoyage(current: VoyageProgress, event: VoyageEvent): VoyageTransition {
  let progress = { ...current, defeated: [...current.defeated], seen: [...current.seen] };
  const beats: string[] = [];
  const emit = (key: string) => {
    if (!progress.seen.includes(key)) {
      progress.seen.push(key);
      beats.push(key);
    }
  };

  switch (event.type) {
    case 'board':
      if (progress.stage === 'harbor') {
        progress.stage = 'sailing';
        emit('voyage_departure');
      } else if (progress.stage === 'returning' && progress.hasMoly) {
        progress.stage = 'complete';
        emit('voyage_departure_aeaea');
      }
      break;
    case 'landfall':
      if (progress.stage === 'sailing') {
        progress.stage = 'landfall';
        emit('voyage_landfall');
      }
      break;
    case 'choose_reason':
      if (
        progress.stage === 'landfall' &&
        !progress.seen.some((key) => key === 'voyage_food' || key === 'voyage_treasure')
      ) {
        progress.reason = event.reason;
        emit(`voyage_${event.reason}`);
      }
      break;
    case 'enter_grotto':
      if (progress.stage === 'sailing' || progress.stage === 'landfall') {
        emit('voyage_landfall');
        progress.stage = 'grotto';
        emit(`voyage_${progress.reason}`);
        emit('voyage_challenge');
      }
      break;
    case 'victory':
      if (progress.stage === 'grotto' && !progress.defeated.includes(event.enemy)) {
        progress.defeated.push(event.enemy);
        emit('voyage_first_victory');
      }
      break;
    case 'recover_moly':
      if (progress.stage === 'grotto') {
        progress.hasMoly = true;
        progress.stage = 'returning';
        emit('voyage_moly');
      }
      break;
  }

  return { progress, beats };
}

/** UI-independent objective text; the teammate decides where and how to display it. */
export function voyageObjective(progress: VoyageProgress): string {
  switch (progress.stage) {
    case 'harbor':
      return 'Board the black ship and begin the voyage home.';
    case 'sailing':
      return 'Find Circe’s island sanctuary. The crew needs fresh water and food.';
    case 'landfall':
      return progress.reason === 'food'
        ? 'Search the sanctuary for supplies.'
        : 'Follow the bronze markers toward the hidden hoard.';
    case 'grotto':
      return 'Survive the enchanted grotto and recover the moly in its chest.';
    case 'returning':
      return 'Bring the moly back to the black ship.';
    case 'complete':
      return 'Aeaea is behind you. The next island remains ahead; Ithaca is not reached yet.';
  }
}
