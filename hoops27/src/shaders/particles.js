// GPU point-sprite particles.
export const PARTICLE_VS = `attribute float size; attribute vec4 color; attribute float life; varying vec4 vC; uniform float scale; void main(){ vC = color; vC.a *= clamp(life, 0.0, 1.0); vec4 mv = modelViewMatrix * vec4(position, 1.0); gl_PointSize = size * scale / -mv.z; gl_Position = projectionMatrix * mv; }`;
export const PARTICLE_FS = 'varying vec4 vC; void main(){ vec2 c = gl_PointCoord - 0.5; float d = length(c); if (d > 0.5) discard; float a = smoothstep(0.5, 0.0, d); gl_FragColor = vec4(vC.rgb, vC.a * a); }';
