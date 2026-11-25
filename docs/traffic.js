import {TILE, BIN_OFFSET, STOP_LINE, binAt, signalPhase, verticalStreet,
    roadOffset, roadSlope} from './city.js?v=english-1';

export const vehicleTypes = {
    compact: {w: 1.7, length: 3.4, cruise: 11.5},
    sedan: {w: 1.9, length: 4.2, cruise: 10},
    moto: {w: .82, length: 2.45, cruise: 14},
    van: {w: 2.0, length: 4.65, cruise: 9.5},
    truck: {w: 2.25, length: 6.15, cruise: 7.5},
    ambulance: {w: 2.0, length: 4.65, cruise: 12.5, siren: 'ambulance'},
    fire: {w: 2.23, length: 5.9, cruise: 9.5, siren: 'fire'},
    police: {w: 1.92, length: 4.2, cruise: 13, siren: 'police'},
    waste: {w: 2.23, length: 5.7, cruise: 7.8},
};
const rotation = ['compact', 'sedan', 'moto', 'van', 'truck', 'compact',
    'police', 'sedan', 'ambulance', 'moto', 'fire', 'van', 'waste'];
const colors = [0xffd077, 0x58bbac, 0x9d82c4, 0xe88165, 0x8eb7e4, 0xf3f0df];
const laneOffset = 2.35;
const reach = 300;
const retire = 365;
const spacing = 112;
const probes = [2, 5, 9, 15, 23];

export function footprint(x, z, heading, w = 2.05, length = 4.27) {
    return {x, z, fx: Math.sin(heading), fz: -Math.cos(heading), hw: w / 2, hl: length / 2};
}

// Separating axes of the two oriented rectangles. Positive depth means contact.
export function overlap(a, b) {
    const x = b.x - a.x, z = b.z - a.z;
    if (Math.abs(x) > 7 || Math.abs(z) > 7) return 0;
    const forward = Math.abs(a.fx * b.fx + a.fz * b.fz);
    const sideways = Math.abs(a.fx * b.fz - a.fz * b.fx);
    return Math.max(0, Math.min(
        a.hl + b.hl * forward + b.hw * sideways - Math.abs(x * a.fx + z * a.fz),
        a.hw + b.hw * forward + b.hl * sideways - Math.abs(x * a.fz - z * a.fx),
        b.hl + a.hl * forward + a.hw * sideways - Math.abs(x * b.fx + z * b.fz),
        b.hw + a.hw * forward + a.hl * sideways - Math.abs(x * b.fz - z * b.fx)));
}

const mod = (n, m) => ((n % m) + m) % m;
const laneKey = (axis, lane, direction) => `${axis}${lane}:${direction}`;

function orient(car) {
    const across = car.lane * TILE + (car.axis === 'z' ? -car.direction : car.direction) * laneOffset;
    car.heading = car.axis === 'z' ? (car.direction < 0 ? 0 : Math.PI)
        : car.direction * Math.PI / 2 + Math.atan(roadSlope(car.lane, car.along));
    car.x = car.axis === 'z' ? across : car.along;
    car.z = car.axis === 'z' ? car.along : across + roadOffset(car.lane, car.along);
    car.fx = Math.sin(car.heading);
    car.fz = -Math.cos(car.heading);
}

export class Traffic {
    cars = [];
    lanes = new Map();
    nextId = 0;
    cell = '';

    clear() {
        this.cars.length = 0;
        this.lanes.clear();
        this.cell = '';
        this.nextId = 0;
    }

    spawn(lane, along, player) {
        const {axis, index, direction} = lane;
        if (Math.abs(along - Math.round(along / TILE) * TILE) < 17) return;
        const slot = Math.floor(along / spacing);
        const seed = slot * 7 + index * 5 + (direction < 0 ? 3 : 0) + (axis === 'x' ? 1 : 0);
        const variant = mod(seed + lane.serial++, rotation.length);
        const kind = direction === -1 && axis === 'z' && binAt(index, Math.floor(along / TILE)) && variant % 7 === 2
            ? 'waste' : rotation[variant] === 'waste' ? 'truck' : rotation[variant];
        const model = vehicleTypes[kind];
        const speed = model.cruise * (.88 + mod(seed, 7) * .04);
        const car = {id: this.nextId++, axis, lane: index, direction, along, kind,
            hw: model.w / 2, hl: model.length / 2, color: colors[mod(seed, colors.length)],
            speed, velocity: speed, dwell: 0, lastBin: null};
        orient(car);
        if (Math.hypot(car.x - player.x, car.z - player.z) < 16) return;
        if (this.cars.some(other => overlap(other, car))) return;
        this.cars.push(car);
    }

    populate(player) {
        const i = Math.floor(player.x / TILE), j = Math.floor(player.z / TILE);
        const cell = `${i},${j}`;
        if (cell === this.cell) return;
        this.cell = cell;
        const wanted = new Set();
        for (const axis of ['z', 'x']) {
            const center = axis === 'z' ? i : j;
            const along = axis === 'z' ? player.z : player.x;
            for (let index = center - 2; index <= center + 3; index++) {
                if (axis === 'z' && !verticalStreet(index)) continue;
                for (const direction of [-1, 1]) {
                    const key = laneKey(axis, index, direction);
                    wanted.add(key);
                    if (this.lanes.has(key)) continue;
                    const lane = {axis, index, direction, serial: 0};
                    this.lanes.set(key, lane);
                    const offset = 24 + mod(index * 31 + direction * 19, spacing - 24);
                    const first = Math.floor((along - reach - offset) / spacing);
                    for (let slot = first; slot <= first + 7; slot++) this.spawn(lane, slot * spacing + offset, player);
                }
            }
        }
        for (const key of this.lanes.keys()) if (!wanted.has(key)) this.lanes.delete(key);
    }

    step(dt, time, player, onContact) {
        this.populate(player);
        const queues = new Map();
        for (let index = this.cars.length - 1; index >= 0; index--) {
            const car = this.cars[index];
            if (Math.abs(car.x - player.x) > retire || Math.abs(car.z - player.z) > retire) {
                this.cars.splice(index, 1);
                continue;
            }
            const key = laneKey(car.axis, car.lane, car.direction);
            if (!queues.has(key)) queues.set(key, []);
            queues.get(key).push(car);
        }

        for (const [key, queue] of queues) {
            queue.sort((a, b) => (b.along - a.along) * a.direction);
            for (const [index, car] of queue.entries()) this.advance(car, queue[index - 1], dt, time, player, onContact);
        }

        // Feed from beyond the fog only; the visible cars are real, persistent bodies.
        for (const [key, lane] of this.lanes) {
            const along = lane.axis === 'z' ? player.z : player.x;
            const entry = along - lane.direction * (reach + 22);
            const candidate = Math.abs(entry - Math.round(entry / TILE) * TILE) < 17 ? entry - lane.direction * 18 : entry;
            const queue = queues.get(key);
            const last = queue?.[queue.length - 1];
            if (!last || (last.along - candidate) * lane.direction > spacing) this.spawn(lane, candidate, player);
        }
    }

    advance(car, leader, dt, time, player, onContact) {
        const {axis, lane, direction, along, hl, kind} = car;
        // Keep an exact stop-line position on the approach side after rounding.
        const probe = along + direction * (hl + STOP_LINE - .00001);
        const junction = direction > 0 ? Math.ceil(probe / TILE) : Math.floor(probe / TILE);
        const at = junction * TILE;
        const i = axis === 'z' ? lane : junction, j = axis === 'z' ? junction : lane;
        let gap = Infinity;
        if (verticalStreet(i) && signalPhase(i, j, time) !== `${axis}-green`) gap = (at - along) * direction - STOP_LINE - hl;
        if (leader?.axis === axis) gap = Math.min(gap, (leader.along - along) * direction - leader.hl - hl - 1.15);

        const binRow = Math.floor(along / TILE);
        const bin = binRow * TILE + BIN_OFFSET;
        if (kind === 'waste' && axis === 'z' && direction < 0 && binAt(lane, binRow) && car.lastBin !== bin) {
            const distance = along - bin;
            if (distance >= -.0001) {
                gap = Math.min(gap, distance);
                if (distance < .08 && car.velocity < .5) {
                    car.dwell += dt;
                    if (car.dwell > 3.1) {
                        car.lastBin = bin;
                        car.dwell = 0;
                    }
                }
            }
        }

        let approach = Math.min(gap, 24);
        if (Math.abs(car.x - player.x) < 29 && Math.abs(car.z - player.z) < 29) {
            for (const distance of probes) {
                if (distance >= approach) break;
                const ahead = {...car, along: along + direction * distance};
                orient(ahead);
                if (overlap(ahead, player)) {
                    approach = Math.max(0, distance - 2);
                    break;
                }
            }
        }
        const target = Math.min(car.speed, Math.sqrt(2 * 5.5 * Math.max(0, approach)));
        const previousSpeed = car.velocity;
        car.velocity = target < previousSpeed
            ? Math.max(target, previousSpeed - dt * 12) : Math.min(target, previousSpeed + dt * 3);
        const step = Math.max(0, Math.min(gap, car.velocity * dt));
        car.along += direction * step;
        orient(car);
        const hitPlayer = step > 0 && overlap(car, player) > 0;
        const nearJunction = Math.abs(car.along - Math.round(car.along / TILE) * TILE) < 8;
        const hitOther = step > 0 && nearJunction &&
            this.cars.some(other => other !== car && overlap(car, other));
        if (hitPlayer || hitOther) {
            car.along = along;
            orient(car);
            if (hitPlayer) onContact(car, previousSpeed);
            car.velocity = 0;
        } else if (step === 0 && gap <= 0) car.velocity = 0;
    }
}
