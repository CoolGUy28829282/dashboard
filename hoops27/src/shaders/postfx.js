import * as THREE from 'three';
// Post-processing pass: chromatic aberration (big plays), directional motion blur, vignette.
export const FX_SHADER = {
  uniforms: { tDiffuse: { value: null }, aberration: { value: 0 }, blurDir: { value: new THREE.Vector2() }, vignette: { value: 0.28 } },
  vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
  fragmentShader: `uniform sampler2D tDiffuse; uniform float aberration; uniform vec2 blurDir; uniform float vignette; varying vec2 vUv;
  void main(){
    vec2 c = vUv - 0.5; float r = length(c);
    vec2 off = c * aberration * (0.4 + r);
    vec3 col = vec3(texture2D(tDiffuse, vUv + off).r, texture2D(tDiffuse, vUv).g, texture2D(tDiffuse, vUv - off).b);
    if (length(blurDir) > 0.0001) { vec3 acc = col; for (int i = 1; i <= 4; i++) { float f = float(i) / 4.0; acc += texture2D(tDiffuse, vUv + blurDir * f).rgb + texture2D(tDiffuse, vUv - blurDir * f).rgb; } col = acc / 9.0; }
    col *= 1.0 - vignette * smoothstep(0.35, 0.95, r);
    gl_FragColor = vec4(col, 1.0);
  }`,
};
