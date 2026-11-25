import * as THREE from './vendor/three.module.min.js';

import {TILE, ROAD, WEST_TOWN, inWestTown, verticalStreet, countrySegment, roadOffset, roadSlope,
    legacyArea, generatedTown, townName, townTheme, waterColumn,
    services, serviceAt, binAt, BIN_OFFSET, STOP_LINE, signalPhase} from './city.js?v=english-1';

export {TILE};
const STREET_SURFACE = .17;
const parkingSign = {name: 'P', color: 0x215d99};
const westSign = {name: WEST_TOWN.toUpperCase(), color: 0x276855};
const regionalWalls = [
    [0xffe3a8, 0xf0d7ad, 0xd3a07d, 0xdadfba],
    [0xe2d7be, 0xaaccba, 0xd3e1b9, 0xbac5c9],
    [0xeab88b, 0xf5d3a0, 0xcf8e72, 0xe5c4a4],
    [0xe9e4cf, 0xb5cdd0, 0xe8c5ac, 0xa3bbbf],
];
export const START = Object.freeze({x: TILE + 2.3, z: 72, heading: 0});

const sky = 0xbde4f0;
const color = new THREE.Color();
const palette = {
    road: 0x454c5d, walk: 0xd8c9ba, white: 0xfbf2de, yellow: 0xffd17b,
    water: 0x36b0c4, sea: 0x268fae, grass: 0x81b761, hill: 0x729861,
    stone: 0xa1a99a, sand: 0xf3d497, foam: 0xc2f4df, park: 0x75b56e, meadow: 0xb5bc70, desert: 0xdab481,
};
const districts = {
    villas: 'Barrio de chalets', city: 'Distrito urbano', offices: 'Distrito de oficinas',
    river: 'Paseo del Río', beach: 'Costa de las Sombrillas', hills: 'Montes Verdes', park: 'Parque de los Pinos',
    meadow: 'Praderas', desert: 'Tierras Secas',
    westTown: WEST_TOWN,
};
const shapes = {
    box: new THREE.BoxGeometry(1, 1, 1),
    cone: new THREE.ConeGeometry(.5, 1, 6),
    cylinder: new THREE.CylinderGeometry(.5, .5, 1, 8),
    crown: new THREE.IcosahedronGeometry(.58, 0),
};
const matte = new THREE.MeshLambertMaterial();
const vertexMatte = new THREE.MeshLambertMaterial({vertexColors: true});
const water = new THREE.MeshBasicMaterial({color: palette.water});
const sea = new THREE.MeshBasicMaterial({color: palette.sea});
const waterPlane = new THREE.PlaneGeometry(TILE, TILE).rotateX(-Math.PI / 2);
const marker = new THREE.Object3D();
const signMaterials = new Map();
const signalShades = [0xff354b, 0xffb82c, 0x62ef8e];
const signalGeometry = new THREE.BoxGeometry(.52, .27, .52);
const signalMaterial = new THREE.MeshBasicMaterial();
const binLidMaterial = new THREE.MeshLambertMaterial({color: 0x254f4b});
const signGeometry = new THREE.PlaneGeometry(1, 1);

function signMaterial(service, width = 256) {
    if (signMaterials.has(service.name)) return signMaterials.get(service.name);
    if (typeof document === 'undefined') return water;
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = 64;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#' + service.color.toString(16).padStart(6, '0');
    ctx.fillRect(0, 0, width, 64);
    ctx.strokeStyle = '#fff8e7';
    ctx.lineWidth = 3;
    ctx.strokeRect(4, 4, width - 8, 56);
    ctx.fillStyle = '#fffdf2';
    ctx.font = 'bold 34px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(service.name, width / 2, 34, width - 16);
    const map = new THREE.CanvasTexture(canvas);
    map.colorSpace = THREE.SRGBColorSpace;
    const material = new THREE.MeshBasicMaterial({map});
    signMaterials.set(service.name, material);
    return material;
}

function hash(x, z, salt = 0) {
    let n = Math.imul(x | 0, 0x41c64e6d) ^ Math.imul(z | 0, 0x27d4eb2d) ^ Math.imul(salt, 0x165667b1);
    n = Math.imul(n ^ (n >>> 16), 0x45d9f3b);
    return ((n ^ (n >>> 16)) >>> 0) / 4294967296;
}

function randomFor(x, z) {
    let counter = 0;
    return () => hash(x, z, ++counter);
}

function smooth(a, b, value) {
    const t = THREE.MathUtils.clamp((value - a) / (b - a), 0, 1);
    return t * t * (3 - 2 * t);
}

function noise(x, z) {
    const i = Math.floor(x), j = Math.floor(z);
    const u = smooth(0, 1, x - i), v = smooth(0, 1, z - j);
    return THREE.MathUtils.lerp(
        THREE.MathUtils.lerp(hash(i, j, 3), hash(i + 1, j, 3), u),
        THREE.MathUtils.lerp(hash(i, j + 1, 3), hash(i + 1, j + 1, 3), u), v);
}

export function riverCenter(z) { return 216 + Math.sin(z / 127) * 10 + Math.sin(z / 53) * 4; }
export function shore(z) { return 790 + Math.sin(z / 134) * 14 + Math.sin(z / 53) * 5; }
export function oppositeShore(z) { return 829 + Math.sin(z / 149) * 5; }

export function district(i, j) {
    if (i === 5) return 'beach';
    if (i === 1) return 'river';
    if (inWestTown(i, j)) return 'westTown';
    if (generatedTown(i, j)) return 'town';
    if (!legacyArea(i, j)) {
        const climate = noise(i * .23, j * .21);
        if (climate < .34) return 'desert';
        if (climate > .63) return 'hills';
        return climate > .51 ? 'park' : 'meadow';
    }
    const forestEdge = -6 - Math.round(noise(j * .34, 18) * 2);
    const forestRow = THREE.MathUtils.euclideanModulo(j + 3, 9);
    if (i < forestEdge || (i < -2 && forestRow >= 7)) return 'meadow';
    if (i < -2 && (i < -4 || noise(i * .21, j * .24) > .32)) return 'hills';
    if (j === 0 && i === 0) return 'villas';
    if (j === -1 && i === 0) return 'city';
    if (j === -1 && i === 2) return 'offices';
    const variation = noise(i * .57, j * .62);
    if (variation < .26) return 'park';
    if (variation < .49) return 'villas';
    if (variation < .69) return 'city';
    return 'offices';
}

export function elevation(x, z) {
    const upland = smooth(230, 580, -x);
    const roll = (noise(x / 165, z / 159) - .5) * (6 + upland * 27);
    const hill = Math.max(1.05, 2.8 + upland * 18 + roll + upland * (Math.sin(x / 91) * Math.cos(z / 115) * 8));
    const townDistance = Math.max(0, -11 * TILE - x, x + 8 * TILE, -2 * TILE - z, z - 2 * TILE);
    const grade = THREE.MathUtils.lerp(20 + roll * .16, hill, smooth(0, 100, townDistance));
    const i = Math.floor(x / TILE), j = Math.floor(z / TILE);
    let urban = grade;
    if (generatedTown(i, j)) {
        const dx = x - i * TILE, dz = z - j * TILE;
        let edge = TILE;
        if (dx < 40 && !generatedTown(i - 1, j)) edge = Math.min(edge, dx);
        if (dx > TILE - 40 && !generatedTown(i + 1, j)) edge = Math.min(edge, TILE - dx);
        if (dz < 40 && !generatedTown(i, j - 1)) edge = Math.min(edge, dz);
        if (dz > TILE - 40 && !generatedTown(i, j + 1)) edge = Math.min(edge, TILE - dz);
        const plateau = x > 0 ? 3.5 + 3.5 * noise(x / 900, z / 900) : 17 + 6 * noise(x / 900, z / 900);
        urban = THREE.MathUtils.lerp(grade, plateau, smooth(0, 40, edge));
    }
    const bank = smooth(22, 41, Math.abs(x - riverCenter(z)));
    const coast = Math.min(1, smooth(-14, 34, shore(z) - x) + smooth(-10, 26, x - oppositeShore(z)));
    return THREE.MathUtils.lerp(-3.7, urban, bank * coast);
}

function crossRoad(x, z) {
    const row = Math.round(z / TILE);
    const distance = Math.abs(z - row * TILE - roadOffset(row, x));
    return distance <= ROAD;
}

function northSouthRoad(x) {
    const column = Math.round(x / TILE);
    return verticalStreet(column) && Math.abs(x - column * TILE) <= ROAD;
}

export function surface(x, z) {
    if (crossRoad(x, z)) {
        const bridge = 1 - smooth(43, 61, Math.abs(x - riverCenter(z)));
        const causeway = 1 - smooth(48, 60, Math.abs(x - 804));
        return Math.max(elevation(x, z), 3.8 * bridge, 4.2 * causeway) + STREET_SURFACE;
    }
    return elevation(x, z) + (northSouthRoad(x) ? STREET_SURFACE : 0);
}

export function onRoad(x, z) {
    return crossRoad(x, z) || northSouthRoad(x);
}

export function labelAt(x, z) {
    if (crossRoad(x, z) && Math.abs(x - riverCenter(z)) < 53) return 'Puente del Río';
    if (crossRoad(x, z) && Math.abs(x - 804) < 48) return 'Puente de la Ría';
    const column = Math.round(x / TILE);
    const j = Math.floor(z / TILE);
    let i = Math.floor(x / TILE);
    if (Math.abs(x - column * TILE) <= ROAD) {
        if (column === 1) i = 0;
        if (column === 2 || column === 6) i = column;
        if (column === 5 && generatedTown(4, j)) i = 4;
    }
    const kind = district(i, j);
    return kind === 'town' ? townName(i, j) : districts[kind];
}

class Faces {
    positions = [];
    colors = [];

    quad(a, b, c, d, shade) {
        this.positions.push(...a, ...b, ...c, ...b, ...d, ...c);
        color.setHex(shade);
        for (let i = 0; i < 6; i++) this.colors.push(color.r, color.g, color.b);
    }

    mesh() {
        if (!this.positions.length) return null;
        const geometry = new THREE.BufferGeometry();
        geometry.setAttribute('position', new THREE.Float32BufferAttribute(this.positions, 3));
        geometry.setAttribute('color', new THREE.Float32BufferAttribute(this.colors, 3));
        geometry.computeVertexNormals();
        geometry.computeBoundingSphere();
        return new THREE.Mesh(geometry, vertexMatte);
    }
}

class TileBuilder {
    terrain = new Faces();
    road = new Faces();
    items = {};
    obstacles = [];
    signals = [];
    repair = null;
    binLid = null;

    constructor(i, j) {
        this.x = i * TILE;
        this.z = j * TILE;
        this.kind = district(i, j);
        this.rand = randomFor(i, j);
        this.i = i;
        this.j = j;
        this.group = new THREE.Group();
        // Between building rows, clear of crossings, lamps, bins and civic entrances.
        const urban = ['villas', 'city', 'offices'].includes(this.kind);
        if ((i === 1 && j === 0) || (urban && i >= -2 && hash(i, j, 91) < .48)
            || ((this.kind === 'westTown' || this.kind === 'town') && verticalStreet(i) && hash(i, j, 91) < .6)) {
            const along = i === 1 ? 48 : hash(i, j, 92) < .5 ? 48 : 96;
            this.parking = {x: this.x + 7.6, z: this.z + along, halfWidth: 1.75, halfLength: 3.5};
        }
    }

    point(x, z, height = elevation(x + this.x, z + this.z)) { return [x, height, z]; }

    item(shape, shade, x, y, z, w, h, d, rotation = 0) {
        (this.items[shape] || (this.items[shape] = [])).push({shade, x, y, z, w, h, d, rotation});
    }

    box(shade, x, y, z, w, h, d) { this.item('box', shade, x, y, z, w, h, d); }

    obstacle(x, z, w, d, scenery = false, deckZ) {
        this.obstacles.push({x: x + this.x, z: z + this.z, w: w / 2, d: d / 2, scenery, deckZ});
    }

    ground() {
        const grid = Array.from({length: TILE / 6 + 1}, (_, row) =>
            Array.from({length: TILE / 6 + 1}, (_, column) => this.point(column * 6, row * 6)));
        for (let row = 0; row < grid.length - 1; row++) {
            const z = row * 6;
            for (let column = 0; column < grid.length - 1; column++) {
                const x = column * 6;
                const a = grid[row][column], b = grid[row + 1][column];
                const c = grid[row][column + 1], d = grid[row + 1][column + 1];
                const wx = x + this.x + 3, wz = z + this.z + 3;
                const y = (a[1] + b[1] + c[1] + d[1]) / 4;
                const shade = this.kind === 'beach' ? palette.sand
                    : Math.abs(wx - riverCenter(wz)) < 35 ? 0xc7c594
                    : this.kind === 'desert' ? palette.desert
                    : this.kind === 'meadow' ? palette.meadow
                    : this.kind === 'hills' ? (y > 27 ? palette.stone : palette.hill)
                    : this.kind === 'park' ? palette.park : palette.grass;
                color.setHex(shade).multiplyScalar(.93 + noise(wx / 22, wz / 22) * .15);
                this.terrain.quad(a, b, c, d, color.getHex());
            }
        }
        if (this.kind === 'river' || this.kind === 'beach') {
            const plane = new THREE.Mesh(waterPlane, this.kind === 'river' ? water : sea);
            plane.position.set(TILE / 2, 0, TILE / 2);
            this.group.add(plane);
        }
    }

    paved(axis, from, to, low, high, shade, height, step = 4, offset) {
        const point = axis === 'z'
            ? (a, b) => this.point(b, a, height(this.x + b, this.z + a))
            : (a, b) => {
                const z = b + (offset ? offset(this.x + a) : 0);
                return this.point(a, z, height(this.x + a, this.z + z));
            };
        for (let a = from; a < to; a += step) {
            const b = Math.min(to, a + step);
            if (axis === 'z') this.road.quad(point(a, low), point(b, low), point(a, high), point(b, high), shade);
            else this.road.quad(point(a, low), point(a, high), point(b, low), point(b, high), shade);
        }
    }

    streets() {
        if (verticalStreet(this.i)) {
            const roadY = (x, z) => elevation(x, z) + STREET_SURFACE;
            const junctionY = surface;
            const curbY = (x, z) => elevation(x, z) + .26;
            this.paved('z', 0, TILE, -ROAD, ROAD, palette.road, junctionY);
            for (const offset of [-ROAD, ROAD]) {
                const side = Math.sign(offset);
                const bay = side > 0 && this.parking;
                const along = bay ? bay.z - this.z : 0;
                const opening = bay ? bay.halfLength + .5 : 0;
                const spans = bay ? [[ROAD + 1, along - opening], [along + opening, TILE - ROAD - 1]]
                    : [[ROAD + 1, TILE - ROAD - 1]];
                for (const [from, to] of spans) {
                    this.paved('z', from, to, Math.min(offset, offset + side * 2),
                        Math.max(offset, offset + side * 2), palette.walk, curbY);
                    this.paved('z', from, to, offset - side * .43 - .06,
                        offset - side * .43 + .06, palette.white, (x, z) => roadY(x, z) + .03);
                }
            }
            for (let z = 11; z <= TILE - 11; z += 10) {
                this.paved('z', z, z + 4, -.10, .10, palette.yellow, (x, zz) => roadY(x, zz) + .03);
            }
        }
        if (verticalStreet(this.i)) this.crossing();
        if (countrySegment(this.i, this.j)) {
            this.countryRoad();
            return;
        }
        const roadY = surface;
        const from = verticalStreet(this.i) ? ROAD : 0;
        const to = verticalStreet(this.i + 1) ? TILE - ROAD : TILE;
        this.paved('x', from, to, -ROAD, ROAD, palette.road, roadY);
        for (let x = 11; x <= TILE - 11; x += 10) {
            this.paved('x', x, x + 4, -.10, .10, palette.yellow, (xx, z) => roadY(xx, z) + .035);
        }
        for (const z of [-4.65, 4.65]) {
            this.paved('x', from, to, z - .06, z + .06, palette.white, (x, zz) => roadY(x, zz) + .03);
        }
        if (waterColumn(this.i)) this.bridge();
        else {
            for (const z of [-ROAD, ROAD]) {
                this.paved('x', 7, TILE - 7, Math.min(z, z + Math.sign(z) * 2),
                    Math.max(z, z + Math.sign(z) * 2), palette.walk, (x, zz) => elevation(x, zz) + .26);
            }
        }
    }

    countryRoad() {
        const from = verticalStreet(this.i) ? ROAD : 0;
        const to = verticalStreet(this.i + 1) ? TILE - ROAD : TILE;
        const offset = x => roadOffset(this.j, x);
        const roadY = (x, z) => elevation(x, z) + STREET_SURFACE;
        const paint = (x, z) => roadY(x, z) + .044;
        for (let z = -ROAD; z < ROAD; z += 2.5) {
            this.paved('x', from, to, z, z + 2.5, palette.road, roadY, 3, offset);
        }
        for (const z of [-4.6, 4.6]) {
            this.paved('x', from, to, z - .095, z + .095, palette.white, paint, 3, offset);
        }
        const markFrom = from ? 16 : 5, markTo = to === TILE ? TILE : TILE - 16;
        for (let x = markFrom; x + 4 <= markTo; x += 9) {
            this.paved('x', x, x + 4, -.15, .15, palette.yellow, paint, 2, offset);
        }
    }

    directionSign() {
        if (this.j !== 0 || ![-9, -6, -3, -1, 0].includes(this.i)) return;
        const x = 35, z = roadOffset(this.j, this.x + x) - 9;
        const y = elevation(this.x + x, this.z + z);
        this.item('cylinder', 0x53666a, x, y + 1.4, z, .15, 2.8, .15);
        this.obstacle(x, z, .15, .15, true);
        const sign = new THREE.Mesh(signGeometry, signMaterial(westSign));
        sign.position.set(x + .09, y + 2.68, z);
        sign.rotation.y = Math.PI / 2;
        sign.scale.set(7.9, 1.9, 1);
        this.group.add(sign);
    }

    clearOfRoad(x, z) {
        const wx = this.x + x, wz = this.z + z;
        const row = Math.round(wz / TILE);
        return Math.abs(wz - row * TILE - roadOffset(row, wx)) >= 11;
    }

    parkingScenery() {
        const {x, z, halfWidth, halfLength} = this.parking;
        const near = x - this.x - halfWidth, far = x - this.x + halfWidth;
        const from = z - this.z - halfLength, to = z - this.z + halfLength;
        const pavement = (x, z) => elevation(x, z) + .09;
        const paint = (x, z) => pavement(x, z) + .028;
        const ramp = (x, z) => elevation(x, z) + THREE.MathUtils.lerp(STREET_SURFACE, .09,
            (x - this.x - ROAD) / (near - ROAD));
        this.paved('z', from, to, ROAD, near, palette.road, ramp, 1);
        this.paved('z', from, to, near, far, 0x3c6791, pavement, 1);
        this.paved('z', from, to, far - .14, far, palette.white, paint, 1);
        for (const end of [from, to - .14]) {
            this.paved('z', end, end + .14, near, far, palette.white, paint);
        }
        for (let start = from + .7; start < to - .8; start += 1.5) {
            this.paved('z', start, start + .72, near, near + .13, palette.white, paint);
        }
        const signZ = to + .65;
        const y = this.point(far, signZ)[1];
        this.item('cylinder', 0x53666a, far, y + 1.2, signZ, .11, 2.4, .11);
        this.obstacle(far, signZ, .11, .11, true);
        for (const side of [-1, 1]) {
            const sign = new THREE.Mesh(signGeometry, signMaterial(parkingSign, 64));
            sign.scale.set(1.55, 1.55, 1);
            sign.position.set(far, y + 2.38, signZ + side * .07);
            sign.rotation.y = side > 0 ? 0 : Math.PI;
            this.group.add(sign);
        }
    }

    crossing() {
        const paint = (x, z) => surface(x, z) + .044;
        for (const [axis, direction, x, z] of [['z', 1, -6.35, -8], ['z', -1, 6.35, 8],
            ['x', 1, -8, 6.35], ['x', -1, 8, -6.35]]) {
            for (let stripe = -4.35; stripe < 4; stripe += 1.2) {
                const near = direction * 6, far = direction * 9;
                this.paved(axis, Math.min(near, far), Math.max(near, far),
                    stripe, stripe + .64, palette.white, paint, 1.5);
            }
            const line = -direction * STOP_LINE;
            const lane = axis === 'z' ? -direction : direction;
            this.paved(axis, line - .16, line + .16, Math.min(0, lane * 4.6),
                Math.max(0, lane * 4.6), palette.white, paint);
            const y = this.point(x, z)[1];
            this.item('cylinder', 0x52616b, x, y + 1.34, z, .16, 2.68, .16);
            this.obstacle(x, z, .16, .16, true);
            this.box(0x252d39, x, y + 3, z, .49, 1.12, .49);
            this.signals.push({axis, x, y: y + 3, z});
        }
    }

    civicScenery() {
        if (binAt(this.i, this.j)) {
            const x = 7.15, z = BIN_OFFSET, y = this.point(x, z)[1];
            this.box(0x488473, x, y + .62, z, 1.42, 1.24, 1.98);
            const hinge = new THREE.Group();
            hinge.position.set(x + .76, y + 1.29, z);
            const lid = new THREE.Mesh(shapes.box, binLidMaterial);
            lid.position.x = -.76;
            lid.scale.set(1.57, .18, 2.08);
            hinge.add(lid);
            this.group.add(hinge);
            this.binLid = hinge;
            this.box(0xece7bd, x - .72, y + .74, z, .04, .25, .54);
            this.obstacle(x, z, 1.42, 1.98);
        }
        const kind = serviceAt(this.i, this.j);
        if (kind < 0) return;
        const service = services[kind];
        const x = 23, z = 72, y = this.point(x, z)[1];
        this.paved('x', 5, 26, z - 7, z + 7, 0xdcd1bb, (x, z) => elevation(x, z) + .20);
        this.building(x, z, 12, 19, kind === 1 ? 9 : 5.5, service.wall, 'city');
        for (let k = -1; k <= 1; k++) {
            this.box(service.color, x - 6.06, y + 1.37, z + k * 5.3, .14, 2.75, 4.15);
            this.box(0x294757, x - 6.15, y + 2.15, z + k * 5.3, .12, .60, 3);
        }
        if (kind === 1) {
            this.box(0xc52e47, x - 6.17, y + 7, z, .15, 1.9, .56);
            this.box(0xc52e47, x - 6.17, y + 7, z, .15, .56, 1.9);
        }
        for (const [sx, sz, angle] of [[x - 6.18, z, -Math.PI / 2],
            [x, z + 9.64, 0], [x, z - 9.64, Math.PI]]) {
            const sign = new THREE.Mesh(signGeometry, signMaterial(service));
            sign.position.set(sx, y + 4.1, sz);
            sign.rotation.y = angle;
            sign.scale.set(8.5, 2.1, 1);
            this.group.add(sign);
        }
        if (kind === 0) {
            this.repair = {x: this.x + 11.2, z: this.z + z};
            for (const off of [-3.4, 3.4]) this.paved('x', 7, 15, z + off - .12, z + off + .12,
                0xffde74, (x, z) => elevation(x, z) + .235);
        }
    }

    bridge() {
        for (const z of [-5.25, 5.25]) {
            const deck = x => surface(this.x + x, this.z);
            this.paved('x', 12, TILE - 12, Math.min(z, Math.sign(z) * ROAD),
                Math.max(z, Math.sign(z) * ROAD), 0x8ba5ad, x => surface(x, this.z) + .04);
            this.paved('x', 12, TILE - 12, z - .12, z + .12, 0xe0e8e5, x => surface(x, this.z) + .95);
            for (let x = 12; x <= TILE - 12; x += 6) {
                this.box(0xf9e7d2, x, deck(x) + .51, z, .31, 1.02, .31);
                const length = Math.min(6, TILE - 12 - x);
                this.obstacle(x + length / 2, z, length + .31, .31, true, this.z);
            }
            for (const x of [48, 96]) {
                const top = deck(x) - .16, bottom = -3.7;
                this.box(0x8398a0, x, (top + bottom) / 2, z * .72, 2.6, top - bottom, 1.5);
            }
        }
    }

    shade(x, z, rx, rz) {
        const corners = (a, b) => this.point(x + a * rx, z + b * rz, elevation(
            this.x + x + a * rx, this.z + z + b * rz) + .045);
        this.terrain.quad(corners(-1, -1), corners(-1, 1), corners(1, -1), corners(1, 1), 0x699655);
    }

    tree(x, z, size, kind = 'round') {
        const y = this.point(x, z)[1];
        if (y < .1) return;
        if (this.kind !== 'beach' && Math.abs(riverCenter(this.z + z) - (this.x + x)) > 37)
            this.shade(x + size * .21, z + size * .09, size * .23, size * .19);
        const trunk = kind === 'palm' ? size * .76 : size * .52;
        this.item('cylinder', 0x9e735d, x, y + trunk / 2, z, size * .12, trunk, size * .12);
        this.obstacle(x, z, size * .12, size * .12, true);
        if (kind === 'palm') {
            for (let i = 0; i < 5; i++) {
                const theta = i * Math.PI * .4;
                this.item('crown', i % 2 ? 0x5bb45e : 0x398d65, x + Math.sin(theta) * size * .27, y + trunk,
                    z + Math.cos(theta) * size * .27, size * .36, size * .19, size * .65, theta);
            }
        } else {
            const pine = kind === 'pine';
            this.item(pine ? 'cone' : 'crown', pine ? 0x35795c : 0x55a357,
                x, y + size * .69, z, size * .78, size * .77, size * .78);
            if (pine) this.item('cone', 0x56946a, x, y + size * .95, z, size * .56, size * .62, size * .56);
        }
    }

    building(x, z, w, d, h, shade, kind) {
        const floor = this.point(x, z)[1];
        this.obstacle(x, z, w, d);
        this.box(0xe9d2b2, x, floor - .15, z, w + 3, .60, d + 3);
        this.box(shade, x, floor + h / 2 - .15, z, w, h + .30, d);
        this.box(kind === 'villas' ? 0xc76452 : 0xb8d4cb, x, floor + h + .15, z, w + .60, .34, d + .60);
        if (kind === 'villas') {
            this.item('cone', 0xce7456, x, floor + h + 1.27, z, w * 1.38, 2.5, d * 1.38, Math.PI / 4);
            this.box(0x865a4c, x, floor + 1.34, z + d / 2 + .04, 1.18, 2.5, .08);
        } else {
            this.box(kind === 'offices' ? 0x86a2ac : shade, x - w / 5, floor + h + .95, z + d / 8, w * .33, 1.30, d * .39);
        }
        const windowShade = kind === 'offices' ? 0x3d647c : 0x537184;
        const interval = kind === 'offices' ? 3.05 : 3.5;
        for (let level = 2.05; level < h - .65; level += interval) {
            const y = floor + level;
            const windows = kind === 'offices' ? 1 : 3;
            for (let k = 0; k < windows; k++) {
                const shift = (k - (windows - 1) / 2) * .28;
                for (const side of [-1, 1]) {
                    if (kind !== 'villas' || k !== 1) {
                        this.box(windowShade, x + w * shift, y, z + side * (d / 2 + .04),
                            w * (kind === 'offices' ? .88 : .153), 1.12, .08);
                    }
                    this.box(windowShade, x + side * (w / 2 + .04), y, z + d * shift,
                        .08, 1.12, d * (kind === 'offices' ? .88 : .153));
                }
            }
        }
    }

    streetFurniture() {
        // Alternate street lights; keep the view uncluttered at junctions.
        const x = 8.3;
        for (const z of [25, 73, 121]) {
            if (z === 73 && serviceAt(this.i, this.j) >= 0) continue;
            const y = this.point(x, z)[1];
            this.item('cylinder', 0x53666a, x, y + 2.4, z, .17, 4.8, .17);
            this.obstacle(x, z, .17, .17, true);
            this.box(0x53666a, x - .6, y + 4.73, z, 1.27, .14, .13);
            this.box(0xffe9a3, x - 1.19, y + 4.59, z, .45, .16, .30);
        }
    }

    scenery() {
        const rand = this.rand;
        if (this.kind === 'beach') {
            for (const z of [23, 59, 105, 130]) {
                this.tree(19 + rand() * 7, z, 6 + rand() * 3, 'palm');
                const x = shore(this.z + z) - this.x - 22;
                const y = this.point(x, z)[1];
                this.box(0xf7e9c6, x, y + .76, z, .12, 1.52, .12);
                this.item('cone', rand() > .5 ? 0xff8c63 : 0x36a9ae, x, y + 1.67, z, 3.6, .55, 3.6);
                this.box(0xfbf1db, x + 1.1, y + .13, z + 1.3, 1.4, .22, .67);
                for (let step = 0; step < 3; step++) {
                    this.box(palette.foam, x + 31 + step * 4, .015, z + step * 3, .36, .025, 5 + rand() * 6);
                }
            }
            this.paved('x', 7, 40, 62, 68, 0xd3c09e, (x, z) => elevation(x, z) + .16);
            return;
        }
        if (this.kind === 'river') {
            for (let z = 14; z < TILE - 9; z += 10) {
                this.tree(14 + rand() * 9, z, 4 + rand() * 4, rand() > .65 ? 'palm' : 'round');
                this.tree(121 + rand() * 9, z, 4 + rand() * 3, 'round');
            }
            return;
        }
        if (this.kind === 'meadow' || this.kind === 'desert') {
            const reserved = serviceAt(this.i, this.j) >= 0;
            const dry = this.kind === 'desert';
            for (let i = 0; i < (dry ? 20 : 13); i++) {
                const x = 14 + rand() * 116, z = 14 + rand() * 116, size = .6 + rand() * 1.8;
                if (reserved && x < 37 && Math.abs(z - 72) < 17) continue;
                if (!this.clearOfRoad(x, z)) continue;
                const y = this.point(x, z)[1];
                const tall = dry && i % 4 === 0;
                this.item(tall ? 'cylinder' : 'crown', tall ? 0x618051 : dry ? 0xad8058 : i % 3 ? 0xa6a77d : 0xc4b39b,
                    x, y + size * (tall ? .66 : .19), z, size * (tall ? .52 : 1.7), size * (tall ? 1.32 : .64), size, rand() * Math.PI);
                if (tall) this.obstacle(x, z, size * .52, size, true);
            }
            return;
        }
        if (this.kind === 'hills' || this.kind === 'park') {
            const reserved = serviceAt(this.i, this.j) >= 0;
            const trees = this.kind === 'hills' && district(this.i - 1, this.j) === 'meadow' ? 19 : 44;
            for (let i = 0; i < trees; i++) {
                const x = 12 + rand() * 121, z = 12 + rand() * 121;
                const size = 3 + rand() * 8, treeKind = this.kind === 'hills' || rand() > .65 ? 'pine' : 'round';
                if (reserved && x < 37 && Math.abs(z - 72) < 17) continue;
                if (!this.clearOfRoad(x, z)) continue;
                this.tree(x, z, size, treeKind);
                if (i % 5 === 0) {
                    const y = this.point(x + 2, z + 1)[1];
                    this.item('crown', 0xa7af91, x + 2, y + .4, z + 1, 1.8, 1.2, 1.4);
                }
            }
            return;
        }
        this.streetFurniture();
        const villas = this.kind === 'villas', offices = this.kind === 'offices';
        const town = this.kind === 'westTown' || this.kind === 'town';
        const walls = this.kind === 'town' ? regionalWalls[townTheme(this.i, this.j)]
            : town ? [0xf3cb8d, 0xf2e2ba, 0xdb9973, 0xd5ded0]
            : villas ? [0xffe2ab, 0xe9ba9c, 0xffefe0, 0xcfe9cf]
            : offices ? [0x87c9c5, 0x87aab9, 0xb7d6d6, 0x98aec7]
            : [0xefbf9c, 0xf2dca8, 0xe49d83, 0xe1e4c6];
        for (let gx = 0; gx < 3; gx++) {
            for (let gz = 0; gz < 3; gz++) {
                const perimeter = gx !== 1 || gz !== 1;
                if (!perimeter || rand() < .085) continue;
                const x = 24 + gx * 48 + rand() * 6 - 3, z = 24 + gz * 48 + rand() * 6 - 3;
                const w = (villas ? 10 : 17) + rand() * 10, d = (villas ? 8 : 17) + rand() * 8;
                const h = (villas ? 4 : offices ? 16 : town ? 5 : 8) + rand() * (villas ? 2 : offices ? 21 : town ? 7 : 11);
                const shade = walls[Math.floor(rand() * walls.length)];
                const reserved = gx === 0 && gz === 1 && serviceAt(this.i, this.j) >= 0;
                if (!reserved) this.building(x, z, w, d, h, shade, this.kind);
                this.tree(x + 13, z + 13, 4 + rand() * 3, villas ? 'round' : 'palm');
                if (villas) {
                    this.tree(x - 10, z + 9, 3 + rand() * 2);
                    const yard = z + d / 2 + 5;
                    const y = this.point(x, yard)[1];
                    for (const side of reserved ? [] : [-1, 1]) {
                        const railX = x + side * (w / 4 + 1.3);
                        this.box(0xf1e6ca, railX, y + .38, yard, w / 2, .27, .18);
                        this.obstacle(railX, yard, w / 2, .21, true);
                        for (let p = 0; p < 5; p++) this.box(0xfdf1d9,
                            x + side * (1.4 + w * p / 9), y + .39, yard, .22, .80, .21);
                    }
                    if (!reserved) this.paved('z', z + d / 2, yard + 2, x - 1.1, x + 1.1, 0xe7d4b2,
                        (xx, zz) => elevation(xx, zz) + .12);
                }
            }
        }
        for (const z of [48, 96]) {
            if (this.z + z !== this.parking?.z) this.tree(9, z, 5, 'palm');
        }
        if (town) {
            const y = elevation(this.x + 72, this.z + 72);
            const plaza = (x, z) => elevation(x, z) + .13;
            this.paved('x', 56, 88, 56, 88, 0xe1c59c, plaza);
            this.item('cylinder', 0x287e76, 72, y + .51, 72, 7, .8, 7);
            this.item('cylinder', 0x46b6c8, 72, y + .94, 72, 5.9, .1, 5.9);
            this.obstacle(72, 72, 7, 7);
        }
    }

    finish() {
        this.ground();
        this.streets();
        this.directionSign();
        if (this.parking) this.parkingScenery();
        this.scenery();
        this.civicScenery();
        for (const faces of [this.terrain, this.road]) {
            const mesh = faces.mesh();
            if (mesh) this.group.add(mesh);
        }
        for (const [shape, items] of Object.entries(this.items)) {
            const mesh = new THREE.InstancedMesh(shapes[shape], matte, items.length);
            for (const [index, {x, y, z, w, h, d, rotation, shade}] of items.entries()) {
                marker.position.set(x, y, z);
                marker.scale.set(w, h, d);
                marker.rotation.y = rotation;
                marker.updateMatrix();
                mesh.setMatrixAt(index, marker.matrix);
                mesh.setColorAt(index, color.setHex(shade));
            }
            mesh.computeBoundingSphere();
            this.group.add(mesh);
        }
        let lamps;
        if (this.signals.length) {
            lamps = new THREE.InstancedMesh(signalGeometry, signalMaterial, 3 * this.signals.length);
            marker.rotation.y = 0;
            marker.scale.set(1, 1, 1);
            this.signals.forEach(({x, y, z}, index) => {
                for (let light = 0; light < 3; light++) {
                    marker.position.set(x, y + .34 * (1 - light), z);
                    marker.updateMatrix();
                    lamps.setMatrixAt(3 * index + light, marker.matrix);
                    lamps.setColorAt(3 * index + light, color.setHex(0x434143));
                }
            });
            lamps.computeBoundingSphere();
            this.group.add(lamps);
        }
        return {group: this.group, obstacles: this.obstacles, x: this.x, z: this.z,
            parking: this.parking, repair: this.repair, binLid: this.binLid,
            lamps, signals: this.signals, i: this.i, j: this.j};
    }
}

export class World {
    scene = new THREE.Scene();
    tiles = new Map();
    originX = 0;
    originZ = 0;
    streamCell = '';
    pending = false;

    constructor(fogFar = 292) {
        // An identity scene must not force WorldMatrix updates on static tiles every frame.
        this.scene.matrixAutoUpdate = false;
        this.scene.background = new THREE.Color(sky);
        this.scene.fog = new THREE.Fog(sky, 90, fogFar);
        this.streamRadius = fogFar + 66;
        this.scene.add(new THREE.HemisphereLight(0xfff8ea, 0x819d99, 2.1));
        const sun = new THREE.DirectionalLight(0xffe6be, 2.3);
        sun.position.set(-45, 85, 55);
        this.scene.add(sun);
    }

    add(i, j, time) {
        const tile = new TileBuilder(i, j).finish();
        tile.group.position.set(tile.x - this.originX, 0, tile.z - this.originZ);
        // Static scenery only needs new transforms when the world origin moves.
        tile.group.traverse(object => {
            if (object === tile.binLid) return;
            object.updateMatrix();
            object.matrixAutoUpdate = false;
        });
        this.tiles.set(`${i},${j}`, tile);
        this.scene.add(tile.group);
        this.light(tile, time);
    }

    update(x, z, time = 0, preload = false) {
        const i = Math.floor(x / TILE), j = Math.floor(z / TILE);
        const cold = preload || !this.tiles.size || !this.tiles.has(`${i},${j}`);
        const rebase = i * TILE !== this.originX || j * TILE !== this.originZ;
        if (rebase) {
            this.originX = i * TILE;
            this.originZ = j * TILE;
        }
        if (cold) {
            for (let a = i - 1; a <= i + 1; a++) {
                for (let b = j - 1; b <= j + 1; b++) {
                    if (!this.tiles.has(`${a},${b}`)) this.add(a, b, time);
                }
            }
        }

        // Stream past the fog so tiles are ready before they enter the view.
        // Use a small grid for look-ahead invalidation.
        const streamCell = `${Math.floor(x / 12)},${Math.floor(z / 12)}`;
        let nearest, retire;
        if (cold || streamCell !== this.streamCell || this.pending) {
            this.streamCell = streamCell;
            for (let a = i - 3; a <= i + 3; a++) {
                for (let b = j - 3; b <= j + 3; b++) {
                    if (this.tiles.has(`${a},${b}`)) continue;
                    const dx = Math.max(0, a * TILE - x, x - (a + 1) * TILE);
                    const dz = Math.max(0, b * TILE - z, z - (b + 1) * TILE);
                    const distance = dx * dx + dz * dz;
                    if (distance <= this.streamRadius ** 2 && (!nearest || distance < nearest.distance)) {
                        nearest = {a, b, distance};
                    }
                }
            }
        }
        for (const [key, tile] of this.tiles) {
            const distance = Math.max(Math.abs(i - tile.i), Math.abs(j - tile.j));
            if (distance > 3) retire = {tile, key};
            if (rebase) {
                tile.group.position.set(tile.x - this.originX, 0, tile.z - this.originZ);
                tile.group.updateMatrix();
            }
            tile.group.visible = distance <= 3;
            if (tile.group.visible) this.light(tile, time);
        }
        this.pending = Boolean(nearest);
        if (nearest) this.add(nearest.a, nearest.b, time);
        if (retire) {
            const {tile, key} = retire;
            tile.group.removeFromParent();
            for (const mesh of tile.group.children) {
                if (mesh.isInstancedMesh) mesh.dispose();
                else if (mesh.isMesh && mesh.geometry !== waterPlane && mesh.geometry !== signGeometry) mesh.geometry.dispose();
            }
            this.tiles.delete(key);
        }
    }

    light(tile, time) {
        if (!tile.lamps) return;
        const phase = signalPhase(tile.i, tile.j, time);
        if (tile.phase === phase) return;
        tile.phase = phase;
        tile.signals.forEach(({axis}, index) => {
            const active = phase === `${axis}-green` ? 2 : phase === `${axis}-amber` ? 1 : 0;
            for (let light = 0; light < 3; light++) tile.lamps.setColorAt(3 * index + light,
                color.setHex(light === active ? signalShades[light] : 0x434143));
        });
        tile.lamps.instanceColor.needsUpdate = true;
    }

    animateBins(cars) {
        for (const tile of this.tiles.values()) {
            if (tile.binLid) tile.binLid.rotation.z = 0;
        }
        for (const car of cars) {
            if (car.kind !== 'waste' || car.dwell <= 0) continue;
            const lid = this.tiles.get(`${car.lane},${Math.floor(car.along / TILE)}`)?.binLid;
            if (lid) lid.rotation.z = -1.28 * Math.sin(Math.PI * Math.min(1, car.dwell / 3.1));
        }
    }

    nearRepair(x, z) {
        const repair = this.tiles.get(`${Math.floor(x / TILE)},${Math.floor(z / TILE)}`)?.repair;
        return repair && Math.abs(x - repair.x) < 3.6 && Math.abs(z - repair.z) < 6.5;
    }

    parkingFor(car) {
        const bay = this.tiles.get(`${Math.floor(car.x / TILE)},${Math.floor(car.z / TILE)}`)?.parking;
        if (!bay) return null;
        // Project the entire oriented car onto the two axes of the painted bay.
        const width = car.hw * Math.abs(car.fz) + car.hl * Math.abs(car.fx);
        const length = car.hw * Math.abs(car.fx) + car.hl * Math.abs(car.fz);
        return Math.abs(car.x - bay.x) + width <= bay.halfWidth &&
            Math.abs(car.z - bay.z) + length <= bay.halfLength ? bay : null;
    }

    blocked(x, z) {
        const i = Math.floor(x / TILE), j = Math.floor(z / TILE);
        const tile = this.tiles.get(`${i},${j}`);
        return tile?.obstacles.some(box => !box.scenery &&
            Math.abs(x - box.x) < box.w + 1.12 && Math.abs(z - box.z) < box.d + 1.12);
    }

    carObstacle(car) {
        const {x, z, fx, fz, hw, hl} = car;
        const ex = Math.abs(fx), ez = Math.abs(fz);
        const width = hl * ex + hw * ez, depth = hl * ez + hw * ex;
        // Include adjacent builders: junction posts can sit just outside their tile.
        const margin = 16;
        for (let i = Math.floor((x - width - margin) / TILE); i <= Math.floor((x + width + margin) / TILE); i++) {
            for (let j = Math.floor((z - depth - margin) / TILE); j <= Math.floor((z + depth + margin) / TILE); j++) {
                const tile = this.tiles.get(`${i},${j}`);
                if (!tile) continue;
                for (const box of tile.obstacles) {
                    const dx = box.x - x, dz = box.z - z;
                    if (Math.abs(dx) >= box.w + width || Math.abs(dz) >= box.d + depth) continue;
                    if (Math.abs(dx * fx + dz * fz) >= hl + box.w * ex + box.d * ez ||
                        Math.abs(dx * fz - dz * fx) >= hw + box.w * ez + box.d * ex) continue;
                    if (box.deckZ !== undefined && Math.abs(surface(x, z) - surface(x, box.deckZ)) > 1.6) continue;
                    return box;
                }
            }
        }
        return null;
    }

    // Project onto the closest usable street. Across water, prefer this bank or a real bridge.
    recover(x, z) {
        let column = Math.round(x / TILE);
        if (!verticalStreet(column)) {
            let west = column - 1, east = column + 1;
            while (!verticalStreet(west)) west--;
            while (!verticalStreet(east)) east++;
            column = x - west * TILE < east * TILE - x ? west : east;
        }
        const vx = column * TILE;
        const vertical = {x: vx + 2.25, z, heading: 0};
        const row = Math.round(z / TILE);
        const hx = x;
        const horizontal = {x: hx, z: row * TILE + roadOffset(row, hx) + 2.25,
            heading: Math.PI / 2 + Math.atan(roadSlope(row, hx))};
        const distance = pose => Math.hypot(pose.x - x, pose.z - z);
        return distance(vertical) <= distance(horizontal) ? vertical : horizontal;
    }
}
