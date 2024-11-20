import * as THREE from 'three'
import { OrbitControls } from 'three/addons/controls/OrbitControls.js'
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'
import { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js'
import { GPUComputationRenderer } from 'three/addons/misc/GPUComputationRenderer.js';
import particlesVertexShader from './shaders/particles/vertex.glsl'
import particlesFragmentShader from './shaders/particles/fragment.glsl'
import gpgpuParticlesShader from './shaders/gpgpu/particles.glsl'

/**
 * Base
 */

// Canvas
const canvas = document.querySelector('canvas.webgl')

// Scene
const scene = new THREE.Scene();

// Loaders
const dracoLoader = new DRACOLoader()
dracoLoader.setDecoderPath('/draco/')

const gltfLoader = new GLTFLoader()
gltfLoader.setDRACOLoader(dracoLoader)

/**
 * Load model
 */
const gltf = await gltfLoader.loadAsync('./flor4.glb');


/**
 * Sizes
 */
const sizes = {
  width: window.innerWidth,
  height: window.innerHeight,
  pixelRatio: Math.min(window.devicePixelRatio, 2)
}

window.addEventListener('resize', () => {
  // Update sizes
  sizes.width = window.innerWidth
  sizes.height = window.innerHeight
  sizes.pixelRatio = Math.min(window.devicePixelRatio, 2)

  // Update camera
  if (sizes.width < 800) {
    camera.position.set(4.5, 7, 9);
  } else {
    camera.position.set(3, 4, 5);
  }

  camera.aspect = sizes.width / sizes.height
  camera.updateProjectionMatrix()

  // Update renderer
  renderer.setSize(sizes.width, sizes.height)
  renderer.setPixelRatio(sizes.pixelRatio)
})

/**
 * Camera
 */
// Base camera
const camera = new THREE.PerspectiveCamera(35, sizes.width / sizes.height, 0.1, 100);

if (sizes.width < 800) {
  camera.position.set(4.5, 7, 9);
} else {
  camera.position.set(3, 4, 5);
}

scene.add(camera)

// Controls
const controls = new OrbitControls(camera, canvas)
controls.enableDamping = true
controls.enableZoom = false;
controls.enablePan = false;
controls.minPolarAngle = 0.7;
controls.maxPolarAngle = Math.PI * 0.35;

/**
 * Renderer
 */
const renderer = new THREE.WebGLRenderer({
  canvas: canvas,
  antialias: true,
})
renderer.setSize(sizes.width, sizes.height)
renderer.setPixelRatio(sizes.pixelRatio)


/**
 * Base Geometry
 */
const baseGeometry = {}
baseGeometry.instance = gltf.scene.children[0].geometry;
baseGeometry.count = baseGeometry.instance.attributes.position.count; //número de vertices (particles)

/**
 * GPU Compute
 */
// Setup
const gpgpu = {};
gpgpu.size = Math.ceil(Math.sqrt(baseGeometry.count));
gpgpu.computation = new GPUComputationRenderer(gpgpu.size, gpgpu.size, renderer)

// Base particles
const baseParticlesTexture = gpgpu.computation.createTexture(); // Data texture array. 

for (let i = 0; i < baseGeometry.count; i++) {
  const i3 = i * 3;
  const i4 = i * 4;

  const position = baseGeometry.instance.attributes.position.array;
  const color = baseParticlesTexture.image.data;

  // Position based on geometry - cogemos el valor de la coordeanda x y se lo ponemos al canal R (de rgb)
  color[i4 + 0] = position[i3 + 0]; // R
  color[i4 + 1] = position[i3 + 1]; // G
  color[i4 + 2] = position[i3 + 2]; // B
  color[i4 + 3] = Math.random();    // A
}

// Particles variables
gpgpu.particlesVariable = gpgpu.computation.addVariable('uParticles', gpgpuParticlesShader, baseParticlesTexture)
gpgpu.computation.setVariableDependencies(gpgpu.particlesVariable, [gpgpu.particlesVariable]);

// Uniforms
gpgpu.particlesVariable.material.uniforms.uTime = new THREE.Uniform(0);
gpgpu.particlesVariable.material.uniforms.uDeltaTime = new THREE.Uniform(0);
gpgpu.particlesVariable.material.uniforms.uBase = new THREE.Uniform(baseParticlesTexture);
gpgpu.particlesVariable.material.uniforms.uFlowFieldInfluence = new THREE.Uniform(0.35);
gpgpu.particlesVariable.material.uniforms.uFlowFieldStrength = new THREE.Uniform(1.28);
gpgpu.particlesVariable.material.uniforms.uFlowFieldFrequency = new THREE.Uniform(1);

//Init
gpgpu.computation.init()

/**
 * Particles
 */
const particles = {}

// Geometry
const particleUvArray = new Float32Array(baseGeometry.count * 2);
const sizesArray = new Float32Array(baseGeometry.count);
console.log(sizesArray);

for (let y = 0; y < gpgpu.size; y++) {
  for (let x = 0; x < gpgpu.size; x++) {
    const i = (y * gpgpu.size) + x;
    const i2 = i * 2;

    // Particles UV
    const uvX = (x + 0.5) / gpgpu.size; 
    const uvY = (y + 0.5) / gpgpu.size;

    particleUvArray[i2 + 0] = uvX;
    particleUvArray[i2 + 1] = uvY;

    // Size
    sizesArray[i] = Math.random();
  }
}
console.log(sizesArray);

particles.geometry = new THREE.BufferGeometry();
particles.geometry.setDrawRange(0, baseGeometry.count);
particles.geometry.setAttribute('aParticlesUv', new THREE.BufferAttribute(particleUvArray, 2));
particles.geometry.setAttribute('aSize', new THREE.BufferAttribute(sizesArray, 1));


// Material
particles.material = new THREE.ShaderMaterial({
  vertexShader: particlesVertexShader,
  fragmentShader: particlesFragmentShader,
  uniforms:
  {
    uSize: new THREE.Uniform(0.035),
    uResolution: new THREE.Uniform(new THREE.Vector2(sizes.width * sizes.pixelRatio, sizes.height * sizes.pixelRatio)),
    uParticlesTexture: new THREE.Uniform(),
    uCursor: new THREE.Uniform(new THREE.Vector2(0, 0)),
    uColor1: { value: new THREE.Color("#ed5a34") },
    uColor2: { value: new THREE.Color("#f93a7e") },
    uColor3: { value: new THREE.Color("#f76583") },
    uColor4: { value: new THREE.Color("#fdc8dd") },
  },
  transparent: true,
  // blending: THREE.AdditiveBlending,
})

// Points
particles.points = new THREE.Points(particles.geometry, particles.material)
scene.add(particles.points)


/**
 * Animate
 */
const clock = new THREE.Clock()
let previousTime = 0

const tick = () => {
  const elapsedTime = clock.getElapsedTime()
  const deltaTime = elapsedTime - previousTime;
  previousTime = elapsedTime

  // Update controls
  controls.update()

  // GPGPU Update
  gpgpu.particlesVariable.material.uniforms.uTime.value = elapsedTime;
  gpgpu.particlesVariable.material.uniforms.uDeltaTime.value = deltaTime;
  gpgpu.computation.compute();
  particles.material.uniforms.uParticlesTexture.value = gpgpu.computation.getCurrentRenderTarget(gpgpu.particlesVariable).texture;
  
  // Render normal scene
  renderer.render(scene, camera)

  // Call tick again on the next frame
  window.requestAnimationFrame(tick)
 
}

tick()