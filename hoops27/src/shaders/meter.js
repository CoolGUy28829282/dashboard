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

// 2K-style crescent: a tapered, curved blade standing beside the shooter. White fill rises from the thin tip to the rounded top;
// the glowing green zone is the top end. `fill` and `zoneLo` are 0..1 along the blade (zone = zoneLo..1).
export const BAR_FS = `uniform float fill; uniform float zoneLo; uniform float time; uniform vec3 greenCol; uniform vec3 resCol; uniform float res; varying vec2 vUv;
  float cx(float y){ return 0.66 - 0.30 * sin(3.14159 * pow(clamp(y, 0.0, 1.0), 0.78)); }
  float wd(float y){ float base = mix(0.004, 0.13, smoothstep(0.0, 0.45, y)); float cap = sqrt(clamp((1.0 - y) / 0.05, 0.0, 1.0)); return base * mix(1.0, cap, step(0.95, y)); }
  void main(){
    float y = vUv.y; float x = vUv.x; float c = cx(y); float w = wd(y) * 0.5; float d = abs(x - c);
    if (y > 1.0 || y < 0.0) discard;
    float body = 1.0 - smoothstep(w - 0.012, w, d); if (body <= 0.001) discard;
    float rim = smoothstep(w - 0.03, w - 0.012, d);
    vec3 track = vec3(0.92, 0.95, 0.95) * 0.32; vec3 col = track;
    float inZone = step(zoneLo, y); col = mix(col, greenCol * 0.55, inZone);          // dim green zone at the top
    float filled = step(y, fill);
    vec3 fcol = mix(vec3(0.96, 0.98, 0.97), greenCol * 1.25, inZone);                   // white fill turns green inside the zone
    col = mix(col, fcol, filled);
    col += greenCol * inZone * (0.18 + 0.12 * sin(time * 9.0)) * (1.0 - filled);
    col += vec3(1.0) * smoothstep(0.012, 0.0, abs(y - fill)) * 0.5;
    col = mix(col, resCol * 1.2, res * 0.85); col += rim * 0.15;
    float glow = (inZone * 0.35 + res * 0.4) * (1.0 - smoothstep(w, w + 0.06, d));
    gl_FragColor = vec4(col + greenCol * glow * 0.3, max(body * 0.97, glow * 0.5)); }`;
