// Volumetric spotlight cone (additive, fades along its length).
export const BEAM_VS = 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }';
export const BEAM_FS = 'uniform vec3 color; uniform float intensity; varying vec2 vUv; void main(){ float f = pow(1.0 - vUv.y, 1.6); float edge = smoothstep(0.0, 0.5, 1.0 - abs(vUv.x - 0.5) * 2.0); gl_FragColor = vec4(color * 0.6, (f * intensity * 0.03 + edge * f * 0.015)); }';
