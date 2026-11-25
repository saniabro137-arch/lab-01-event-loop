export const VERSION = 1;
export const INPUT = 1;
export const SNAPSHOT = 2;
export const MAX_PLAYERS = 4;
export const THRUST = 1;
export const LEFT = 2;
export const RIGHT = 4;
export const FIRE = 8;
export const MAX_BATCH = 8;

export function validInputs(message) {
  return Array.isArray(message?.inputs) &&
    message.inputs.length > 0 &&
    message.inputs.length <= MAX_BATCH &&
    message.inputs.every((input, i, inputs) =>
      Number.isInteger(input?.seq) && input.seq > (inputs[i - 1]?.seq ?? 0) &&
      input.seq <= 0xffffffff &&
      Number.isInteger(input.buttons) && input.buttons >= 0 && input.buttons <= 15
    );
}
