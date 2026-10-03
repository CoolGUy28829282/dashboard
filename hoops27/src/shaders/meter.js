// World-space curved shot meter: track, fill, perfect (green) window and release tick.
export const METER_FS = `uniform float fill; uniform float winC; uniform float winW; uniform float time; uniform vec3 trackCol; uniform vec3 fillCol; uniform vec3 greenCol; uniform float flash; varying vec2 vUv;
  void main(){ vec2 p = vUv - 0.5; float r = length(p) * 2.0; float ang = atan(p.x, -p.y); // 0 = straight ahead (+x of the ring plane's -y)
    float span = 2.1; float t = (ang / span) * 0.5 + 0.5; // 0..1 across the arc
    float inArc = step(abs(ang), span * 0.5);
    float ring = smoothstep(0.62, 0.66, r) * (1.0 - smoothstep(0.96, 1.0, r)) * inArc;
    vec3 col = trackCol * 0.25; float a = ring * 0.55;
    float f = step(t, fill); col = mix(col, fillCol, f); a = max(a, ring * f * 0.95);
    float g = smoothstep(winC - winW * 0.5 - 0.004, winC - winW * 0.5, t) * (1.0 - smoothstep(winC + winW * 0.5, winC + winW * 0.5 + 0.004, t));
    col = mix(col, greenCol * (1.2 + 0.6 * sin(time * 14.0)), g); a = max(a, ring * g);
    float tick = smoothstep(0.012, 0.0, abs(t - fill)) * ring; col += vec3(1.0) * tick; a = max(a, tick);
    col += greenCol * flash; a = max(a, ring * flash * inArc);
    gl_FragColor = vec4(col, a); }`;
