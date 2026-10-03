// Procedural team logos and jerseys drawn on Canvas 2D. Deterministic from team data (shape + emblem + colours).
import { hex } from '../core/util.js';

function shapePath(c, shape, r) {
  c.beginPath();
  switch (shape) {
    case 'circle': c.arc(0, 0, r, 0, Math.PI * 2); break;
    case 'shield':
      c.moveTo(-r * 0.85, -r * 0.85); c.lineTo(r * 0.85, -r * 0.85); c.lineTo(r * 0.85, 0);
      c.quadraticCurveTo(r * 0.8, r * 0.7, 0, r); c.quadraticCurveTo(-r * 0.8, r * 0.7, -r * 0.85, 0); c.closePath(); break;
    case 'hex': for (let i = 0; i < 6; i++) { const a = Math.PI / 6 + (i * Math.PI) / 3; c[i ? 'lineTo' : 'moveTo'](Math.cos(a) * r, Math.sin(a) * r); } c.closePath(); break;
    case 'diamond': c.moveTo(0, -r); c.lineTo(r * 0.9, 0); c.lineTo(0, r); c.lineTo(-r * 0.9, 0); c.closePath(); break;
    default: { // badge: rounded square
      const s = r * 0.88, k = r * 0.3;
      c.moveTo(-s + k, -s); c.arcTo(s, -s, s, s, k); c.arcTo(s, s, -s, s, k); c.arcTo(-s, s, -s, -s, k); c.arcTo(-s, -s, s, -s, k); c.closePath();
    }
  }
}
function poly(c, pts, r) { c.beginPath(); pts.forEach(([x, y], i) => c[i ? 'lineTo' : 'moveTo'](x * r, y * r)); c.closePath(); }

function emblem(c, kind, r, fill, stroke) {
  c.fillStyle = fill; c.strokeStyle = fill; c.lineWidth = r * 0.12; c.lineCap = 'round'; c.lineJoin = 'round';
  switch (kind) {
    case 'bolt': poly(c, [[0.1, -0.7], [-0.4, 0.06], [-0.04, 0.06], [-0.2, 0.7], [0.42, -0.14], [0.06, -0.14], [0.3, -0.7]], r); c.fill(); break;
    case 'star': { c.beginPath(); for (let i = 0; i < 10; i++) { const a = -Math.PI / 2 + (i * Math.PI) / 5, rr = i % 2 ? 0.3 : 0.72; c[i ? 'lineTo' : 'moveTo'](Math.cos(a) * rr * r, Math.sin(a) * rr * r); } c.closePath(); c.fill(); break; }
    case 'wave': for (let k = -1; k <= 1; k++) { c.beginPath(); for (let i = 0; i <= 20; i++) { const x = -0.7 + (i / 20) * 1.4; c[i ? 'lineTo' : 'moveTo'](x * r, (k * 0.32 + Math.sin(i * 0.65) * 0.12) * r); } c.stroke(); } break;
    case 'peak': poly(c, [[-0.75, 0.55], [-0.2, -0.45], [0.05, -0.05], [0.28, -0.6], [0.78, 0.55]], r); c.fill(); c.fillStyle = stroke; poly(c, [[0.28, -0.6], [0.14, -0.28], [0.3, -0.18], [0.42, -0.3]], r); c.fill(); break;
    case 'ring': c.beginPath(); c.arc(0, 0, r * 0.55, 0, Math.PI * 2); c.stroke(); c.beginPath(); c.arc(0, 0, r * 0.2, 0, Math.PI * 2); c.fill(); break;
    case 'claw': for (let k = -1; k <= 1; k++) { c.beginPath(); c.moveTo((k * 0.32 - 0.12) * r, -0.62 * r); c.quadraticCurveTo((k * 0.32 + 0.22) * r, 0, (k * 0.32 - 0.04) * r, 0.62 * r); c.stroke(); } break;
    case 'wing': for (let k = 0; k < 4; k++) { const y = -0.5 + k * 0.28; poly(c, [[-0.7 + k * 0.1, y], [0.6, y - 0.22 + k * 0.03], [0.7 - k * 0.12, y + 0.12], [-0.5 + k * 0.1, y + 0.24]], r); c.fill(); } break;
    case 'crown': poly(c, [[-0.7, 0.5], [-0.7, -0.4], [-0.35, 0], [0, -0.6], [0.35, 0], [0.7, -0.4], [0.7, 0.5]], r); c.fill(); break;
    case 'flame': c.beginPath(); c.moveTo(0, -0.75 * r); c.bezierCurveTo(0.6 * r, -0.2 * r, 0.62 * r, 0.7 * r, 0, 0.72 * r); c.bezierCurveTo(-0.62 * r, 0.7 * r, -0.5 * r, 0, -0.1 * r, -0.2 * r); c.bezierCurveTo(-0.05 * r, -0.4 * r, -0.05 * r, -0.55 * r, 0, -0.75 * r); c.fill(); c.fillStyle = stroke; c.beginPath(); c.arc(0, 0.35 * r, 0.2 * r, 0, Math.PI * 2); c.fill(); break;
    default: c.beginPath(); c.ellipse(0, 0, r * 0.75, r * 0.3, -0.5, 0, Math.PI * 2); c.stroke(); c.beginPath(); c.arc(0, 0, r * 0.22, 0, Math.PI * 2); c.fill();
  }
}

export function drawLogo(c, cx, cy, r, team) {
  const { primary, secondary, accent } = team.colors, { shape, emblem: em } = team.logo;
  c.save(); c.translate(cx, cy);
  shapePath(c, shape, r); c.fillStyle = hex(secondary); c.fill();
  c.lineWidth = r * 0.09; c.strokeStyle = hex(accent); c.stroke();
  shapePath(c, shape, r * 0.82); c.fillStyle = hex(primary); c.fill();
  c.save(); c.translate(0, -r * 0.1); emblem(c, em, r * 0.62, hex(secondary), hex(accent)); c.restore();
  c.fillStyle = '#fff'; c.font = `900 ${r * 0.26}px system-ui, sans-serif`; c.textAlign = 'center'; c.textBaseline = 'middle';
  c.lineWidth = r * 0.05; c.strokeStyle = 'rgba(0,0,0,.55)'; c.strokeText(team.abbr, 0, r * 0.62); c.fillText(team.abbr, 0, r * 0.62);
  c.restore();
}

const cache = new Map();
export function logoURL(team, size = 128) {
  const key = team.id + ':' + size + ':' + team.colors.primary + team.logo.emblem;
  let u = cache.get(key);
  if (!u) {
    const cv = document.createElement('canvas'); cv.width = cv.height = size;
    drawLogo(cv.getContext('2d'), size / 2, size / 2, size * 0.46, team);
    u = cv.toDataURL(); cache.set(key, u);
  }
  return u;
}

export function drawJersey(cv, uni, number) {
  const w = cv.width, h = cv.height, c = cv.getContext('2d');
  c.clearRect(0, 0, w, h);
  c.save(); c.translate(w / 2, h / 2); const s = Math.min(w, h) / 2;
  const body = () => {
    c.beginPath(); c.moveTo(-0.55 * s, -0.9 * s); c.quadraticCurveTo(-0.5 * s, -0.35 * s, -0.8 * s, -0.25 * s); c.lineTo(-0.72 * s, 0.9 * s);
    c.lineTo(0.72 * s, 0.9 * s); c.lineTo(0.8 * s, -0.25 * s); c.quadraticCurveTo(0.5 * s, -0.35 * s, 0.55 * s, -0.9 * s);
    c.quadraticCurveTo(0.25 * s, -0.6 * s, 0, -0.6 * s); c.quadraticCurveTo(-0.25 * s, -0.6 * s, -0.55 * s, -0.9 * s); c.closePath();
  };
  body(); c.fillStyle = hex(uni.base); c.fill();
  c.save(); body(); c.clip(); c.fillStyle = hex(uni.trim); c.strokeStyle = hex(uni.trim);
  switch (uni.pattern) {
    case 'sidepanel': c.fillRect(-0.85 * s, -0.4 * s, 0.22 * s, 1.4 * s); c.fillRect(0.63 * s, -0.4 * s, 0.22 * s, 1.4 * s); break;
    case 'chevron': c.lineWidth = 0.12 * s; c.beginPath(); c.moveTo(-0.7 * s, 0.55 * s); c.lineTo(0, 0.25 * s); c.lineTo(0.7 * s, 0.55 * s); c.stroke(); break;
    case 'pinstripe': c.lineWidth = 0.03 * s; for (let x = -0.7; x <= 0.7; x += 0.18) { c.beginPath(); c.moveTo(x * s, -0.9 * s); c.lineTo(x * s, 0.9 * s); c.stroke(); } break;
    case 'sash': c.lineWidth = 0.2 * s; c.beginPath(); c.moveTo(-0.8 * s, -0.5 * s); c.lineTo(0.8 * s, 0.7 * s); c.stroke(); break;
    default: c.fillRect(-0.85 * s, 0.72 * s, 1.7 * s, 0.2 * s);
  }
  c.restore();
  body(); c.lineWidth = 0.07 * s; c.strokeStyle = hex(uni.trim); c.stroke();
  c.fillStyle = hex(uni.number); c.font = `900 ${0.62 * s}px system-ui, sans-serif`; c.textAlign = 'center'; c.textBaseline = 'middle';
  c.lineWidth = 0.05 * s; c.strokeStyle = 'rgba(0,0,0,.35)'; c.strokeText(String(number), 0, 0.2 * s); c.fillText(String(number), 0, 0.2 * s);
  c.restore();
}
