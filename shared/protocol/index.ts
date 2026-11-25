import { z } from 'zod';
import { EntityIdSchema, SeqSchema, TickSchema } from '../sim/types.ts';

export const VERSION = 1;
export const INPUT = 1;
export const SNAPSHOT = 2;
export const MAX_PLAYERS = 4;
export const MAX_BULLETS = MAX_PLAYERS * 5;
export const THRUST = 1;
export const LEFT = 2;
export const RIGHT = 4;
export const FIRE = 8;
export const MAX_BATCH = 8;

export const RoomNameSchema = z.string().regex(/^[a-zA-Z0-9_-]{1,32}$/);
export const PlayerNameSchema = z.string().max(32).trim().min(1);
export const CodecSchema = z.enum(['json', 'binary']);

const actions = z.array(z.object({
  seq: SeqSchema.refine(seq => seq > 0),
  buttons: z.number().int().min(0).max(15)
})).min(1).max(MAX_BATCH).refine(
  inputs => inputs.every((input, index) => input.seq > (inputs[index - 1]?.seq ?? 0)),
  'Input sequence must increase'
);

export const InputMessageSchema = z.object({
  type: z.literal('input'),
  inputs: actions
});

export const ClientMessageSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('join'),
    name: PlayerNameSchema,
    room: RoomNameSchema,
    game: z.boolean().optional(),
    codec: CodecSchema.nullish()
  }),
  z.object({
    type: z.literal('chat'),
    text: z.string().max(500).trim().min(1)
  }),
  z.object({ type: z.literal('leave') }),
  z.object({ type: z.literal('ping'), sent: z.number().nonnegative() }),
  InputMessageSchema
]);

export type ClientMessage = z.infer<typeof ClientMessageSchema>;
export type InputMessage = z.infer<typeof InputMessageSchema>;

export function parseClientMessage(value: unknown) {
  return ClientMessageSchema.safeParse(value);
}

export function parseClientJSON(text: string) {
  try {
    const value: unknown = JSON.parse(text);
    return parseClientMessage(value);
  } catch {
    return parseClientMessage(undefined);
  }
}

export function validInputs(value: unknown): boolean {
  return z.object({ inputs: actions }).safeParse(value).success;
}

const motion = {
  x: z.number().min(0).max(1000),
  y: z.number().min(0).max(600),
  vx: z.number(),
  vy: z.number()
};

const ShipSchema = z.object({
  kind: z.literal('ship'),
  id: EntityIdSchema,
  ...motion,
  angle: z.number().min(-3.142).max(3.142),
  thrust: z.boolean(),
  cooldown: z.number().int().min(0).max(8),
  hp: z.number().int().min(1).max(3),
  score: z.number().int().min(0).max(0xffffffff)
});

const BulletSchema = z.object({
  kind: z.literal('bullet'),
  owner: EntityIdSchema,
  seq: SeqSchema.refine(seq => seq > 0),
  ...motion,
  life: z.number().int().min(1).max(36)
});

export const EntitySchema = z.discriminatedUnion('kind', [ShipSchema, BulletSchema]);

export const SnapshotSchema = z.object({
  type: z.literal('snapshot'),
  tick: TickSchema,
  lastProcessedSeq: SeqSchema,
  time: z.number().nonnegative(),
  ships: z.array(ShipSchema).max(MAX_PLAYERS).readonly(),
  bullets: z.array(BulletSchema).max(MAX_BULLETS).readonly()
});

export type SnapshotMessage = z.infer<typeof SnapshotSchema>;

const presence = {
  name: PlayerNameSchema,
  room: RoomNameSchema
};

export const RoomListSchema = z.array(z.object({
  name: RoomNameSchema,
  players: z.number().int().nonnegative()
}));

export const ServerMessageSchema = z.discriminatedUnion('type', [
  SnapshotSchema,
  z.object({
    type: z.literal('joined'),
    room: RoomNameSchema,
    players: z.array(PlayerNameSchema),
    game: z.object({
      id: EntityIdSchema,
      seed: z.number().int().min(0).max(0xffffffff)
    }).optional()
  }),
  z.object({ type: z.literal('join'), ...presence }),
  z.object({ type: z.literal('leave'), ...presence }),
  z.object({
    type: z.literal('chat'), ...presence,
    text: z.string().min(1).max(500), time: z.number().nonnegative()
  }),
  z.object({
    type: z.literal('pong'),
    sent: z.number().nonnegative(),
    time: z.number().nonnegative()
  })
]);

export type ServerMessage = z.infer<typeof ServerMessageSchema>;

export function parseServerJSON(text: string) {
  try {
    const value: unknown = JSON.parse(text);
    return ServerMessageSchema.safeParse(value);
  } catch {
    return ServerMessageSchema.safeParse(undefined);
  }
}
