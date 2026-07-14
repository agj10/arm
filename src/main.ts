import './style.css';
import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { SSAOPass } from 'three/examples/jsm/postprocessing/SSAOPass.js';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';
import { VignetteShader } from 'three/examples/jsm/shaders/VignetteShader.js';
import { ColorCorrectionShader } from 'three/examples/jsm/shaders/ColorCorrectionShader.js';
// SSR and DoF require more complex setups, we'll start with placeholders or basic implementations.

// Fetch and display version
fetch('/version.json')
  .then(res => res.json())
  .then(data => {
    const versionDisplay = document.getElementById('version-display');
    if (versionDisplay) {
      versionDisplay.textContent = `ver. ${data.version}`;
    }
  })
  .catch(e => console.error('Failed to load version.json', e));

class Game {
  private scene: THREE.Scene;
  private camera: THREE.PerspectiveCamera;
  private renderer: THREE.WebGLRenderer;
  private composer: EffectComposer;
  
  constructor() {
    const container = document.getElementById('game-container')!;
    
    // Scene setup
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x111111);
    this.scene.fog = new THREE.FogExp2(0x111111, 0.02);

    // Camera setup (2.5D perspective)
    this.camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
    this.camera.position.z = 20;

    // Renderer
    this.renderer = new THREE.WebGLRenderer({ antialias: false });
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.setPixelRatio(window.devicePixelRatio);
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    container.appendChild(this.renderer.domElement);

    // Lights
    const ambientLight = new THREE.AmbientLight(0x404040, 1.5);
    this.scene.add(ambientLight);

    const dirLight = new THREE.DirectionalLight(0xffffff, 2);
    dirLight.position.set(10, 20, 10);
    dirLight.castShadow = true;
    dirLight.shadow.camera.top = 50;
    dirLight.shadow.camera.bottom = -50;
    dirLight.shadow.camera.left = -50;
    dirLight.shadow.camera.right = 50;
    this.scene.add(dirLight);

    // Post Processing
    this.composer = new EffectComposer(this.renderer);
    
    // 1. Render Pass
    const renderPass = new RenderPass(this.scene, this.camera);
    this.composer.addPass(renderPass);

    // 2. SSAO
    const ssaoPass = new SSAOPass(this.scene, this.camera, window.innerWidth, window.innerHeight);
    ssaoPass.kernelRadius = 16;
    ssaoPass.minDistance = 0.005;
    ssaoPass.maxDistance = 0.1;
    this.composer.addPass(ssaoPass);

    // 3. Bloom
    const bloomPass = new UnrealBloomPass(new THREE.Vector2(window.innerWidth, window.innerHeight), 1.5, 0.4, 0.85);
    bloomPass.threshold = 0.2;
    bloomPass.strength = 1.2;
    bloomPass.radius = 0.5;
    this.composer.addPass(bloomPass);

    // 4. Color Grading
    const colorCorrectionPass = new ShaderPass(ColorCorrectionShader);
    this.composer.addPass(colorCorrectionPass);

    // 5. Vignette
    const vignettePass = new ShaderPass(VignetteShader);
    vignettePass.uniforms["offset"].value = 1.0;
    vignettePass.uniforms["darkness"].value = 1.5;
    this.composer.addPass(vignettePass);

    // 6. Custom Radial Chromatic Aberration
    const RadialCA = {
      uniforms: {
        "tDiffuse": { value: null },
        "amount": { value: 0.005 }
      },
      vertexShader: `
        varying vec2 vUv;
        void main() {
          vUv = uv;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: `
        uniform sampler2D tDiffuse;
        uniform float amount;
        varying vec2 vUv;
        void main() {
          vec2 center = vec2(0.5, 0.5);
          vec2 d = vUv - center;
          float dist = length(d);
          vec2 dir = normalize(d);
          
          // amount increases as we move away from center
          float offset = amount * dist * dist;
          
          vec4 cr = texture2D(tDiffuse, vUv + dir * offset);
          vec4 cga = texture2D(tDiffuse, vUv);
          vec4 cb = texture2D(tDiffuse, vUv - dir * offset);
          
          gl_FragColor = vec4(cr.r, cga.g, cb.b, cga.a);
        }
      `
    };
    const caPass = new ShaderPass(RadialCA);
    this.composer.addPass(caPass);

    // Placeholder objects for testing
    this.createTestScene();

    // Event Listeners
    window.addEventListener('resize', this.onWindowResize.bind(this), false);

    // Start loop
    this.animate();
  }

  private createTestScene() {
    // Floor
    const floorGeo = new THREE.PlaneGeometry(100, 100);
    const floorMat = new THREE.MeshStandardMaterial({ color: 0x333333 });
    const floor = new THREE.Mesh(floorGeo, floorMat);
    floor.rotation.x = -Math.PI / 2;
    floor.position.y = -5;
    floor.receiveShadow = true;
    this.scene.add(floor);

    // A box
    const boxGeo = new THREE.BoxGeometry(2, 2, 2);
    const boxMat = new THREE.MeshStandardMaterial({ color: 0xff0000 });
    const box = new THREE.Mesh(boxGeo, boxMat);
    box.castShadow = true;
    box.receiveShadow = true;
    this.scene.add(box);
  }

  private onWindowResize() {
    this.camera.aspect = window.innerWidth / window.innerHeight;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.composer.setSize(window.innerWidth, window.innerHeight);
  }

  private animate() {
    requestAnimationFrame(this.animate.bind(this));
    this.composer.render();
  }
}

// Start Game
new Game();
