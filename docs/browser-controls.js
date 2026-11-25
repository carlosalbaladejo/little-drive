const buttons = new Map([
    [0, 'accelerate'], [1, 'horn'], [2, 'brake'], [3, 'radio'],
    [8, 'menu'], [9, 'pause'], [14, 'left'], [15, 'right'],
]);

export function browserControls(onChange, onGesture) {
    const panel = document.querySelector('#drive-controls');
    const pointers = new Map();
    let gamepadActions = [];
    let enabled = true;
    let previous = new Set();

    function update() {
        const next = new Set([...pointers.values(), ...gamepadActions]);
        if (next.size === previous.size && [...next].every(action => previous.has(action))) return;
        for (const button of panel.querySelectorAll('button')) {
            button.classList.toggle('held', next.has(button.dataset.control));
        }
        previous = next;
        onChange(next);
    }

    function clear() {
        pointers.clear();
        gamepadActions = [];
        update();
    }

    for (const button of panel.querySelectorAll('button')) {
        button.addEventListener('pointerdown', event => {
            if (!enabled || event.button !== 0) return;
            event.preventDefault();
            button.setPointerCapture(event.pointerId);
            pointers.set(event.pointerId, button.dataset.control);
            onGesture();
            update();
        });
        for (const type of ['pointerup', 'pointercancel', 'lostpointercapture']) {
            button.addEventListener(type, event => {
                pointers.delete(event.pointerId);
                update();
            });
        }
    }

    return {
        clear,
        disable() {
            enabled = false;
            panel.hidden = true;
            clear();
        },
        poll() {
            if (!enabled || !document.hasFocus() || document.hidden) return;
            const gamepad = Array.from(navigator.getGamepads?.() || []).find(pad => pad?.mapping === 'standard');
            gamepadActions = [...buttons].filter(([index]) => gamepad?.buttons[index]?.pressed).map(([, action]) => action);
            if (gamepad?.axes[0] < -.35) gamepadActions.push('left');
            if (gamepad?.axes[0] > .35) gamepadActions.push('right');
            update();
        },
    };
}
