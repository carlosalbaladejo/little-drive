import * as THREE from './vendor/three.module.min.js';
import {surface, onRoad} from './world.js?v=performance-1';

// Wheelbase samples, in the car's local frame (front is -Z).
export function groundPose(x, z, heading) {
    const fx = Math.sin(heading), fz = -Math.cos(heading);
    const rx = Math.cos(heading), rz = Math.sin(heading);
    const front = surface(x + fx * 1.28, z + fz * 1.28);
    const rear = surface(x - fx * 1.28, z - fz * 1.28);
    const right = surface(x + rx * .86, z + rz * .86);
    const left = surface(x - rx * .86, z - rz * .86);
    return {
        pitch: Math.atan2(front - rear, 2.56),
        roll: Math.atan2(right - left, 1.72),
        y: Math.max(surface(x, z), (front + rear + right + left) / 4),
    };
}

class ParticlePool {
    constructor(scene, count, dust) {
        this.dust = dust;
        this.cursor = 0;
        this.particles = Array.from({length: count}, () => ({life: 0}));
        const geometry = new THREE.BufferGeometry();
        for (const [name, size] of [['position', 3], ['color', 3], ['size', 1], ['alpha', 1]]) {
            geometry.setAttribute(name, new THREE.BufferAttribute(new Float32Array(count * size), size)
                .setUsage(THREE.DynamicDrawUsage));
        }
        this.geometry = geometry;
        this.material = new THREE.ShaderMaterial({
            transparent: true, depthWrite: false,
            uniforms: {
                pixelScale: {value: 1}, fogColor: {value: scene.fog.color},
                fogNear: {value: scene.fog.near}, fogFar: {value: scene.fog.far},
            },
            vertexShader: `attribute float size; attribute float alpha; attribute vec3 color;
                uniform float pixelScale;
                varying float opacity; varying vec3 tint; varying float distanceToEye;
                void main() {
                    vec4 mv = modelViewMatrix * vec4(position, 1.0);
                    gl_Position = projectionMatrix * mv;
                    gl_PointSize = clamp(size * pixelScale / max(0.2, -mv.z), 1.0, 64.0);
                    opacity = alpha; tint = color; distanceToEye = -mv.z;
                }`,
            fragmentShader: `uniform vec3 fogColor;
                uniform float fogNear;
                uniform float fogFar;
                varying float opacity; varying vec3 tint; varying float distanceToEye;
                void main() {
                    float radius = length(gl_PointCoord - 0.5) * 2.0;
                    float edge = 1.0 - smoothstep(${dust ? '0.12' : '0.35'}, 1.0, radius);
                    if (edge * opacity < 0.01) discard;
                    gl_FragColor = vec4(mix(tint, fogColor, smoothstep(fogNear, fogFar, distanceToEye)), edge * opacity);
                }`,
        });
        this.points = new THREE.Points(geometry, this.material);
        // World-space positions are rebased at draw time, so do not cache a bounding sphere.
        this.points.frustumCulled = false;
        scene.add(this.points);
    }

    emit(x, y, z, vx, vy, vz, size, life) {
        const p = this.particles[this.cursor];
        this.cursor = (this.cursor + 1) % this.particles.length;
        Object.assign(p, {x, y, z, vx, vy, vz, size, life, duration: life});
    }

    step(dt) {
        for (const p of this.particles) {
            if (p.life <= 0) continue;
            p.life = Math.max(0, p.life - dt);
            p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt;
            p.vy -= (this.dust ? .15 : 8) * dt;
        }
    }

    draw(originX, originZ, pixelScale) {
        const a = this.geometry.attributes;
        let count = 0;
        for (const p of this.particles) {
            if (p.life <= 0) continue;
            const t = p.life / p.duration;
            a.position.setXYZ(count, p.x - originX, p.y, p.z - originZ);
            a.size.setX(count, p.size * (this.dust ? 2.4 - 1.4 * t : .5 + .5 * t));
            a.alpha.setX(count, t * (this.dust ? .36 : 1));
            a.color.setXYZ(count, this.dust ? .74 : 1, this.dust ? .63 : .55 + .4 * t, this.dust ? .45 : .15);
            count++;
        }
        this.points.visible = count > 0;
        if (!count) return;
        this.geometry.setDrawRange(0, count);
        for (const attribute of Object.values(a)) {
            attribute.clearUpdateRanges();
            attribute.addUpdateRange(0, count * attribute.itemSize);
            attribute.needsUpdate = true;
        }
        this.material.uniforms.pixelScale.value = pixelScale;
    }

    clear() { for (const p of this.particles) p.life = 0; }
}

export class DrivingEffects {
    constructor(scene) {
        this.dust = new ParticlePool(scene, 160, true);
        this.sparks = new ParticlePool(scene, 64, false);
        this.ripple = new THREE.Mesh(new THREE.RingGeometry(.84, 1, 48).rotateX(-Math.PI / 2),
            new THREE.MeshBasicMaterial({color: 0xe0fffa, transparent: true, depthWrite: false}));
        this.ripple.visible = false;
        scene.add(this.ripple);
        this.cooldown = 0;
        this.dustDistance = 0;
        this.bump = 0;
    }

    impact(x, z, dx, dz, strength) {
        if (this.cooldown > 0 || strength < .8) return;
        this.cooldown = .28;
        this.bump = Math.min(.13, strength * .012);
        const y = surface(x, z) + .9;
        for (let i = 0; i < 10 + Math.min(18, Math.floor(strength)); i++) {
            const angle = Math.random() * Math.PI * 2;
            const speed = 3 + Math.random() * 5;
            this.sparks.emit(x, y, z, Math.cos(angle) * speed - dx, 4 + Math.random() * 5,
                Math.sin(angle) * speed - dz, .09 + Math.random() * .10, .35 + Math.random() * .3);
        }
    }

    step(dt, pose, velocity) {
        this.cooldown = Math.max(0, this.cooldown - dt);
        this.bump = THREE.MathUtils.damp(this.bump, 0, 14, dt);
        this.dust.step(dt); this.sparks.step(dt);
        if (Math.abs(velocity) < .8) { this.dustDistance = 0; return; }
        this.dustDistance += Math.abs(velocity) * dt;
        if (this.dustDistance < .55) return;
        this.dustDistance %= .55;
        const fx = Math.sin(pose.heading), fz = -Math.cos(pose.heading);
        const rx = Math.cos(pose.heading), rz = Math.sin(pose.heading);
        // Use each trailing wheel: a tyre on the verge can kick up dust independently.
        for (const side of [-1, 1]) {
            const x = pose.x - fx * 1.28 * Math.sign(velocity) + rx * side * .86;
            const z = pose.z - fz * 1.28 * Math.sign(velocity) + rz * side * .86;
            if (onRoad(x, z) || surface(x, z) < .25) continue;
            this.dust.emit(x + (Math.random() - .5) * .4, surface(x, z) + .17,
                z + (Math.random() - .5) * .4,
                -fx * velocity * .10 + rx * side * (.3 + Math.random() * .6), .55 + Math.random() * .3,
                -fz * velocity * .10 + rz * side * (.3 + Math.random() * .6),
                .4 + Math.random() * .35 + Math.min(1, Math.abs(velocity) / 12) * .25, .7 + Math.random() * .45);
        }
    }

    draw(world, renderer, camera) {
        const pixelScale = renderer.domElement.height * camera.projectionMatrix.elements[5] / 2;
        this.dust.draw(world.originX, world.originZ, pixelScale);
        this.sparks.draw(world.originX, world.originZ, pixelScale);
    }

    waterRipple(recovery, originX, originZ) {
        this.ripple.visible = recovery?.phase === 'sink';
        if (!this.ripple.visible) return;
        const t = Math.min(1, recovery.elapsed / 1.7);
        this.ripple.position.set(recovery.x - originX, .045, recovery.z - originZ);
        this.ripple.scale.setScalar(.9 + t * 4);
        this.ripple.material.opacity = .78 * (1 - t);
    }

    clear() {
        this.dust.clear(); this.sparks.clear();
        this.bump = 0; this.cooldown = 0; this.dustDistance = 0;
    }
}
