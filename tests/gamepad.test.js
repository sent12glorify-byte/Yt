import test from 'node:test';
import assert from 'node:assert/strict';
import { createGamepadReader } from '../public/arena/gamepad.mjs';

function fixture() {
  const pad = { id: 'Xbox Wireless Controller (STANDARD GAMEPAD)', index: 0, connected: true,
    axes: [0, 0, 0, 0], buttons: Array.from({ length: 16 }, () => ({ pressed: false, value: 0 })) };
  let pads = [pad];
  return { pad, poll: createGamepadReader(() => pads), setPads(value) { pads = value; },
    press(...indices) { for (const index of indices) pad.buttons[index] = { pressed: true, value: 1 }; },
    release() { pad.buttons = Array.from({ length: 16 }, () => ({ pressed: false, value: 0 })); } };
}

test('Xbox standard layout maps held combat controls and all action edges', () => {
  const f = fixture();
  f.press(0, 1, 2, 3, 4, 5, 6, 7, 9, 11, 12);
  const first = f.poll();
  assert.equal(first.connected, true);
  assert.equal(first.label, f.pad.id);
  for (const name of ['attack', 'aim', 'block', 'crouch', 'dash', 'jump', 'special', 'reload', 'interact', 'pause', 'select', 'back']) assert.equal(first[name], true, name);
  const held = f.poll();
  for (const name of ['attack', 'aim', 'block', 'crouch']) assert.equal(held[name], true, name);
  for (const name of ['dash', 'jump', 'special', 'reload', 'interact', 'pause', 'select', 'back']) assert.equal(held[name], false, name);
  f.release(); f.poll(); f.press(0, 1);
  assert.equal(f.poll().jump, true);
});

test('both RT and X attack independently; analog trigger values are supported', () => {
  const f = fixture();
  f.pad.buttons[7] = { value: 0.7, pressed: false };
  assert.equal(f.poll().attack, true);
  f.release(); f.press(2);
  assert.equal(f.poll().attack, true);
  f.release();
  assert.equal(f.poll().attack, false);
});

test('sticks have a radial 0.18 deadzone and normalized magnitude', () => {
  const f = fixture();
  f.pad.axes = [0.18, 0, 0.1, 0.1];
  assert.deepEqual([f.poll().moveX, f.poll().aimY], [0, 0]);
  f.pad.axes = [0.59, 0, 0, -1];
  const halfway = f.poll();
  assert.ok(Math.abs(halfway.moveX - 0.5) < 1e-12);
  assert.equal(halfway.moveY, 0);
  assert.equal(halfway.aimX, 0);
  assert.equal(halfway.aimY, -1);
  f.pad.axes = [1, 1, -1, -1];
  const diagonal = f.poll();
  assert.ok(Math.abs(Math.hypot(diagonal.moveX, diagonal.moveY) - 1) < 1e-12);
  assert.ok(Math.abs(Math.hypot(diagonal.aimX, diagonal.aimY) - 1) < 1e-12);
});

test('D-pad and left stick navigate on edges, including a direction change', () => {
  const f = fixture();
  f.press(13);
  assert.equal(f.poll().nav, 1);
  assert.equal(f.poll().nav, 0);
  f.release(); f.press(14);
  assert.equal(f.poll().nav, -1);
  f.release(); f.poll();
  f.pad.axes[0] = 1;
  assert.equal(f.poll().nav, 1);
  assert.equal(f.poll().nav, 0);
  f.pad.axes[0] = -1;
  assert.equal(f.poll().nav, -1);
  f.pad.axes[0] = 0; f.poll(); f.pad.axes[1] = -1;
  assert.equal(f.poll().nav, -1);
});

test('disconnects and unavailable API reset controls and subsequent press edges', () => {
  const f = fixture();
  f.press(0); assert.equal(f.poll().select, true);
  f.setPads([null]);
  const disconnected = f.poll();
  assert.equal(disconnected.connected, false);
  assert.equal(disconnected.select, false);
  assert.equal(disconnected.moveX, 0);
  f.setPads([f.pad]); assert.equal(f.poll().select, true);
  f.pad.connected = false; assert.equal(f.poll().connected, false);
  assert.equal(createGamepadReader(() => { throw new Error('Permission unavailable'); })().connected, false);
  assert.equal(createGamepadReader(() => undefined)().connected, false);
});

test('invalid axes and missing buttons produce finite safe values', () => {
  const f = fixture();
  f.pad.axes = [Infinity, NaN, 10, -10];
  f.pad.buttons = [];
  const input = f.poll();
  assert.equal(input.moveX, 0); assert.equal(input.moveY, 0);
  for (const name of ['moveX', 'moveY', 'aimX', 'aimY']) {
    assert.equal(Number.isFinite(input[name]), true);
    assert.ok(Math.abs(input[name]) <= 1);
  }
  assert.equal(input.attack, false); assert.equal(input.select, false);
});
