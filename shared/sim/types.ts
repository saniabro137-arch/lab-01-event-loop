import { z } from 'zod';
import type { FlightInput, ShipMotion, Vector2 } from './ship.ts';

export const EntityIdSchema = z.number().int().min(1).max(0xffff).brand<'EntityId'>();
export const TickSchema = z.number().int().min(0).max(0xffffffff).brand<'Tick'>();
export const SeqSchema = z.number().int().min(0).max(0xffffffff).brand<'Seq'>();

export type EntityId = z.infer<typeof EntityIdSchema>;
export type Tick = z.infer<typeof TickSchema>;
export type Seq = z.infer<typeof SeqSchema>;

export interface CombatInput extends FlightInput {
  readonly seq: Seq;
  readonly fire: boolean;
}

export interface ShipSnapshot extends ShipMotion {
  readonly kind: 'ship';
  readonly id: EntityId;
  cooldown: number;
  hp: number;
  score: number;
}

export interface BulletSnapshot extends Vector2 {
  readonly kind: 'bullet';
  readonly owner: EntityId;
  readonly seq: Seq;
  readonly vx: number;
  readonly vy: number;
  readonly life: number;
}

export type EntitySnapshot = ShipSnapshot | BulletSnapshot;

export interface WorldSnapshot {
  readonly tick: Tick;
  readonly ships: readonly ShipSnapshot[];
  readonly bullets: readonly BulletSnapshot[];
}
