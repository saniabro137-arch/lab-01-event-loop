import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import { decodeInput, encodeInput } from '../codec/index.ts';
import { InputMessageSchema, parseClientMessage } from '../protocol/index.ts';

const validInput = fc.array(fc.integer({ min: 0, max: 15 }), {
  minLength: 1,
  maxLength: 8
}).map(buttons => InputMessageSchema.parse({
  type: 'input',
  inputs: buttons.map((mask, index) => ({ seq: index + 1, buttons: mask }))
}));

describe('Lab 07 — властивості протоколу', () => {
  it('зберігає команди після кодування та декодування', () => {
    fc.assert(fc.property(validInput, message => {
      expect(decodeInput(encodeInput(message))).toEqual(message);
    }));
  });

  it('відхиляє пакет, обрізаний на довільній позиції', () => {
    fc.assert(fc.property(validInput, fc.nat(), (message, cut) => {
      const packet = encodeInput(message);
      expect(() => decodeInput(packet.slice(0, cut % packet.byteLength))).toThrow();
    }));
  });

  it('відхиляє бітові маски поза діапазоном 0–15', () => {
    fc.assert(fc.property(fc.integer({ min: 16, max: 255 }), buttons => {
      expect(parseClientMessage({
        type: 'input',
        inputs: [{ seq: 1, buttons }]
      }).success).toBe(false);
    }));
  });
});
