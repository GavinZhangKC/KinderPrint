import * as THREE from 'three'
import { weatherAt } from './journey'
import { createJourneyRain } from './JourneyRain'

const fullscreenVertex = `varying vec2 vUv;
void main(){vUv=uv;gl_Position=vec4(position.xy,0.0,1.0);}`

// Two advected fractal layers, rendered at bounded resolution. This is a sky
// texture, not expensive ray-marched volumetric cloud rendering.
const cloudFragment = `
varying vec2 vUv;
uniform float uTime,uStorm,uSun,uAspect;
float hash(vec2 p){p=fract(p*vec2(123.34,456.21));p+=dot(p,p+45.32);return fract(p.x*p.y);}
float noise(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.0-2.0*f);return mix(mix(hash(i),hash(i+vec2(1,0)),f.x),mix(hash(i+vec2(0,1)),hash(i+vec2(1,1)),f.x),f.y);}
float fbm(vec2 p){float n=0.0,a=.53;mat2 r=mat2(.87,.49,-.49,.87);for(int i=0;i<5;i++){n+=a*noise(p);p=r*p*2.03+11.7;a*=.48;}return n;}
void main(){
 vec2 uv=vUv;
 vec3 sky=mix(vec3(.72,.86,.92),vec3(.38,.65,.83),smoothstep(.12,1.0,uv.y));
 sky=mix(sky,mix(vec3(.48,.59,.68),vec3(.25,.35,.48),uv.y),uStorm);
 vec2 sunUv=(uv-vec2(.77,.82))*vec2(uAspect,1.0);
 float sunDistance=length(sunUv);
 float sunPower=(.22+.78*uSun)*(1.0-.95*uStorm);
 sky+=vec3(1.,.78,.37)*exp(-sunDistance*sunDistance*24.)*.4*sunPower;
 sky=mix(sky,vec3(1.,.98,.82),(1.-smoothstep(.025,.055,sunDistance))*sunPower);
 vec2 drift=vec2(uTime*.006,uTime*.001);
 vec2 q=uv*vec2(4.2,2.7)+drift;
 q+=vec2(fbm(q*.6),fbm(q*.6+8.))*.55;
 float n=fbm(q);
 float threshold=.67-uStorm*.34+uSun*.06;
 float density=smoothstep(threshold-.065,threshold+.16,n)*smoothstep(.12,.42,uv.y);
 float edge=clamp((fbm(q+vec2(0.,.18))-n)*4.+.52,0.,1.);
 vec3 cloud=mix(vec3(.67,.76,.82),vec3(.95,.97,.98),edge);
 cloud=mix(cloud,mix(vec3(.25,.32,.43),vec3(.65,.71,.79),edge),uStorm);
 sky=mix(sky,cloud,density*.97);
 vec2 q2=uv*vec2(3.4,2.8)-drift*1.6+vec2(3.1,11.4);
 float nearNoise=fbm(q2+fbm(q2*.7)*.5);
 float nearDensity=smoothstep(.64-uStorm*.24,.79-uStorm*.24,nearNoise)*smoothstep(.4,.82,uv.y)*(1.-uSun*.8);
 vec3 nearCloud=mix(vec3(.84,.89,.94),vec3(.28,.36,.47),uStorm);
 sky=mix(sky,nearCloud,nearDensity*.82);
 gl_FragColor=vec4(sky,1.);
}`

export function createJourneyWeather() {
  const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1)
  const geometry = new THREE.PlaneGeometry(2, 2)
  const cloudMaterial = new THREE.ShaderMaterial({
    vertexShader: fullscreenVertex, fragmentShader: cloudFragment, depthTest: false, depthWrite: false,
    uniforms: { uTime: { value: 0 }, uStorm: { value: 0 }, uSun: { value: 0 }, uAspect: { value: 1 } },
  })
  const cloudScene = new THREE.Scene()
  cloudScene.add(new THREE.Mesh(geometry, cloudMaterial))
  const cloudTarget = new THREE.WebGLRenderTarget(720, 450, { depthBuffer: false, stencilBuffer: false })
  const skyScene = new THREE.Scene()
  const skyMaterial = new THREE.ShaderMaterial({
    vertexShader: fullscreenVertex,
    fragmentShader: 'varying vec2 vUv;uniform sampler2D uSky;void main(){gl_FragColor=texture2D(uSky,vUv);}',
    uniforms: { uSky: { value: cloudTarget.texture } }, depthTest: false, depthWrite: false,
  })
  skyScene.add(new THREE.Mesh(geometry, skyMaterial))
  const rain = createJourneyRain()
  let lastCloudTime = -Infinity, lastProgress = -1
  return {
    resize(width: number, height: number) {
      const scale = Math.min(1, 720 / width, 450 / height)
      cloudTarget.setSize(Math.round(width * scale), Math.round(height * scale))
      cloudMaterial.uniforms.uAspect.value = width / height
      rain.resize(width)
      lastProgress = -1
    },
    renderSky(renderer: THREE.WebGLRenderer, progress: number, time: number) {
      const weather = weatherAt(progress)
      if (time - lastCloudTime > 90 || Math.abs(progress - lastProgress) > .002) {
        cloudMaterial.uniforms.uTime.value = time / 1000
        cloudMaterial.uniforms.uStorm.value = weather.storm
        cloudMaterial.uniforms.uSun.value = weather.sun
        renderer.setRenderTarget(cloudTarget); renderer.clear(); renderer.render(cloudScene, camera); renderer.setRenderTarget(null)
        lastCloudTime = time; lastProgress = progress
      }
      renderer.clear(); renderer.render(skyScene, camera); renderer.clearDepth()
    },
    renderRain(renderer: THREE.WebGLRenderer, sceneCamera: THREE.PerspectiveCamera, progress: number, time: number) {
      rain.render(renderer, sceneCamera, weatherAt(progress).rain, time)
    },
    dispose() { geometry.dispose(); cloudMaterial.dispose(); cloudTarget.dispose(); skyMaterial.dispose(); rain.dispose() },
  }
}
