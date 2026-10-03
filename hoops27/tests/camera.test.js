import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { CameraRig, CAMERA_PRESETS, CAMERA_LABEL, CAMERA_INFO } from '../src/engine/camera.js';

describe('camera rig', () => {
  it('has a label and description for every preset', () => { for (const m of CAMERA_PRESETS) { expect(CAMERA_LABEL[m]).toBeTruthy(); expect(CAMERA_INFO[m]).toBeTruthy(); } });
  it('produces finite, sensible transforms in every mode and for both attack directions', () => {
    for (const mode of CAMERA_PRESETS) for (const side of [1, -1]) {
      const cam = new THREE.PerspectiveCamera(42, 16 / 9, 0.1, 400); const rig = new CameraRig(cam); rig.setMode(mode);
      const ctrl = { pos: { x: 3 * side, z: 1 }, vel: { x: 4 * side, z: 0 }, face: side > 0 ? 0 : Math.PI, hasBall: true };
      for (let i = 0; i < 240; i++) rig.update(1 / 60, { ball: { x: 3 * side + i * 0.01, y: 1, z: 1 }, vel: { x: 4 * side, z: 0 }, attackSide: side, ctrl, phase: 'live' });
      for (const v of [cam.position.x, cam.position.y, cam.position.z, cam.fov]) expect(Number.isFinite(v), `${mode}`).toBe(true);
      expect(cam.position.y).toBeGreaterThan(0.8); expect(cam.fov).toBeGreaterThan(30); expect(cam.fov).toBeLessThan(60);
    }
  });
  it('maps legacy camera names to the new modes', () => { const rig = new CameraRig(new THREE.PerspectiveCamera()); rig.setMode('broadcast'); expect(rig.mode).toBe('2k'); rig.setMode('sideline'); expect(rig.mode).toBe('low'); });
});
