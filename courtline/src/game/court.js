// Regulation pro court, real-world metres (1 unit = 1 m). x runs along the length, z across the width, y is up.
import { drawLogo } from '../league/logo.js';
import { hex, mulberry32, shade } from '../core/util.js';

export const FT = 0.3048, IN = 0.0254;
export const C = Object.freeze({
  L: 94 * FT, W: 50 * FT, halfL: 47 * FT, halfW: 25 * FT,
  rimH: 10 * FT, rimRadius: 9 * IN, rimTube: 0.008, rimFromBoard: 0.39,
  boardW: 6 * FT, boardH: 3.5 * FT, boardBottom: 9 * FT, boardT: 0.035, boardFromBaseline: 4 * FT,
  hoopFromBaseline: 4 * FT + 0.39,
  threeR: 23.75 * FT, threeCorner: 22 * FT, laneW: 16 * FT, ftFromBaseline: 19 * FT, ftR: 6 * FT, restrictedR: 4 * FT, centerR: 6 * FT,
  margin: 2.2,
  ballCirc: 29.5 * IN, ballR: (29.5 * IN) / (2 * Math.PI), ballMass: 0.62,
});
/** x of the right-hand rim centre (the left one is -HOOP_X). */
export const HOOP_X = C.halfL - C.hoopFromBaseline;

/** Paint the hardwood, lines, key, and centre logo onto `cv` (width decides resolution). */
export function drawCourtTexture(cv, { floor, paint, accent, team }) {
  const M = C.margin, s = cv.width / (C.L + 2 * M);
  cv.height = Math.round((C.W + 2 * M) * s);
  const c = cv.getContext('2d');
  const X = (x) => (x + C.halfL + M) * s, Z = (z) => (z + C.halfW + M) * s;
  const rng = mulberry32(7);
  // planks run lengthwise
  const plank = 0.083, base = floor;
  for (let z = -C.halfW - M; z < C.halfW + M; z += plank) {
    const v = 0.93 + rng() * 0.14;
    c.fillStyle = hex(shade(base, v));
    c.fillRect(0, Z(z), cv.width, plank * s + 1);
    c.fillStyle = 'rgba(60,35,10,.22)'; c.fillRect(0, Z(z), cv.width, 1);
    for (let x = -C.halfL - M + rng() * 2; x < C.halfL + M; x += 1.8 + rng() * 1.4) { c.fillRect(X(x), Z(z), 1, plank * s); }
  }
  // soft wood grain
  c.globalAlpha = 0.06; c.fillStyle = '#000';
  for (let i = 0; i < 260; i++) c.fillRect(rng() * cv.width, rng() * cv.height, 30 + rng() * 140, 1);
  c.globalAlpha = 1;
  // out-of-bounds border
  c.fillStyle = 'rgba(20,12,4,.38)';
  c.fillRect(0, 0, cv.width, Z(-C.halfW)); c.fillRect(0, Z(C.halfW), cv.width, cv.height - Z(C.halfW));
  c.fillRect(0, 0, X(-C.halfL), cv.height); c.fillRect(X(C.halfL), 0, cv.width - X(C.halfL), cv.height);
  // painted keys
  c.fillStyle = hex(paint);
  for (const sg of [-1, 1]) {
    const x0 = sg * C.halfL, x1 = sg * (C.halfL - C.ftFromBaseline);
    c.fillRect(X(Math.min(x0, x1)), Z(-C.laneW / 2), Math.abs(x1 - x0) * s, C.laneW * s);
    c.beginPath(); c.arc(X(x1), Z(0), C.ftR * s, 0, Math.PI * 2); c.fill();
  }
  const lw = 0.05 * s;
  c.strokeStyle = '#fff'; c.lineWidth = lw; c.lineCap = 'butt';
  c.strokeRect(X(-C.halfL), Z(-C.halfW), C.L * s, C.W * s);
  c.beginPath(); c.moveTo(X(0), Z(-C.halfW)); c.lineTo(X(0), Z(C.halfW)); c.stroke();
  // centre circle + logo
  c.beginPath(); c.arc(X(0), Z(0), C.centerR * s, 0, Math.PI * 2); c.stroke();
  c.beginPath(); c.arc(X(0), Z(0), (C.centerR - 0.05) * s * 0.35, 0, Math.PI * 2); c.stroke();
  if (team) drawLogo(c, X(0), Z(0), C.centerR * s * 0.82, team);
  const phi = Math.asin(C.threeCorner / C.threeR), dx = Math.sqrt(C.threeR ** 2 - C.threeCorner ** 2);
  for (const sg of [-1, 1]) {
    const bx = sg * HOOP_X, bl = sg * C.halfL, ft = sg * (C.halfL - C.ftFromBaseline), bb = sg * (C.halfL - C.boardFromBaseline);
    // lane
    c.strokeRect(X(Math.min(bl, ft)), Z(-C.laneW / 2), Math.abs(ft - bl) * s, C.laneW * s);
    // free-throw circle: solid half toward midcourt, dashed half toward the basket
    c.beginPath(); c.arc(X(ft), Z(0), C.ftR * s, sg > 0 ? Math.PI / 2 : -Math.PI / 2, sg > 0 ? Math.PI * 1.5 : Math.PI / 2); c.stroke();
    c.setLineDash([0.28 * s, 0.28 * s]);
    c.beginPath(); c.arc(X(ft), Z(0), C.ftR * s, sg > 0 ? -Math.PI / 2 : Math.PI / 2, sg > 0 ? Math.PI / 2 : Math.PI * 1.5); c.stroke();
    c.setLineDash([]);
    // three-point line: straight corners + arc centred on the rim
    for (const zz of [-1, 1]) { c.beginPath(); c.moveTo(X(bl), Z(zz * C.threeCorner)); c.lineTo(X(bx - sg * dx), Z(zz * C.threeCorner)); c.stroke(); }
    c.beginPath();
    if (sg > 0) c.arc(X(bx), Z(0), C.threeR * s, Math.PI - phi, Math.PI + phi); else c.arc(X(bx), Z(0), C.threeR * s, -phi, phi);
    c.stroke();
    // restricted area arc
    c.beginPath();
    if (sg > 0) c.arc(X(bx), Z(0), C.restrictedR * s, Math.PI / 2, Math.PI * 1.5); else c.arc(X(bx), Z(0), C.restrictedR * s, -Math.PI / 2, Math.PI / 2);
    c.stroke();
    for (const zz of [-1, 1]) { c.beginPath(); c.moveTo(X(bx), Z(zz * C.restrictedR)); c.lineTo(X(bb), Z(zz * C.restrictedR)); c.stroke(); }
    // block + hash marks on the lane
    c.fillStyle = '#fff';
    for (const zz of [-1, 1]) for (const d of [1.8, 2.3, 3.0, 4.0]) c.fillRect(X(sg * (C.halfL - d)) - 0.025 * s, Z(zz * C.laneW / 2) - (zz > 0 ? 0 : 0.2 * s), 0.05 * s, 0.2 * s);
    // baseline wordmark
    if (team) {
      c.save(); c.translate(X(sg * (C.halfL + 1.1)), Z(0)); c.rotate(sg * Math.PI / 2);
      c.fillStyle = hex(accent); c.font = `900 ${0.9 * s}px system-ui, sans-serif`; c.textAlign = 'center'; c.textBaseline = 'middle';
      c.globalAlpha = 0.9; c.fillText(team.name.toUpperCase(), 0, 0); c.restore();
    }
  }
}
