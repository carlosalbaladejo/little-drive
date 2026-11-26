import * as THREE from './vendor/three.module.min.js';
import {World, START, elevation, labelAt, onRoad, surface} from './world.js?v=performance-1';
import {groundPose, DrivingEffects} from './effects.js?v=performance-1';
import {Traffic, footprint, overlap, vehicleTypes} from './traffic.js?v=english-1';
import {DriveAudio, radioNames} from './audio.js?v=english-1';
import {drawMinimap, showHeading} from './navigation.js?v=locale-1';
import {browserControls} from './browser-controls.js?v=2';

import { t, languageOption, toggleLanguage } from './locale.js';

const canvas = document.querySelector('#view');
const minimap = document.querySelector('#minimap');
const mapContext = minimap.getContext('2d');
const northNeedle = document.querySelector('#north-needle');
const headingLabel = document.querySelector('#heading');
const district = document.querySelector('#district');
const timeHud = document.querySelector('#drive-time');
const speed = document.querySelector('#speed');
const notice = document.querySelector('#notice');
const noticeText = document.querySelector('#notice-text');
const menu = document.querySelector('#menu');
const pauseScreen = document.querySelector('#pause-screen');
const error = document.querySelector('#error');
const choices = Array.from(menu.querySelectorAll('[data-action]'));
const controller = menu.querySelector('[data-action="controller"]');
const catalog = menu.querySelector('[data-action="catalog"]');
const errorExit = document.querySelector('#error-exit');
const hint = document.querySelector('#menu-hint');
const storageKey = 'paseo-costero.pose.v1';
let hostInputHint = false;
let touchLayout = false;
let noticeKey = '';
const settingsKey = 'paseo-costero.settings.v1';
const speedOptions = [40, 60, 83, 105, 130];
const audio = new DriveAudio();
// Detect TV before creating the WebGL context; MSAA cannot be changed later.
const tv = /\bLinkArcadeTV\b|\bAFT[A-Z0-9]*\b/i.test(navigator.userAgent);
const pixelBudget = tv ? 960 * 540 : 1250000;
const fogFar = tv ? 210 : 292;
const healthHud = document.querySelector('#health');
const healthMeter = healthHud.querySelector('progress');
const healthValue = document.querySelector('#health-value');
const radioButton = document.querySelector('#radio');
const unlockButton = document.querySelector('#unlock-audio');
const wreckScreen = document.querySelector('#wreck-screen');
const keyboard = {
    ArrowLeft: 'left', KeyA: 'left', ArrowRight: 'right', KeyD: 'right',
    ArrowUp: 'accelerate', KeyW: 'accelerate', KeyX: 'accelerate',
    ArrowDown: 'brake', KeyS: 'brake', KeyZ: 'brake',
    KeyR: 'radio', KeyH: 'horn',
    Enter: 'accept', NumpadEnter: 'accept', Space: 'pause', Escape: 'menu', ShiftRight: 'menu',
};

const chassis = new THREE.BoxGeometry(1, 1, 1);
const tire = new THREE.CylinderGeometry(.40, .40, .26, 12).rotateZ(Math.PI / 2);
const hub = new THREE.CylinderGeometry(.21, .21, .267, 10).rotateZ(Math.PI / 2);
const shadowGeo = new THREE.CircleGeometry(1, 18).rotateX(-Math.PI / 2);
const shadowMat = new THREE.MeshBasicMaterial({color: 0x172c38, opacity: .23, transparent: true, depthWrite: false});
const carMaterials = new Map();
const trafficGeometry = new Map();
const trafficMaterial = new THREE.MeshLambertMaterial({vertexColors: true});

function material(hex) {
    if (!carMaterials.has(hex)) carMaterials.set(hex, new THREE.MeshLambertMaterial({color: hex}));
    return carMaterials.get(hex);
}

function carModel(bodyColor) {
    const root = new THREE.Group();
    const shadow = new THREE.Mesh(shadowGeo, shadowMat);
    shadow.scale.set(1.28, 1, 2.53);
    shadow.position.y = .065;
    root.add(shadow);
    const body = new THREE.Group();
    root.add(body);
    const paint = new THREE.MeshLambertMaterial({color: bodyColor});
    paint.emissive.setHex(0xffaa44);
    paint.emissiveIntensity = 0;
    function part(hex, x, y, z, w, h, d, geometry = chassis) {
        const mesh = new THREE.Mesh(geometry, hex === null ? paint : material(hex));
        mesh.position.set(x, y, z);
        mesh.scale.set(w, h, d);
        body.add(mesh);
        return mesh;
    }
    part(null, 0, .64, 0, 1.92, .65, 4.12);
    part(null, 0, .95, -1.28, 1.78, .23, 1.48);
    part(null, 0, .90, 1.50, 1.82, .23, .99);
    part(0x2c5664, 0, 1.21, .20, 1.65, .60, 1.76);
    part(0xffeed7, 0, 1.53, .21, 1.59, .09, 1.64);
    part(0xb6e0e3, 0, 1.29, -.695, 1.46, .26, .03).rotation.x = -.23;
    part(0x80abb4, 0, 1.24, 1.093, 1.45, .27, .035).rotation.x = .20;
    part(0xe8c7ac, 0, .49, 2.09, 1.97, .20, .17);
    part(0xe8c7ac, 0, .49, -2.08, 1.97, .19, .16);
    part(0xfff6e1, 0, .67, 2.074, .53, .21, .027);
    const wheels = [];
    for (const x of [-.86, .86]) {
        part(0xfff2b3, x * .77, .80, -2.065, .44, .23, .08);
        part(0xb53237, x * .82, .82, 2.077, .37, .18, .08);
        part(null, x, 1.21, -.61, .27, .16, .30);
        part(0xffeed7, x * .955, 1.23, .20, .039, .53, .085);
        for (const z of [-1.27, 1.28]) {
            const rubber = part(0x292e3a, x, .41, z, 1, 1, 1, tire);
            const rim = part(0xb7c4c3, x, .41, z, 1, 1, 1, hub);
            wheels.push(rubber, rim);
        }
    }
    return {root, body, paint, wheels, shadow};
}

function trafficMeshGeometry(car) {
    const {kind, color: hex} = car;
    const key = `${kind}:${hex}`;
    if (trafficGeometry.has(key)) return trafficGeometry.get(key);
    const {w, length} = vehicleTypes[kind];
    const parts = [];
    const add = (shade, x, y, z, width, height, depth, geometry = chassis) => {
        const mesh = new THREE.Mesh(geometry, material(shade));
        mesh.position.set(x, y, z);
        mesh.scale.set(width, height, depth);
        parts.push(mesh);
    };
    const emergency = vehicleTypes[kind].siren;
    const paint = kind === 'fire' ? 0xe04437 : emergency ? 0xf6efe1 : kind === 'waste' ? 0x58996d : hex;
    const isBike = kind === 'moto';
    const heavy = kind === 'truck' || kind === 'fire' || kind === 'waste';
    const enclosed = kind === 'van' || kind === 'ambulance';
    const cabHeight = isBike ? 1.00 : heavy ? 2.5 : enclosed ? 2.06 : 1.52;
    const cabZ = heavy ? -length * .29 : enclosed ? -length * .27 : .06;
    const cabDepth = heavy ? length * .33 : enclosed ? length * .31 : length * .49;
    add(paint, 0, isBike ? .59 : .68, 0, isBike ? .45 : w, .48, length - .18);
    add(isBike ? 0x34424c : paint, 0, (cabHeight + .72) / 2, cabZ, w * .87, cabHeight - .72, cabDepth);
    add(0x557e91, 0, cabHeight - .23, cabZ - cabDepth / 2 - .012, w * .77, .32, .045);
    if (!isBike) {
        for (const side of [-1, 1]) add(0x557e91, side * w * .439, cabHeight - .24,
            cabZ, .04, .31, cabDepth * .84);
    } else {
        add(0x303842, 0, 1.07, -.45, w, .09, .16);
        add(0x283d57, 0, 1.19, .16, .42, .55, .41);
        add(0xffe3b1, 0, 1.56, .12, .38, .29, .35);
    }
    if (heavy || enclosed) {
        const boxColor = kind === 'truck' ? 0xddd2af : paint;
        add(boxColor, 0, 1.55, length * .16, w, 1.86, length * .62);
        if (kind === 'fire') {
            add(0xf1d4a9, 0, 2.55, length * .14, .68, .12, length * .57);
            for (const side of [-1, 1]) add(0xf8dcbb, side * w / 2, 1.46, length * .17, .05, .71, length * .40);
        }
        if (kind === 'waste') add(0x305e53, 0, 1.42, length * .46, w * .88, 1.12, .26);
    }
    if (kind === 'police' || kind === 'ambulance') {
        for (const side of [-1, 1]) add(kind === 'police' ? 0x29529e : 0xcf3342,
            side * w * .505, .82, 0, .04, .16, length * .83);
    }
    if (kind === 'ambulance') {
        for (const side of [-1, 1]) {
            add(0xcf3342, side * w * .509, 1.64, length * .22, .04, .66, .21);
            add(0xcf3342, side * w * .509, 1.64, length * .22, .04, .21, .63);
        }
    }
    if (emergency) {
        add(0x34a2fa, -.31, cabHeight + .14, cabZ, .50, .21, .29);
        add(kind === 'police' ? 0xff4d56 : 0x52bdff, .31, cabHeight + .14, cabZ, .50, .21, .29);
    }
    for (const side of isBike ? [0] : [-1, 1]) {
        add(0xffedba, side * w * .34, .76, -length * .46, .29, .22, .13);
        add(0xbf3551, side * w * .35, .76, length * .46, .26, .19, .13);
        for (const axle of heavy ? [-.34, .24, .37] : [-.31, .31]) {
            const wheelScale = isBike ? .77 : heavy ? 1.16 : .93;
            add(0x2b303d, side * w * .43, .40 * wheelScale, axle * length, wheelScale, wheelScale, wheelScale, tire);
        }
    }

    const points = [], normals = [], colors = [];
    const point = new THREE.Vector3(), normal = new THREE.Vector3();
    const matrix = new THREE.Matrix3();
    for (const mesh of parts) {
        mesh.updateMatrix();
        matrix.getNormalMatrix(mesh.matrix);
        const {position, normal: directions} = mesh.geometry.attributes;
        const index = mesh.geometry.index;
        const {r, g, b} = mesh.material.color;
        for (let i = 0; i < (index?.count ?? position.count); i++) {
            const vertex = index ? index.getX(i) : i;
            point.fromBufferAttribute(position, vertex).applyMatrix4(mesh.matrix);
            normal.fromBufferAttribute(directions, vertex).applyMatrix3(matrix).normalize();
            points.push(point.x, point.y, point.z);
            normals.push(normal.x, normal.y, normal.z);
            colors.push(r, g, b);
        }
    }
    const mesh = new THREE.BufferGeometry();
    mesh.setAttribute('position', new THREE.Float32BufferAttribute(points, 3));
    mesh.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
    mesh.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
    mesh.computeBoundingSphere();
    trafficGeometry.set(key, mesh);
    return mesh;
}

function storedPose() {
    try {
        const pose = JSON.parse(localStorage.getItem(storageKey));
        if (pose && [pose.x, pose.z, pose.heading].every(Number.isFinite)
            && Math.abs(pose.x) < 1e10 && Math.abs(pose.z) < 1e10 && surface(pose.x, pose.z) > .25) return pose;
    } catch { /* Storage is optional in a standalone private browser. */ }
    return START;
}

function loadSettings() {
    try {
        const saved = JSON.parse(localStorage.getItem(settingsKey));
        return {
            speed: speedOptions.includes(saved?.speed) ? saved.speed : 83,
            damage: saved?.damage === true,
            radio: Number.isInteger(saved?.radio) && radioNames[saved.radio] ? saved.radio : 1,
            sound: saved?.sound !== false,
            minimap: saved?.minimap !== false,
        };
    } catch {
        return {speed: 83, damage: false, radio: 1, sound: true, minimap: true};
    }
}

const settings = loadSettings();
audio.station = settings.radio;
audio.enabled = settings.sound;

let renderer;
try {
    renderer = new THREE.WebGLRenderer({canvas, antialias: !tv, alpha: false, powerPreference: 'low-power'});
} catch {
    error.hidden = false;
}

const world = renderer && new World(fogFar);
const effects = renderer && new DrivingEffects(world.scene);
const camera = new THREE.PerspectiveCamera(62, 1, .22, fogFar + 48);
const player = renderer && carModel(0xf47351);
const traffic = new Traffic();
const trafficMeshes = [];
const {x: startX, z: startZ, heading: startHeading, health: savedHealth, driveTime: savedTime} = storedPose();
const position = {x: startX, z: startZ, heading: startHeading};
const cameraPosition = new THREE.Vector3();
const cameraLook = new THREE.Vector3();
const goal = new THREE.Vector3();
let cameraReady = false;
let velocity = 0, wheelAngle = 0, worldTime = 0, saveTime = 0;
let driveTime = Number.isFinite(savedTime) ? Math.min(1e8, Math.max(0, savedTime)) : 0;
let recovery = null;
let savedPose = {...position};
let toastTime = 0;
let health = settings.damage && Number.isFinite(savedHealth) ? THREE.MathUtils.clamp(savedHealth, 0, 100) : 100;
let mode = health === 0 ? 'wreck' : 'drive';
let repairTime = 0, lastCrash = -Infinity, contact = false, touching = false;
let parkingTime = 0, parkedBay = null;
let returnMode = 'drive';
let selection = 0;
let bridge = null;
let nativeInput = new Set();
let nativeControls = false;
let waitForAcceleratorRelease = false;
const keysDown = new Set();
let dirty = true;
let mapFrame = -1;
let mapX, mapZ, mapHeading;
let compassHeading;

function save() {
    try { localStorage.setItem(storageKey, JSON.stringify({...savedPose, health, driveTime})); } catch { /* Optional storage. */ }
}

function saveSettings() {
    try { localStorage.setItem(settingsKey, JSON.stringify(settings)); } catch { /* Optional storage. */ }
}

function updateSettings() {
    menu.querySelector('[data-action="speed"]').textContent = `${t('Speed limit')}: ${settings.speed} km/h`;
    menu.querySelector('[data-action="damage"]').textContent = `${t('Vehicle damage')}: ${t(settings.damage ? 'On' : 'Off')}`;
    menu.querySelector('[data-action="sound"]').textContent = `${t('Sound effects')}: ${t(settings.sound ? 'On' : 'Off')}`;
    menu.querySelector('[data-action="minimap"]').textContent = `${t('Minimap')}: ${t(settings.minimap ? 'On' : 'Off')}`;
    menu.querySelector('[data-action="language"]').textContent = languageOption();
    hint.textContent = t(hostInputHint ? '← → Choose · × Confirm · Select Back' : '← → Choose · Enter Confirm · Esc Back');
    controller.textContent = t(touchLayout ? 'Use physical controller' : 'Use touch controls');
    noticeText.textContent = t(noticeKey);
    minimap.hidden = !settings.minimap;
    mapFrame = -1;
    radioButton.textContent = settings.radio ? `△ ${radioNames[settings.radio]}` : t('△ Radio off');
    healthHud.hidden = !settings.damage;
    updateHealth();
    audio.enabled = settings.sound;
    audio.setRadio(settings.radio, mode === 'drive');
    syncHorn();
}

function updateHealth() {
    healthMeter.value = health;
    healthValue.textContent = `${Math.round(health)}%`;
    healthHud.dataset.level = health <= 25 ? 'low' : health <= 60 ? 'medium' : 'high';
}

function changeRadio() {
    settings.radio = (settings.radio + 1) % radioNames.length;
    audio.unlock();
    saveSettings();
    updateSettings();
}

function syncAudioControl() {
    const silent = audio.context?.state !== 'running';
    const hideUnlock = !silent || mode !== 'drive';
    if (unlockButton.hidden !== hideUnlock) unlockButton.hidden = hideUnlock;
    // Keep the direct-gesture fallback available in older imported catalogs.
    const hideRadio = silent || mode !== 'drive';
    if (radioButton.hidden !== hideRadio) radioButton.hidden = hideRadio;
}

function setMode(next) {
    if (next === 'drive' && mode !== 'drive' && held('accelerate')) waitForAcceleratorRelease = true;
    if (health === 0 && next !== 'menu') next = 'wreck';
    mode = next;
    if (mode !== 'drive') parkingTime = 0;
    notice.classList.toggle('paused', mode !== 'drive');
    menu.hidden = mode !== 'menu';
    pauseScreen.hidden = mode !== 'pause';
    wreckScreen.hidden = mode !== 'wreck';
    audio.setRadio(settings.radio, mode === 'drive');
    syncHorn();
    syncAudioControl();
    dirty = true;
}

function refreshMenu() {
    const available = choices.filter(button => !button.hidden);
    selection = THREE.MathUtils.euclideanModulo(selection, available.length);
    for (const button of choices) button.classList.toggle('selected', button === available[selection]);
    return available[selection];
}

function flash(text, reward) {
    noticeKey = text;
    noticeText.textContent = t(text);
    notice.classList.toggle('parked', reward === 'parked');
    notice.classList.toggle('repaired', reward === 'repaired');
    notice.hidden = false;
    toastTime = worldTime + (reward ? 3 : 2.5);
    if (reward) audio.reward(reward);
}

function reset(pose) {
    recovery = null;
    Object.assign(position, pose);
    velocity = 0;
    wheelAngle = 0;
    cameraReady = false;
    effects?.clear();
    traffic.clear();
    repairTime = 0;
    parkingTime = 0;
    parkedBay = world.parkingFor(footprint(pose.x, pose.z, pose.heading));
    notice.hidden = true;
    contact = false;
    touching = false;
    lastCrash = -Infinity;
    savedPose = {...pose};
    save();
    dirty = true;
}

function runChoice(action) {
    switch (action) {
        case 'continue': setMode('drive'); break;
        case 'speed':
            settings.speed = speedOptions[(speedOptions.indexOf(settings.speed) + 1) % speedOptions.length];
            break;
        case 'damage':
            if (health === 0) break;
            settings.damage = !settings.damage;
            health = 100;
            save();
            break;
        case 'sound': settings.sound = !settings.sound; break;
        case 'language':
            toggleLanguage();
            updateSettings();
            showHeading(northNeedle, headingLabel, position.heading);
            return;
        case 'minimap': settings.minimap = !settings.minimap; dirty = true; break;
        case 'restart':
            health = 100;
            driveTime = 0;
            reset(START);
            worldTime = 0;
            toastTime = 0;
            notice.hidden = true;
            setMode('drive');
            break;
        case 'controller': bridge?.postMessage('toggle-touch'); break;
        case 'catalog':
            save();
            bridge?.postMessage('catalog');
            break;
    }
    saveSettings();
    updateSettings();
    syncAudioControl();
}

for (const button of choices) {
    button.addEventListener('click', () => runChoice(button.dataset.action));
}
document.querySelector('#restart-wreck').addEventListener('click', () => runChoice('restart'));
unlockButton.addEventListener('click', () => {
    audio.unlock();
    updateSettings();
});
radioButton.addEventListener('click', changeRadio);
document.querySelector('#resume').addEventListener('click', () => setMode('drive'));
errorExit.addEventListener('click', () => bridge?.postMessage('catalog'));

function input(action) {
    if (!renderer || !error.hidden) {
        if (action === 'menu' || action === 'accelerate') bridge?.postMessage('catalog');
        return;
    }
    if (action === 'menu') {
        if (mode === 'menu') setMode(returnMode);
        else {
            returnMode = mode;
            selection = 0;
            setMode('menu');
            refreshMenu();
        }
        return;
    }
    if (action === 'pause') {
        if (mode === 'menu') setMode('drive');
        else setMode(mode === 'drive' ? 'pause' : 'drive');
        return;
    }
    if (mode === 'menu') {
        if (action === 'left' || action === 'right') {
            selection += action === 'left' ? -1 : 1;
            refreshMenu();
        }
        if (action === 'accelerate' || action === 'accept') runChoice(refreshMenu().dataset.action);
        if (action === 'brake') setMode(returnMode);
    } else if (mode === 'pause' && action === 'accept') setMode('drive');
    else if (mode === 'wreck' && (action === 'accelerate' || action === 'accept')) runChoice('restart');
    else if (mode === 'drive' && action === 'radio') changeRadio();
    else if (mode === 'drive' && action === 'horn') {
        audio.unlock();
    }
}

function setControllerInput(next) {
    const previous = nativeInput;
    nativeInput = next;
    for (const action of nativeInput) if (!previous.has(action)) input(action);
    syncHorn();
}

const standaloneControls = browserControls(setControllerInput, () => {
    audio.unlock();
    audio.setRadio(settings.radio, mode === 'drive');
});

window.addEventListener('message', event => {
    if (event.data === 'paseo-costero-host' && event.ports.length === 1 &&
        location.href === 'https://carlosalbaladejo.github.io/little-drive/') {
        bridge?.close();
        bridge = event.ports[0];
        catalog.hidden = false;
        errorExit.hidden = false;
        hostInputHint = true;
        updateSettings();
        bridge.onmessage = ({data}) => {
            canvas.parentElement.classList.toggle('touch-hud', data === 'touch');
            controller.hidden = data === 'tv';
            touchLayout = data === 'touch';
            updateSettings();
            refreshMenu();
        };
        return;
    }
    let data;
    try { data = JSON.parse(event.data); } catch { return; }
    if (data?.type !== 'tv-game-input' || data.version !== 1 || !Array.isArray(data.pressed)) return;
    if (!nativeControls) {
        nativeControls = true;
        document.querySelector('main').classList.add('hosted');
        standaloneControls.disable();
        hostInputHint = true;
        updateSettings();
    }
    setControllerInput(new Set(data.pressed));
});


window.addEventListener('keydown', event => {
    const action = keyboard[event.code];
    if (!action) return;
    if (action === 'accept' && document.activeElement?.localName === 'button') return;
    event.preventDefault();
    if (!event.repeat) {
        audio.unlock();
        audio.setRadio(settings.radio, mode === 'drive');
    }
    keysDown.add(event.code);
    if (!event.repeat) input(action);
    if (action === 'horn') syncHorn();
});
window.addEventListener('keyup', event => {
    keysDown.delete(event.code);
    if (keyboard[event.code] === 'horn') syncHorn();
});
function clearInput() {
    keysDown.clear();
    standaloneControls.clear();
    nativeInput.clear();
    syncHorn();
}
window.addEventListener('blur', clearInput);
window.addEventListener('pagehide', () => { clearInput(); save(); });
document.addEventListener('visibilitychange', () => {
    clearInput();
    if (document.hidden) {
        if (renderer && mode === 'drive') setMode('pause');
        save();
    }
});

function held(action) {
    if (nativeInput.has(action)) return true;
    for (const code of keysDown) if (keyboard[code] === action) return true;
    return false;
}

function syncHorn() {
    audio.setHorn(mode === 'drive' && !recovery && held('horn'));
}

if (renderer) {
    world.scene.add(player.root);
    const resize = () => {
        const w = canvas.clientWidth, h = canvas.clientHeight;
        const ratio = Math.min(devicePixelRatio, tv ? 1 : 1.4, Math.sqrt(pixelBudget / Math.max(1, w * h)));
        renderer.setDrawingBufferSize(w, h, ratio);
        camera.aspect = w / Math.max(1, h);
        camera.updateProjectionMatrix();
        dirty = true;
    };
    window.addEventListener('resize', resize);
    resize();
    canvas.addEventListener('webglcontextlost', event => {
        event.preventDefault();
        setMode('pause');
        pauseScreen.hidden = true;
        error.hidden = false;
    });
    canvas.addEventListener('webglcontextrestored', () => {
        error.hidden = true;
        setMode('pause');
    });
}

function impact(strength, x, z, dx, dz) {
    touching = true;
    if (contact || worldTime - lastCrash < .4 || strength < 1.3) return;
    lastCrash = worldTime;
    effects.impact(x, z, dx, dz, strength);
    audio.crash(strength);
    if (!settings.damage) return;
    health = Math.max(0, health - Math.max(2, Math.round(strength * 1.4)));
    updateHealth();
    save();
    if (health === 0) {
        velocity = 0;
        setMode('wreck');
    }
}

function startRecovery() {
    recovery = {
        phase: 'sink', elapsed: 0,
        x: position.x, z: position.z,
        y: Math.max(.26, groundPose(position.x, position.z, position.heading).y),
        dx: Math.sin(position.heading) * velocity,
        dz: -Math.cos(position.heading) * velocity,
    };
    velocity = 0;
    syncHorn();
    audio.splash();
    flash('Into the water!');
}

function stepRecovery(dt) {
    recovery.elapsed += dt;
    const {phase, elapsed} = recovery;
    if (phase === 'sink') {
        const drift = .31 * (1 - Math.exp(-elapsed * 3.5));
        position.x = recovery.x + recovery.dx * drift;
        position.z = recovery.z + recovery.dz * drift;
        if (elapsed >= 1.7) {
            const landing = world.recover(recovery.x, recovery.z);
            reset(landing);
            recovery = {phase: 'drop', elapsed: 0};
        }
        return;
    }
    if (elapsed >= .72) {
        recovery = null;
        waitForAcceleratorRelease = held('accelerate');
        syncHorn();
        audio.land();
        flash('Back on the road');
    }
}

function simulate(dt) {
    worldTime += dt;
    driveTime += dt;
    if (recovery) {
        effects.step(dt, position, 0);
        stepRecovery(dt);
        return;
    }
    const {x, z, heading} = position;
    touching = false;
    const acceleratorHeld = held('accelerate'), brake = held('brake');
    if (!acceleratorHeld) waitForAcceleratorRelease = false;
    const accelerator = acceleratorHeld && !waitForAcceleratorRelease;
    const road = onRoad(x, z);
    const topSpeed = road ? settings.speed / 3.6 : Math.min(12, settings.speed / 3.6);
    const steer = Number(held('right')) - Number(held('left'));
    if (brake) velocity = velocity > .13 ? Math.max(0, velocity - dt * 20) : Math.max(-6.5, velocity - dt * 8);
    else if (accelerator) velocity = velocity > topSpeed
        ? Math.max(topSpeed, velocity - dt * 13) : Math.min(topSpeed, velocity + dt * 9.3);
    else velocity = THREE.MathUtils.damp(velocity, 0, road ? .9 : 2.9, dt);
    if (!accelerator && !brake && Math.abs(velocity) < .08) velocity = 0;
    const turnRate = Math.min(1, Math.abs(velocity) / 3) * (1.68 - Math.min(.80, Math.abs(velocity) * .036));
    position.heading += steer * Math.sign(velocity) * turnRate * dt;
    position.heading = THREE.MathUtils.euclideanModulo(position.heading, 2 * Math.PI);
    const nextX = x + Math.sin(position.heading) * velocity * dt;
    const nextZ = z - Math.cos(position.heading) * velocity * dt;
    const direction = Math.sign(velocity);
    const dx = Math.sin(position.heading) * direction;
    const dz = -Math.cos(position.heading) * direction;
    const previous = footprint(x, z, heading);
    const candidate = footprint(nextX, nextZ, position.heading);
    const hitTraffic = traffic.cars.find(car => overlap(car, candidate) > overlap(car, previous) + .0001);
    const obstacle = velocity !== 0 && world.carObstacle(candidate);
    if (obstacle || hitTraffic) {
        const relative = hitTraffic
            ? Math.hypot(dx * Math.abs(velocity) - hitTraffic.fx * hitTraffic.velocity,
                dz * Math.abs(velocity) - hitTraffic.fz * hitTraffic.velocity)
            : Math.abs(velocity);
        const noseX = x + dx * 1.9, noseZ = z + dz * 1.9;
        impact(relative,
            obstacle ? THREE.MathUtils.clamp(noseX, obstacle.x - obstacle.w, obstacle.x + obstacle.w) : noseX,
            obstacle ? THREE.MathUtils.clamp(noseZ, obstacle.z - obstacle.d, obstacle.z + obstacle.d) : noseZ, dx, dz);
        position.heading = heading;
        velocity = 0;
    } else {
        position.x = nextX;
        position.z = nextZ;
    }
    const occupied = footprint(position.x, position.z, position.heading);
    traffic.step(dt, worldTime, occupied, (car, speed) => {
        impact(speed, car.x + car.fx * car.hl, car.z + car.fz * car.hl, car.fx, car.fz);
    });
    contact = touching;
    if (settings.damage && health > 0 && health < 100 && world.nearRepair(position.x, position.z)) {
        repairTime = Math.abs(velocity) < .55 ? repairTime + dt : 0;
        if (repairTime >= 1) {
            health = 100;
            updateHealth();
            flash('Car repaired!', 'repaired');
            save();
        } else if (noticeKey !== 'Stop in the driveway for repairs' || notice.hidden) {
            flash('Stop in the driveway for repairs');
        }
    } else repairTime = 0;
    if (parkedBay) {
        const margin = Math.hypot(occupied.hw, occupied.hl);
        if (Math.abs(position.x - parkedBay.x) > parkedBay.halfWidth + margin ||
            Math.abs(position.z - parkedBay.z) > parkedBay.halfLength + margin) parkedBay = null;
    }
    const bay = !parkedBay && world.parkingFor(occupied);
    // A rounded 0 km/h, or a collision that has just zeroed velocity, is not a stop.
    const stopped = velocity === 0 && x === position.x && z === position.z &&
        !acceleratorHeld && !brake && !touching && mode === 'drive';
    parkingTime = bay && stopped ? parkingTime + dt : 0;
    if (parkingTime >= .6) {
        parkedBay = bay;
        parkingTime = 0;
        flash('Nicely parked!', 'parked');
    }
    effects.step(dt, position, velocity);
    wheelAngle += velocity * dt / .40;
    if (surface(position.x, position.z) < .25) {
        startRecovery();
        return;
    }
    savedPose = {...position};
    saveTime += dt;
    if (saveTime >= 2) {
        save();
        saveTime = 0;
    }
    if (!notice.hidden && worldTime >= toastTime) notice.hidden = true;
}

function draw(dt) {
    const {x, z, heading} = position;
    const oldX = world.originX, oldZ = world.originZ;
    world.update(x, z, worldTime, !cameraReady);
    // Keep the camera continuous when the rendered neighbourhood rebases.
    cameraPosition.x += oldX - world.originX;
    cameraPosition.z += oldZ - world.originZ;
    cameraLook.x += oldX - world.originX;
    cameraLook.z += oldZ - world.originZ;
    const localX = x - world.originX, localZ = z - world.originZ;
    const ground = groundPose(x, z, heading);
    const sinking = recovery?.phase === 'sink';
    const landing = recovery?.phase === 'drop';
    const y = sinking ? .1 : ground.y;
    let carY = y, pitch = ground.pitch, roll = ground.roll;
    if (sinking) {
        const t = Math.min(1, recovery.elapsed / 1.45);
        carY = THREE.MathUtils.lerp(recovery.y, -2.35, t * t);
        pitch = -.34 * Math.sin(t * Math.PI / 2);
        roll = .26 * t;
    } else if (landing) {
        const t = Math.min(1, recovery.elapsed / .72);
        carY += 3.2 * (1 - t * t);
    }
    player.root.position.set(localX, carY, localZ);
    player.root.rotation.y = -heading;
    player.body.rotation.set(pitch + effects.bump, 0, roll, 'XYZ');
    player.shadow.visible = !recovery;
    effects.waterRipple(recovery, world.originX, world.originZ);
    player.paint.emissiveIntensity = effects.bump * 2.5;
    for (const wheel of player.wheels) wheel.rotation.x = wheelAngle;
    let rendered = 0, siren = null, sirenDistanceSquared = 70 ** 2;
    const audible = audio.running && audio.context?.state === 'running';
    for (const car of traffic.cars) {
        const distanceSquared = (car.x - x) ** 2 + (car.z - z) ** 2;
        if (distanceSquared > (tv ? fogFar + 12 : 295) ** 2) continue;
        if (!trafficMeshes[rendered]) {
            const mesh = new THREE.Mesh(trafficMeshGeometry(car), trafficMaterial);
            mesh.rotation.order = 'YXZ';
            world.scene.add(mesh);
            trafficMeshes[rendered] = mesh;
        }
        const mesh = trafficMeshes[rendered++];
        mesh.visible = true;
        mesh.geometry = trafficMeshGeometry(car);
        const carGround = groundPose(car.x, car.z, car.heading);
        mesh.position.set(car.x - world.originX, carGround.y, car.z - world.originZ);
        mesh.rotation.set(carGround.pitch, -car.heading, carGround.roll, 'YXZ');
        if (audible && distanceSquared < sirenDistanceSquared &&
            vehicleTypes[car.kind].siren && (worldTime + car.id) % 12 <= 5) {
            siren = car;
            sirenDistanceSquared = distanceSquared;
        }
    }
    for (let i = rendered; i < trafficMeshes.length; i++) trafficMeshes[i].visible = false;
    world.animateBins(traffic.cars);
    if (audible) {
        const onFirmGround = recovery || !velocity || onRoad(x, z) ||
            world.parkingFor(footprint(x, z, heading)) || world.nearRepair(x, z);
        audio.tick(worldTime, siren, Math.sqrt(sirenDistanceSquared), onFirmGround ? 0 : Math.abs(velocity));
    }
    syncAudioControl();

    const forwardX = Math.sin(heading), forwardZ = -Math.cos(heading);
    let distance = 8.7 + Math.abs(velocity) * .06;
    for (let sample = 2; sample <= distance; sample += 1) {
        if (world.blocked(x - forwardX * sample, z - forwardZ * sample)) {
            distance = Math.max(2.5, sample - 1);
            break;
        }
    }
    const bx = x - forwardX * distance, bz = z - forwardZ * distance;
    const cameraHeight = Math.max(y + 4.2, elevation(bx, bz) + 3);
    goal.set(bx - world.originX, cameraHeight, bz - world.originZ);
    cameraPosition.lerp(goal, cameraReady ? 1 - Math.exp(-dt * 7) : 1);
    goal.set(localX + forwardX * (sinking ? 1 : 5.4), y + 1.45, localZ + forwardZ * (sinking ? 1 : 5.4));
    cameraLook.lerp(goal, cameraReady ? 1 - Math.exp(-dt * 11) : 1);
    cameraReady = true;
    camera.position.copy(cameraPosition);
    camera.lookAt(cameraLook);
    const area = labelAt(x, z);
    if (district.textContent !== area) district.textContent = area;
    const kph = String(Math.round(Math.abs(velocity) * 3.6));
    if (speed.textContent !== kph) speed.textContent = kph;
    const seconds = Math.floor(driveTime);
    const elapsed = `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`;
    if (timeHud.textContent !== elapsed) {
        timeHud.textContent = elapsed;
        timeHud.dateTime = `PT${seconds}S`;
    }
    if (heading !== compassHeading) {
        showHeading(northNeedle, headingLabel, heading);
        compassHeading = heading;
    }
    const mapTick = Math.floor(worldTime * 12);
    if (mapContext && settings.minimap &&
        (mapFrame < 0 || (mapTick !== mapFrame && (x !== mapX || z !== mapZ || heading !== mapHeading)))) {
        drawMinimap(mapContext, position);
        mapFrame = mapTick;
        mapX = x;
        mapZ = z;
        mapHeading = heading;
    }
    effects.draw(world, renderer, camera);
    renderer.render(world.scene, camera);
}

if (renderer) {
    updateSettings();
    setMode(mode);
    world.update(position.x, position.z, worldTime, true);
    if (world.carObstacle(footprint(position.x, position.z, position.heading))) {
        const road = world.recover(position.x, position.z);
        reset(world.carObstacle(footprint(road.x, road.z, road.heading)) ? START : road);
    }
    parkedBay = world.parkingFor(footprint(position.x, position.z, position.heading));
    let previous = performance.now();
    function frame(now) {
        standaloneControls.poll();
        const dt = Math.min(.065, (now - previous) / 1000);
        previous = now;
        if (!document.hidden && error.hidden && (mode === 'drive' || dirty)) {
            if (mode === 'drive' && world.tiles.size) {
                const substeps = Math.max(1, Math.ceil(dt / .016));
                for (let i = 0; i < substeps && mode === 'drive'; i++) simulate(dt / substeps);
            }
            draw(dt);
            dirty = false;
        }
        requestAnimationFrame(frame);
    }
    requestAnimationFrame(frame);
}
