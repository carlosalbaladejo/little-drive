import {TILE, verticalStreet, roadOffset} from './city.js?v=english-1';
import {district, riverCenter, shore, oppositeShore} from './world.js?v=performance-1';

import { t } from './locale.js';

const shades = {
    villas: '#bccf9a', city: '#d2c1a4', offices: '#b9c6b7', river: '#bbd4a6',
    beach: '#dfd09d', park: '#8eb790', hills: '#6b9f78', meadow: '#bec78b', westTown: '#e1bf92',
    desert: '#d7b280', town: '#e1bf92',
};
const directions = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];

export function showHeading(needle, label, heading) {
    needle.style.transform = `rotate(${-heading}rad)`;
    const direction = t(directions[(Math.round(heading / (Math.PI / 4)) + 8) % 8]);
    if (label.textContent !== direction) label.textContent = direction;
}

export function drawMinimap(context, {x, z, heading}) {
    const size = context.canvas.width;
    const half = size / 2;
    const scale = size / 370;
    const reach = half / scale;
    const firstColumn = Math.floor((x - reach) / TILE);
    const lastColumn = Math.ceil((x + reach) / TILE);
    const firstRow = Math.floor((z - reach) / TILE);
    const lastRow = Math.ceil((z + reach) / TILE);
    context.save();
    context.translate(half, half);
    context.scale(scale, scale);
    context.translate(-x, -z);

    for (let i = firstColumn; i < lastColumn; i++) {
        for (let j = firstRow; j < lastRow; j++) {
            context.fillStyle = shades[district(i, j)];
            context.fillRect(i * TILE, j * TILE, TILE + 1, TILE + 1);
        }
    }

    context.lineJoin = 'round';
    context.fillStyle = '#5f9fb3';
    context.beginPath();
    for (let sample = z - reach; sample <= z + reach + 10; sample += 10) {
        context.lineTo(shore(sample), sample);
    }
    for (let sample = z + reach + 10; sample >= z - reach - 10; sample -= 10) {
        context.lineTo(oppositeShore(sample), sample);
    }
    context.closePath();
    context.fill();
    context.strokeStyle = '#5f9fb3';
    context.lineWidth = 55;
    context.beginPath();
    for (let sample = z - reach; sample <= z + reach + 10; sample += 10) {
        context.lineTo(riverCenter(sample), sample);
    }
    context.stroke();

    context.lineWidth = 6.5;
    context.strokeStyle = '#5c695f';
    context.beginPath();
    for (let i = firstColumn; i <= lastColumn; i++) {
        if (!verticalStreet(i)) continue;
        context.moveTo(i * TILE, z - reach);
        context.lineTo(i * TILE, z + reach);
    }
    context.stroke();
    const end = x + reach + 8;
    for (let j = firstRow; j <= lastRow; j++) {
        const route = j === 0;
        context.strokeStyle = route ? '#8a562e' : '#5c695f';
        context.lineWidth = route ? 9 : 6.5;
        context.beginPath();
        for (let sample = x - reach - 8; sample < end; sample += 8) {
            context.lineTo(sample, j * TILE + roadOffset(j, sample));
        }
        if (end >= x - reach) context.lineTo(end, j * TILE + roadOffset(j, end));
        context.stroke();
    }
    context.restore();

    context.save();
    context.translate(half, half);
    context.rotate(heading);
    context.beginPath();
    context.moveTo(0, -14);
    context.lineTo(9, 10);
    context.lineTo(0, 6);
    context.lineTo(-9, 10);
    context.closePath();
    context.fillStyle = '#c24832';
    context.strokeStyle = '#fff6df';
    context.lineWidth = 2.8;
    context.stroke();
    context.fill();
    context.restore();

    context.fillStyle = '#203d49';
    context.fillRect(5, 5, 22, 21);
    context.fillStyle = '#fff6df';
    context.font = 'bold 13px sans-serif';
    context.textAlign = 'center';
    context.fillText('N', 16, 20);
}
