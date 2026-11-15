/** Session progression for the implemented Odyssey islands; challenge mechanics own their rewards. */
export type VoyageStage = 'harbor' | 'sailing' | 'landfall' | 'grotto' | 'returning' | 'complete';
export type ChallengeId = 'circe' | 'cyclops' | 'telepylus';
export type LandingReason = 'food' | 'treasure';
export type VoyageEvent =
  | { type: 'board' }
  | { type: 'landfall'; island: 'aeaea' }
  | { type: 'choose_reason'; reason: LandingReason }
  | { type: 'enter_grotto' }
  | { type: 'victory'; enemy: string }
  | { type: 'recover_moly' }
  | { type: 'enter_challenge'; island: ChallengeId }
  | { type: 'challenge_won'; island: ChallengeId }
  | { type: 'challenge_failed'; island: ChallengeId }
  | { type: 'bow_found' };
export interface VoyageProgress {
  version: 1;
  activeChallenge?: ChallengeId;
  completedChallenges: ChallengeId[];
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
  completedChallenges: [],
  stage: 'harbor',
  reason: 'food',
  defeated: [],
  hasMoly: false,
  seen: [],
});

/** Advance only from verified game events; replayed hooks never repeat a story beat or grant inventory. */
export function advanceVoyage(current: VoyageProgress, event: VoyageEvent): VoyageTransition {
  let progress = {
    ...current,
    completedChallenges: [...(current.completedChallenges ?? [])],
    defeated: [...current.defeated],
    seen: [...current.seen],
  };
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
      } else if (
        progress.stage === 'returning' &&
        (progress.hasMoly || progress.completedChallenges.includes(progress.activeChallenge!))
      ) {
        progress.stage = 'complete';
        if (!progress.activeChallenge || progress.activeChallenge === 'circe')
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
    case 'enter_challenge': {
      if (progress.stage === 'harbor') emit('voyage_departure');
      progress.activeChallenge = event.island;
      if (progress.completedChallenges.includes(event.island)) break;
      progress.stage = 'grotto';
      if (event.island === 'circe') {
        emit('voyage_landfall');
        emit(`voyage_${progress.reason}`);
        emit('voyage_challenge');
      } else {
        emit(`${event.island}_arrival`);
      }
      break;
    }
    case 'challenge_won':
      if (
        progress.activeChallenge !== event.island ||
        progress.completedChallenges.includes(event.island)
      )
        break;
      progress.completedChallenges.push(event.island);
      progress.stage = 'returning';
      if (event.island === 'circe') progress.hasMoly = true;
      emit(`${event.island}_success`);
      break;
    case 'challenge_failed':
      if (
        progress.activeChallenge !== event.island ||
        progress.completedChallenges.includes(event.island)
      )
        break;
      progress.stage = 'sailing';
      emit(`${event.island}_failure`);
      break;
    case 'bow_found':
      if (
        progress.activeChallenge === 'cyclops' &&
        !progress.completedChallenges.includes('cyclops')
      )
        emit('cyclops_bow');
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
      if (progress.activeChallenge === 'cyclops')
        return 'Recover the bow, align the axes and bring down the boulder.';
      if (progress.activeChallenge === 'telepylus')
        return 'Watch the boulder shadows and steer south out of the harbor.';
      return 'Defeat the grotto champion to recover the moly and your challenge prize.';
    case 'returning':
      return 'Your challenge is won. Return to the black ship with your crew.';
    case 'complete':
      return `${progress.completedChallenges.length} challenge(s) won. Other islands remain ahead; Ithaca is not reached yet.`;
  }
}
