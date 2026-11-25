import { advanceBullets, combatStep } from 'space-flight-shared/world';
import type { SnapshotMessage } from 'space-flight-shared/protocol';
import type { CombatInput, EntityId } from 'space-flight-shared/types';

export function reconcileSnapshot(
  snapshot: SnapshotMessage,
  playerId: EntityId,
  pending: readonly CombatInput[],
  predictionEnabled: boolean
) {
  let ship = snapshot.ships.find(candidate => candidate.id === playerId);
  if (!ship) return undefined;

  const remaining = pending.filter(input => input.seq > snapshot.lastProcessedSeq);
  let bullets = snapshot.bullets.filter(bullet => bullet.owner === playerId);

  if (predictionEnabled) {
    for (const input of remaining) {
      const next = combatStep(ship, input);
      ship = next.ship;
      bullets = advanceBullets(bullets, next.bullet);
    }
  }

  return { ship, bullets, pending: remaining };
}
