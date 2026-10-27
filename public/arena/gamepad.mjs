// Browser Gamepad API input for a controller using the standard Xbox layout.
// Native console packaging/publication is separate from browser controller input.
const DEADZONE = 0.18;
const NAV_THRESHOLD = 0.6;

function finiteAxis(value) {
  return typeof value === 'number' && Number.isFinite(value)
    ? Math.max(-1, Math.min(1, value)) : 0;
}

function stick(axes, offset) {
  const x = finiteAxis(axes?.[offset]);
  const y = finiteAxis(axes?.[offset + 1]);
  const length = Math.hypot(x, y);
  if (length <= DEADZONE) return [0, 0];
  const strength = (Math.min(length, 1) - DEADZONE) / (1 - DEADZONE);
  return [x / length * strength, y / length * strength];
}

function pressed(button) {
  if (typeof button === 'number') return Number.isFinite(button) && button >= 0.5;
  return button?.pressed === true || (typeof button?.value === 'number'
    && Number.isFinite(button.value) && button.value >= 0.5);
}

function emptyInput() {
  return {
    connected: false, label: '', moveX: 0, moveY: 0, aimX: 0, aimY: 0,
    attack: false, aim: false, block: false, crouch: false,
    dash: false, jump: false, special: false, reload: false, interact: false,
    pause: false, select: false, back: false, nav: 0,
  };
}

export function createGamepadReader(getPads = () => globalThis.navigator?.getGamepads?.() || []) {
  let previous = [];
  let previousNav = 0;
  let previousIdentity = null;

  function reset() {
    previous = [];
    previousNav = 0;
    previousIdentity = null;
    return emptyInput();
  }

  return function poll() {
    let pad;
    try {
      pad = Array.from(getPads() || []).find(candidate => candidate && candidate.connected !== false);
    } catch {
      return reset();
    }
    if (!pad) return reset();
    const label = typeof pad.id === 'string' ? pad.id : '';
    const identity = `${pad.index ?? 0}:${label}`;
    if (identity !== previousIdentity) {
      previous = [];
      previousNav = 0;
      previousIdentity = identity;
    }

    const buttons = Array.from({ length: 16 }, (_, index) => pressed(pad.buttons?.[index]));
    const edge = index => buttons[index] && !previous[index];
    const [moveX, moveY] = stick(pad.axes, 0);
    const [aimX, aimY] = stick(pad.axes, 2);
    const direction = buttons[12] || buttons[14] ? -1
      : buttons[13] || buttons[15] ? 1
      : moveY < -NAV_THRESHOLD || moveX < -NAV_THRESHOLD ? -1
      : moveY > NAV_THRESHOLD || moveX > NAV_THRESHOLD ? 1 : 0;
    const result = {
      connected: true, label, moveX, moveY, aimX, aimY,
      attack: buttons[7] || buttons[2], aim: buttons[6], block: buttons[4], crouch: buttons[11],
      dash: edge(1), jump: edge(0), special: edge(5), reload: edge(3), interact: edge(12),
      pause: edge(9), select: edge(0), back: edge(1),
      nav: direction && direction !== previousNav ? direction : 0,
    };
    previous = buttons;
    previousNav = direction;
    return result;
  };
}
