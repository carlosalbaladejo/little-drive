export const TILE = 144;
export const ROAD = 5;
export const WEST_TOWN = 'Valdecerro';

const REGION = 8;
const mod = (value, base) => ((value % base) + base) % base;
const regionIndex = tile => Math.floor((tile + 2) / REGION);
const townStart = region => mod(region, 3) * 2;

export function legacyArea(i, j) {
    return i >= -11 && i <= 5 && j >= -2 && j <= 1;
}

export function inWestTown(i, j) {
    return i >= -11 && i <= -9 && j >= -2 && j <= 1;
}

export function waterColumn(i) { return i === 1 || i === 5; }

export function generatedTown(i, j) {
    if (waterColumn(i) || legacyArea(i, j)) return false;
    const fromX = townStart(regionIndex(j) + 1), fromZ = townStart(regionIndex(i));
    const x = mod(i + 2, REGION), z = mod(j + 2, REGION);
    // The four-tile footprints stagger in both directions. Over three regions
    // their projections cover every through road, without a permanent empty lane.
    return x >= fromX && x < fromX + 4 && z >= fromZ && z < fromZ + 4;
}

const prefixes = ['Villa', 'Monte', 'Puerto', 'Peña', 'Val', 'Fuente', 'Torre', 'Río', 'Cerro', 'Puebla', 'Alto', 'Vega'];
const suffixes = [' del Olmo', ' de la Estepa', ' Serena', ' del Aire', ' del Alba', ' del Sol', ' de Sal',
    ' de los Pinos', ' de la Luna', ' Clara', ' del Laurel', ' de la Sierra', ' del Ámbar'];

export function townName(i, j) {
    if (inWestTown(i, j)) return WEST_TOWN;
    const a = regionIndex(i), b = regionIndex(j);
    return prefixes[mod(a * 7 + b * 5, prefixes.length)] + suffixes[mod(a * 3 - b * 7, suffixes.length)];
}

export function townTheme(i, j) {
    return mod(regionIndex(i) + 3 * regionIndex(j), 4);
}

export function verticalStreet(column) {
    return column !== -7 && column !== -5 && column !== -4;
}

export function countrySegment(column, row) {
    if (column >= -8 && column < -3) {
        return !generatedTown(column, row) && !generatedTown(column, row - 1)
            && !inWestTown(column, row) && !inWestTown(column, row - 1);
    }
    return !waterColumn(column) && column !== 6
        && !legacyArea(column, row) && !legacyArea(column, row - 1)
        && !inWestTown(column, row) && !inWestTown(column, row - 1)
        && !generatedTown(column, row) && !generatedTown(column, row - 1);
}

// Keep the remaining junctions straight. Between them the roads follow different
// bends, including across former grid intersections where no street branches off.
export function roadOffset(row, x) {
    const column = Math.floor(x / TILE);
    if (!countrySegment(column, row)) return 0;
    const within = x - column * TILE;
    const start = verticalStreet(column) ? 16 : 0;
    const end = verticalStreet(column + 1) ? TILE - 16 : TILE;
    const t = Math.max(0, Math.min(1, (within - start) / (end - start)));
    const wave = index => Math.sin(index * 2.18 + row * 2.71);
    const from = start === 0 && countrySegment(column - 1, row) ? wave(column) * 31 : 0;
    const to = end === TILE && countrySegment(column + 1, row) ? wave(column + 1) * 31 : 0;
    const blend = t * t * (3 - 2 * t);
    const bend = Math.sin(Math.PI * t) ** 2 * (13 + 17 * wave(column + .58));
    return from + (to - from) * blend + bend;
}

export function roadSlope(row, x) {
    return (roadOffset(row, x + .2) - roadOffset(row, x - .2)) / .4;
}

export const services = [
    {name: 'TALLER', color: 0xffbc58, wall: 0xf4d290},
    {name: 'HOSPITAL', color: 0xc52e47, wall: 0xf9eeec},
    {name: 'BOMBEROS', color: 0xb33729, wall: 0xe9ad92},
    {name: 'POLICÍA', color: 0x305e9e, wall: 0xb4d4ec},
];

export function serviceAt(i, j) {
    if (inWestTown(i, j)) {
        if (i === -9 && j === 0) return 0;
        return (i + j) % 3 === 0 ? 1 + Math.abs(j % 3) : -1;
    }
    if (generatedTown(i, j) && verticalStreet(i)) return mod(i * 5 + j * 7, 4);
    if (!legacyArea(i, j) || i < -4 || i >= 5 || i === 1 || !verticalStreet(i)) return -1;
    if (i === 0 && j === 0) return 0;
    if (i === 0 && j === -1) return 1;
    if (i === 2 && j === -1) return 2;
    if (i === -1 && j === -1) return 3;
    return (i + j * 2) % 3 === 0 ? ((i + j) % 4 + 4) % 4 : -1;
}

export function binAt(i, j) {
    // Bins face the northbound lane and are kept apart from the workshop driveway.
    const city = (legacyArea(i, j) && (i >= -4 || inWestTown(i, j))) || generatedTown(i, j);
    return verticalStreet(i) && city && (i + j) % 2 === 0;
}

export const BIN_OFFSET = 105;
export const STOP_LINE = 10.5;

export function signalPhase(i, j, time) {
    const cycle = ((time + ((i * 7 + j * 3) % 11)) % 25 + 25) % 25;
    if (cycle < 9) return 'z-green';
    if (cycle < 10.5) return 'z-amber';
    if (cycle < 12.5) return 'all-red';
    if (cycle < 21.5) return 'x-green';
    if (cycle < 23) return 'x-amber';
    return 'all-red';
}
