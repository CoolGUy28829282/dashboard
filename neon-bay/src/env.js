// Environment: sky + sun/moon, time of day, weather, ocean, rain, env-map.
import * as THREE from 'three';
import { clamp, lerp, smooth, col, TAU } from './util.js';
import { X1, BEACH, Z0, H } from './world.js';

// keyframes: hour, horizon, mid, top, fog, sun colour, hemisphere intensity, exposure
const K = [
  [0, [.10, .055, .16], [.012, .02, .06], [.003, .005, .016], [.06, .04, .11], [0, 0, 0], .34, 1.0],
  [5, [.12, .07, .18], [.015, .025, .07], [.004, .006, .02], [.07, .045, .12], [0, 0, 0], .36, 1.0],
  [6.3, [.88, .42, .34], [.28, .22, .44], [.06, .09, .25], [.34, .21, .27], [1, .55, .35], .6, .95],
  [8, [.66, .73, .86], [.25, .48, .86], [.10, .28, .72], [.50, .62, .78], [1, .9, .76], .9, .85],
  [12, [.60, .75, .92], [.22, .48, .88], [.08, .25, .70], [.55, .68, .85], [1, .96, .9], 1.0, .8],
  [16.3, [.72, .72, .80], [.28, .50, .85], [.10, .27, .70], [.55, .62, .75], [1, .88, .7], .9, .85],
  [18.2, [1.0, .38, .30], [.46, .18, .42], [.07, .08, .28], [.46, .2, .28], [1, .45, .25], .65, .95],
  [19.6, [.55, .14, .30], [.12, .07, .22], [.02, .03, .10], [.2, .08, .18], [.5, .15, .15], .45, 1.0],
  [21, [.14, .07, .18], [.02, .025, .07], [.004, .006, .02], [.08, .045, .12], [0, 0, 0], .36, 1.0],
  [24, [.10, .055, .16], [.012, .02, .06], [.003, .005, .016], [.06, .04, .11], [0, 0, 0], .34, 1.0],
];
function keyAt(h) {
  h = ((h % 24) + 24) % 24; let a = K[0], b = K[1];
  for (let i = 0; i < K.length - 1; i++) if (h >= K[i][0] && h <= K[i + 1][0]) { a = K[i]; b = K[i + 1]; break; }
  const t = smooth(0, 1, (h - a[0]) / (b[0] - a[0]));
  const mix = (x, y) => Array.isArray(x) ? x.map((v, i) => lerp(v, y[i], t)) : lerp(x, y, t);
  return { hor: mix(a[1], b[1]), mid: mix(a[2], b[2]), top: mix(a[3], b[3]), fog: mix(a[4], b[4]), sun: mix(a[5], b[5]), hemi: mix(a[6], b[6]), expo: mix(a[7], b[7]) };
}

export function createEnv(G) {
  const { scene, renderer } = G, V3 = (a) => new THREE.Vector3(...a);
  const E = { hour: G.cfg.startHour, weather: G.cfg.weather, overcast: 0, rainAmt: 0, flash: 0, nextBolt: 6, envHour: -99, envWeather: '' };
  const uni = {
    time: G.uniforms.time, night: G.uniforms.night, hor: { value: new THREE.Vector3() }, mid: { value: new THREE.Vector3() }, top: { value: new THREE.Vector3() }, sunDir: { value: new THREE.Vector3(0, 1, 0) }, sunCol: { value: new THREE.Vector3(1, 1, 1) },
    overcast: { value: 0 }, flash: { value: 0 }, stars: { value: 1 },
  };
  const skyMat = new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false, fog: false, uniforms: uni,
    vertexShader: 'varying vec3 vD; void main(){ vD=normalize(position); gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.); }',
    fragmentShader: `varying vec3 vD; uniform float time, night, overcast, flash, stars; uniform vec3 hor, mid, top, sunDir, sunCol;
      float hash(vec2 p){ return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453); }
      float noise(vec2 p){ vec2 i=floor(p), f=fract(p); f=f*f*(3.-2.*f); return mix(mix(hash(i),hash(i+vec2(1,0)),f.x), mix(hash(i+vec2(0,1)),hash(i+vec2(1,1)),f.x), f.y); }
      float fbm(vec2 p){ float a=.5, s=0.; for(int i=0;i<5;i++){ s+=a*noise(p); p*=2.03; a*=.5; } return s; }
      void main(){
        vec3 d=normalize(vD); float h=d.y;
        vec3 col=mix(hor, mid, smoothstep(0.,.32,h)); col=mix(col, top, smoothstep(.28,.9,h));
        float sd=max(dot(d,sunDir),0.);
        col+=sunCol*pow(sd,5.)*.35 + sunCol*pow(sd,90.)*.8;
        col+=sunCol*smoothstep(.9996,.9999,dot(d,sunDir))*6.;
        float lum=dot(col,vec3(.3,.5,.2)); col=mix(col, vec3(lum)*.75, overcast*.65);
        if(h>0.){
          vec2 uv=d.xz/(h+.22)*1.5+vec2(time*.004,0.); float c=smoothstep(.40-overcast*.25,.88,fbm(uv*1.6)); c=clamp(c+overcast*.45,0.,1.);
          vec3 cc=mix(vec3(.85,.88,.95)*(.25+.75*(1.-night)), sunCol*.9+vec3(.1), pow(sd,3.)*.6); cc=mix(cc, hor*1.2+vec3(.03), night*.7);
          col=mix(col, cc*(1.-overcast*.5), c*smoothstep(0.,.12,h)*(.55+.3*overcast));
          vec2 g=vec2(atan(d.z,d.x)*60.,asin(clamp(h,-1.,1.))*60.); vec2 id=floor(g), f=fract(g)-.5; float r=hash(id);
          float st=step(.965,r)*smoothstep(.22,.0,length(f-(vec2(hash(id+1.),hash(id+2.))-.5)*.5));
          col+=vec3(.8,.85,1.)*st*(r-.96)*40.*smoothstep(.06,.4,h)*night*stars*(1.-c*.9)*(1.-overcast);
        }
        vec3 md=-sunDir; float mm=dot(d,md); col+=vec3(.9,.95,1.)*smoothstep(.99935,.9996,mm)*4.*night*(1.-overcast)+vec3(.2,.3,.6)*pow(max(mm,0.),150.)*.5*night;
        if(h>-.02 && h<.2){ float az=(atan(d.z,d.x)+3.14159)/6.28318; for(int l=0;l<3;l++){ float fl=float(l); float cols=140.+fl*90.; float cell=floor(az*cols); float hh=(.015+.12*pow(hash(vec2(cell,fl*7.3)),2.4))*(1.-fl*.22);
          if(h<hh){ vec3 sil=hor*(.2-fl*.04)+vec3(.01); float wl=step(.93,hash(vec2(floor(az*cols*5.),floor(h*600.)+fl*17.)))*step(h,hh-.004)*step(.5,fract(az*cols*5.)); col=mix(col,sil,.9*(1.-.5*(1.-night))); col+=vec3(1.,.7,.4)*wl*night*.8; } } }
        if(h<0.) col=mix(col, hor, smoothstep(0.,-.1,h));
        col+=vec3(.6,.65,.95)*flash*(.3+.7*smoothstep(0.,.6,h));
        gl_FragColor=vec4(col,1.);
      }`,
  });
  const sky = new THREE.Mesh(new THREE.SphereGeometry(2800, 32, 16), skyMat); sky.renderOrder = -10; sky.frustumCulled = false; scene.add(sky); E.sky = sky;

  // lights
  const sun = new THREE.DirectionalLight(0xffffff, 2.5); sun.castShadow = true; sun.shadow.mapSize.set(2048, 2048); const sc = sun.shadow.camera; sc.left = -90; sc.right = 90; sc.top = 90; sc.bottom = -90; sc.near = 1; sc.far = 400; sun.shadow.bias = -0.0004; sun.shadow.normalBias = 0.6; scene.add(sun, sun.target);
  const moon = new THREE.DirectionalLight(0x8fa6ff, 0.4); scene.add(moon, moon.target);
  const hemi = new THREE.HemisphereLight(0x8aa0d0, 0x20202a, 0.6); scene.add(hemi);
  scene.fog = new THREE.FogExp2(0x302040, 0.0012); scene.background = scene.fog.color;
  E.sun = sun; E.hemi = hemi; E.moon = moon;

  // ocean
  const wuni = { time: uni.time, night: uni.night, hor: uni.hor, mid: uni.mid, top: uni.top, sunDir: uni.sunDir, sunCol: uni.sunCol, overcast: uni.overcast, shoreX: { value: BEACH.shore } };
  const waterMat = new THREE.ShaderMaterial({ fog: true, uniforms: Object.assign(THREE.UniformsUtils.merge([THREE.UniformsLib.fog]), wuni),
    vertexShader: 'varying vec3 wp;\n#include <fog_pars_vertex>\nvoid main(){ vec4 w=modelMatrix*vec4(position,1.); wp=w.xyz; vec4 mvPosition=viewMatrix*w; gl_Position=projectionMatrix*mvPosition;\n#include <fog_vertex>\n}',
    fragmentShader: `#include <fog_pars_fragment>
      varying vec3 wp; uniform float time, night, overcast, shoreX; uniform vec3 hor, mid, top, sunDir, sunCol;
      float wh(vec2 p){ return sin(p.x*.11+time*.8)*.5+sin(p.y*.17-time*.6)*.35+sin((p.x+p.y)*.27+time*1.4)*.2+sin((p.x-p.y)*.52+time*2.1)*.1+sin(p.x*1.3+p.y*.9+time*3.)*.03; }
      void main(){
        vec3 V=normalize(cameraPosition-wp); float e=.5; vec2 p=wp.xz;
        float dx=wh(p+vec2(e,0.))-wh(p-vec2(e,0.)), dz=wh(p+vec2(0.,e))-wh(p-vec2(0.,e)); vec3 N=normalize(vec3(-dx*.55,1.,-dz*.55));
        vec3 R=reflect(-V,N); R.y=abs(R.y); vec3 sk=mix(hor, mid, smoothstep(0.,.35,R.y)); sk=mix(sk, top, smoothstep(.3,.9,R.y));
        float fr=pow(1.-max(dot(N,V),0.),4.)*.92+.05;
        float shore=shoreX+sin(wp.z*.05+time*.4)*3.; float dist=wp.x-shore; float depth=smoothstep(0.,140.,dist);
        vec3 deep=mix(vec3(.01,.10,.16),vec3(.0,.03,.08),night)*(1.-overcast*.4), shal=mix(vec3(.05,.45,.5),vec3(.01,.1,.14),night);
        vec3 water=mix(shal,deep,depth);
        vec3 col=mix(water, sk, fr);
        float sp=pow(max(dot(reflect(-sunDir,N),V),0.),180.); col+=sunCol*sp*6.;
        float mp=pow(max(dot(reflect(sunDir,N),V),0.),160.); col+=vec3(.5,.6,1.)*mp*2.*night;
        float foam=smoothstep(10.,0.,dist)*(.55+.45*sin(dist*.8-time*2.2+sin(wp.z*.2)*3.)); foam*=step(0.,dist+1.); col=mix(col, vec3(.9,.95,1.)*(.35+.65*(1.-night)), clamp(foam,0.,1.)*.8);
        float sparkle=step(.995,fract(sin(dot(floor(p*3.),vec2(12.98,78.23))+time*.5)*43758.5))*smoothstep(0.,.4,night)*.4; col+=vec3(.8,.9,1.)*sparkle*fr;
        gl_FragColor=vec4(col,1.);
        float fogF=1.-exp(-fogDensity*fogDensity*vFogDepth*vFogDepth); gl_FragColor.rgb=mix(gl_FragColor.rgb,fogColor,fogF);
      }` });
  const water = new THREE.Mesh(new THREE.PlaneGeometry(6000, 7000).rotateX(-Math.PI / 2), waterMat); water.position.set(X1 + 100 + 3000, -0.55, Z0 + H / 2); water.renderOrder = -1; scene.add(water); E.water = water;

  // rain streaks
  const RN = 6000, rs = new Float32Array(RN * 6), re = new Float32Array(RN * 2);
  for (let i = 0; i < RN; i++) { const a = Math.random(), b = Math.random(), c = Math.random(); rs.set([a, b, c, a, b, c], i * 6); re[i * 2] = 0; re[i * 2 + 1] = 1; }
  const rg = new THREE.BufferGeometry(); rg.setAttribute('position', new THREE.BufferAttribute(rs, 3)); rg.setAttribute('e', new THREE.BufferAttribute(re, 1));
  const rainMat = new THREE.ShaderMaterial({ transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false, uniforms: { cam: { value: new THREE.Vector3() }, rv: { value: new THREE.Vector3(0, -22, 0) }, t: uni.time, a: { value: 0.3 }, tint: { value: new THREE.Vector3(.6, .7, .9) } },
    vertexShader: 'attribute float e; uniform vec3 cam, rv; uniform float t; varying float vA; void main(){ vec3 box=vec3(60.,36.,60.); vec3 p=mod(position*box + rv*t, box)-box*.5; p.y+=box.y*.3; vA=(1.-clamp(length(p)/42.,0.,1.))*(1.-e*.6); vec3 w=cam+p-rv*e*.03; gl_Position=projectionMatrix*viewMatrix*vec4(w,1.); }',
    fragmentShader: 'uniform float a; uniform vec3 tint; varying float vA; void main(){ gl_FragColor=vec4(tint,vA*a); }' });
  const rain = new THREE.LineSegments(rg, rainMat); rain.frustumCulled = false; scene.add(rain); E.rain = rain; E.rainMat = rainMat; E.RN = RN;

  // env map for reflections (rebuilt as time/weather changes)
  const envScene = new THREE.Scene(), envSky = new THREE.Mesh(new THREE.SphereGeometry(100, 24, 12), skyMat.clone()); envSky.material.uniforms = uni; envScene.add(envSky);
  const neonBoxes = [['#ff2d95', -30, 12, -20], ['#22e6ff', 30, 10, -25], ['#ffb02e', 0, 6, 40], ['#ff2d95', 35, 4, 15], ['#22e6ff', -35, 5, 10]].map(([c, x, y, z]) => { const m = new THREE.Mesh(new THREE.BoxGeometry(18, 3, 1), new THREE.MeshBasicMaterial({ color: col(c, 5) })); m.position.set(x, y, z); m.lookAt(0, 0, 0); envScene.add(m); return m; });
  const pmrem = new THREE.PMREMGenerator(renderer);
  E.rebuildEnvMap = () => { neonBoxes.forEach(m => { m.visible = uni.night.value > 0.3; }); const t = pmrem.fromScene(envScene, 0.03); if (scene.environment) scene.environment.dispose(); scene.environment = t.texture; scene.environmentIntensity = 0.6; E.envHour = E.hour; E.envWeather = E.weather; };

  E.setWeather = w => { E.weather = w; G.cfg.weather = w; };
  const WEATHER = { Clear: [0, 0], Overcast: [0.6, 0], Rain: [0.8, 0.7], Storm: [1, 1] };
  E.update = (dt) => {
    // clock: 1 game minute per real second at speed 1
    E.hour = (E.hour + dt * (G.cfg.timeSpeed / 60)) % 24;
    const w = WEATHER[E.weather] || WEATHER.Clear; E.overcast = lerp(E.overcast, w[0], Math.min(1, dt * 0.25)); E.rainAmt = lerp(E.rainAmt, w[1], Math.min(1, dt * 0.25));
    const k = keyAt(E.hour), ang = (E.hour - 6) / 12 * Math.PI, elev = Math.sin(ang), sd = new THREE.Vector3(Math.cos(ang) * 0.85, elev, -0.35).normalize();
    const night = 1 - smooth(-0.14, 0.1, elev); uni.night.value = night; uni.sunDir.value.copy(sd);
    const oc = E.overcast, gray = c => { const l = (c[0] * .3 + c[1] * .5 + c[2] * .2) * (1 - 0.35 * oc); return c.map(v => lerp(v, l, oc * 0.7) * (1 - 0.25 * oc)); };
    const hor = gray(k.hor), mid = gray(k.mid), top = gray(k.top), fogc = gray(k.fog);
    uni.hor.value.set(...hor); uni.mid.value.set(...mid); uni.top.value.set(...top); uni.sunCol.value.set(...k.sun); uni.overcast.value = oc; uni.stars.value = 1;
    uni.flash.value = E.flash * 0.6;
    scene.fog.color.setRGB(...fogc); scene.background = scene.fog.color; scene.fog.density = (1.6 / G.cfg.viewDist) * (1 + oc * 0.7 + E.rainAmt * 0.5) * (1 + 0.6 * (1 - night) * 0);
    // sun / moon / hemisphere
    const day = smooth(-0.02, 0.22, elev); sun.color.setRGB(...k.sun); sun.intensity = day * 3.0 * (1 - 0.65 * oc) * (G.cfg.shadows || true ? 1 : 1); sun.position.copy(G.focus).addScaledVector(sd, 200); sun.target.position.copy(G.focus); sun.castShadow = G.cfg.shadows && day > 0.05;
    moon.position.copy(G.focus).addScaledVector(sd, -200); moon.target.position.copy(G.focus); moon.intensity = 0.45 * night * (1 - 0.5 * oc);
    hemi.color.setRGB(mid[0] * 1.2 + 0.05, mid[1] * 1.2 + 0.05, mid[2] * 1.2 + 0.08); hemi.groundColor.setRGB(hor[0] * 0.35, hor[1] * 0.35, hor[2] * 0.35); hemi.intensity = k.hemi * (1 - 0.2 * oc);
    // lightning
    if (E.weather === 'Storm') { E.nextBolt -= dt; if (E.nextBolt <= 0) { E.flash = 1; E.nextBolt = 6 + Math.random() * 14; if (G.audio) G.audio.thunder(0.3 + Math.random()); } } E.flash *= Math.pow(0.0008, dt);
    const fl = E.flash * (0.6 + 0.4 * Math.sin(G.clock * 70));
    renderer.toneMappingExposure = k.expo * (1 + fl * 1.4) * (G.cfg.exposure || 1); hemi.intensity += fl * 2; uni.flash.value = fl * 0.6;
    // rain
    E.rainMat.uniforms.cam.value.copy(G.camera.position); E.rainMat.uniforms.a.value = E.rainAmt > 0.02 ? 0.1 + 0.25 * E.rainAmt : 0; E.rain.visible = E.rainAmt > 0.02; E.rain.geometry.setDrawRange(0, Math.floor(E.RN * E.rainAmt) * 2);
    sky.position.copy(G.camera.position);
    if (Math.abs(E.hour - E.envHour) > 0.6 || E.weather !== E.envWeather || E.envHour < -50) E.rebuildEnvMap();
    E.night = night; E.elev = elev; E.wet = clamp(E.rainAmt * 1.4 + (E.overcast > 0.5 ? 0.15 : 0), 0, 1);
  };
  E.setHour = h => { E.hour = ((h % 24) + 24) % 24; E.envHour = -99; };
  return E;
}
