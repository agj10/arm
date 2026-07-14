import './style.css';
import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { SSAOPass } from 'three/examples/jsm/postprocessing/SSAOPass.js';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';
import { VignetteShader } from 'three/examples/jsm/shaders/VignetteShader.js';
import { ColorCorrectionShader } from 'three/examples/jsm/shaders/ColorCorrectionShader.js';
import { RobotArm } from './RobotArm';
import { UIManager } from './UIManager';
import { LevelManager } from './LevelManager';

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
  
  private world: any; // RAPIER.World
  private rapier: any;
  private robotArm!: RobotArm;
  private uiManager: UIManager;
  private levelManager!: LevelManager;
  private clock: THREE.Clock;

  private mousePos = new THREE.Vector2(0, 0);
  private isMouseDown = false;

  constructor(rapierModule: any) {
    this.rapier = rapierModule;
    const container = document.getElementById('game-container')!;
    this.clock = new THREE.Clock();
    this.uiManager = new UIManager();
    
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
    
    const renderPass = new RenderPass(this.scene, this.camera);
    this.composer.addPass(renderPass);

    const ssaoPass = new SSAOPass(this.scene, this.camera, window.innerWidth, window.innerHeight);
    ssaoPass.kernelRadius = 16;
    ssaoPass.minDistance = 0.005;
    ssaoPass.maxDistance = 0.1;
    this.composer.addPass(ssaoPass);

    const bloomPass = new UnrealBloomPass(new THREE.Vector2(window.innerWidth, window.innerHeight), 1.5, 0.4, 0.85);
    bloomPass.threshold = 0.2;
    bloomPass.strength = 1.2;
    bloomPass.radius = 0.5;
    this.composer.addPass(bloomPass);

    const colorCorrectionPass = new ShaderPass(ColorCorrectionShader);
    this.composer.addPass(colorCorrectionPass);

    const vignettePass = new ShaderPass(VignetteShader);
    vignettePass.uniforms["offset"].value = 1.0;
    vignettePass.uniforms["darkness"].value = 1.5;
    this.composer.addPass(vignettePass);

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

    // Physics World
    const gravity = { x: 0.0, y: -20.0 };
    this.world = new this.rapier.World(gravity);

    // Create Robot Arm
    this.robotArm = new RobotArm(this.scene, this.world, this.rapier);
    
    // Level Manager
    this.levelManager = new LevelManager(this.uiManager, this.robotArm);

    // Placeholder level design
    this.createTestScene();

    // Event Listeners
    window.addEventListener('resize', this.onWindowResize.bind(this), false);
    
    window.addEventListener('mousemove', (e) => {
      const vec = new THREE.Vector3(
        (e.clientX / window.innerWidth) * 2 - 1,
        -(e.clientY / window.innerHeight) * 2 + 1,
        0.5
      );
      vec.unproject(this.camera);
      const dir = vec.sub(this.camera.position).normalize();
      const distance = -this.camera.position.z / dir.z;
      const pos = this.camera.position.clone().add(dir.multiplyScalar(distance));
      this.mousePos.set(pos.x, pos.y);
    });

    window.addEventListener('mousedown', () => { this.isMouseDown = true; });
    window.addEventListener('mouseup', () => { this.isMouseDown = false; });

    // Start loop
    this.animate();
  }

  private createTestScene() {
    // Floor
    const floorGeo = new THREE.PlaneGeometry(200, 100);
    const floorMat = new THREE.MeshStandardMaterial({ color: 0x223322 }); // Forest tint
    const floor = new THREE.Mesh(floorGeo, floorMat);
    floor.position.y = -10;
    floor.position.z = -10; // pushed back for parallax
    floor.receiveShadow = true;
    this.scene.add(floor);

    // Physics floor for collisions
    const groundColliderDesc = this.rapier.ColliderDesc.cuboid(100.0, 1.0).setTranslation(0, -10);
    this.world.createCollider(groundColliderDesc);
  }

  private onWindowResize() {
    this.camera.aspect = window.innerWidth / window.innerHeight;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.composer.setSize(window.innerWidth, window.innerHeight);
  }

  private animate() {
    requestAnimationFrame(this.animate.bind(this));
    
    const deltaTime = this.clock.getDelta();
    
    // Step Physics
    this.world.step();

    // Update Game Logic
    this.robotArm.update(this.mousePos, this.isMouseDown);
    this.levelManager.update(deltaTime);

    // Camera follow logic (Lerp towards claw)
    const clawPos = this.robotArm.clawPos;
    this.camera.position.x += (clawPos.x - this.camera.position.x) * 0.1;
    this.camera.position.y += (clawPos.y - this.camera.position.y) * 0.1;
    // Look at player
    this.camera.lookAt(this.camera.position.x, this.camera.position.y, 0);

    // Render
    this.composer.render();
  }
}

// Load Rapier dynamically and start game
import('@dimforge/rapier2d').then(RAPIER => {
  new Game(RAPIER);
}).catch(e => console.error("Failed to load Rapier", e));
