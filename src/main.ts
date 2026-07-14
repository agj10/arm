import './style.css';
import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';

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
      versionDisplay.textContent = data.version;
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

  // Input & State
  private isMouseDown = false;
  private hasMouseMoved = false;
  private mouse = new THREE.Vector2();
  private mousePos = new THREE.Vector2();
  private lastTime = 0;

  constructor(rapierModule: any) {
    this.rapier = rapierModule;
    const container = document.getElementById('game-container')!;
    this.uiManager = new UIManager();
    
    // Scene setup
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x2a3b4c);
    this.scene.fog = new THREE.FogExp2(0x2a3b4c, 0.015);

    // Camera setup (2.5D perspective)
    this.camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
    this.camera.position.z = 45;

    // Renderer
    this.renderer = new THREE.WebGLRenderer({ antialias: false });
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.setPixelRatio(window.devicePixelRatio);
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    container.appendChild(this.renderer.domElement);

    // Lights
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.8);
    this.scene.add(ambientLight);

    const dirLight = new THREE.DirectionalLight(0xffffff, 1.5);
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

    // const ssaoPass = new SSAOPass(this.scene, this.camera, window.innerWidth, window.innerHeight);
    // ssaoPass.kernelRadius = 16;
    // ssaoPass.minDistance = 0.005;
    // ssaoPass.maxDistance = 0.1;
    // this.composer.addPass(ssaoPass);

    const bloomPass = new UnrealBloomPass(new THREE.Vector2(window.innerWidth, window.innerHeight), 1.5, 0.4, 0.85);
    bloomPass.threshold = 0.2;
    bloomPass.strength = 1.2;
    bloomPass.radius = 0.5;
    this.composer.addPass(bloomPass);

    const colorCorrectionPass = new ShaderPass(ColorCorrectionShader);
    this.composer.addPass(colorCorrectionPass);

    const vignettePass = new ShaderPass(VignetteShader);
    vignettePass.uniforms["offset"].value = 1.0;
    vignettePass.uniforms["darkness"].value = 0.8;
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
          vec2 dir = dist > 0.0 ? d / dist : vec2(0.0);
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
    const gravity = { x: 0.0, y: -30.0 }; // Increased gravity
    this.world = new this.rapier.World(gravity);

    // Create Robot Arm
    this.robotArm = new RobotArm(this.scene, this.world, this.rapier);
    
    // Level Manager
    this.levelManager = new LevelManager(this.uiManager, this.robotArm);

    // Placeholder level design
    this.createTestScene();

    // Event Listeners
    window.addEventListener('resize', this.onWindowResize.bind(this));
    
    // Mouse events
    window.addEventListener('mousemove', (e) => {
      this.hasMouseMoved = true;
      this.mouse.x = (e.clientX / window.innerWidth) * 2 - 1;
      this.mouse.y = -(e.clientY / window.innerHeight) * 2 + 1;
    });
    window.addEventListener('mousedown', () => this.isMouseDown = true);
    window.addEventListener('mouseup', () => this.isMouseDown = false);
    window.addEventListener('wheel', (e) => {
      this.camera.position.z += Math.sign(e.deltaY) * 2.0;
      this.camera.position.z = Math.max(15, Math.min(this.camera.position.z, 60));
    });

    this.animate();
  }

  private createTestScene() {
    // Static Floor & Platforms - 2D Planes
    const floorMat = new THREE.MeshStandardMaterial({ color: 0x557755, roughness: 1.0 }); 
    
    // Forest Floor (x: -50 to 150)
    const floorGeo1 = new THREE.PlaneGeometry(200, 20);
    const floorMesh1 = new THREE.Mesh(floorGeo1, floorMat);
    floorMesh1.position.set(50, -15, 0); // Center at 50, top at -5
    floorMesh1.receiveShadow = true;
    this.scene.add(floorMesh1);

    const floorBodyDesc1 = this.rapier.RigidBodyDesc.fixed().setTranslation(50, -15);
    const floorBody1 = this.world.createRigidBody(floorBodyDesc1);
    this.world.createCollider(this.rapier.ColliderDesc.cuboid(100, 10), floorBody1);

    // Underground Factory Floor (x: 150 to 950)
    const factoryMat = new THREE.MeshStandardMaterial({ color: 0x444455, roughness: 0.8 });
    const floorGeo2 = new THREE.PlaneGeometry(800, 20);
    const floorMesh2 = new THREE.Mesh(floorGeo2, factoryMat);
    floorMesh2.position.set(550, -70, 0); // Drop down, top at -60
    floorMesh2.receiveShadow = true;
    this.scene.add(floorMesh2);

    const floorBodyDesc2 = this.rapier.RigidBodyDesc.fixed().setTranslation(550, -70);
    const floorBody2 = this.world.createRigidBody(floorBodyDesc2);
    this.world.createCollider(this.rapier.ColliderDesc.cuboid(400, 10), floorBody2);

    // Some extra blocks to swing on
    const blockMat = new THREE.MeshStandardMaterial({ color: 0x665544, roughness: 0.9 });
    for (let i = 0; i < 5; i++) {
      const blockGeo = new THREE.PlaneGeometry(4, 4);
      const blockMesh = new THREE.Mesh(blockGeo, blockMat);
      const bx = 10 + i * 20;
      const by = 4 + (i % 2) * 5;
      blockMesh.position.set(bx, by, 0);
      blockMesh.receiveShadow = true;
      this.scene.add(blockMesh);

      const blockBodyDesc = this.rapier.RigidBodyDesc.fixed().setTranslation(bx, by);
      const blockBody = this.world.createRigidBody(blockBodyDesc);
      const blockColliderDesc = this.rapier.ColliderDesc.cuboid(2, 2);
      this.world.createCollider(blockColliderDesc, blockBody);
    }
    
    // Boundaries to prevent escaping
    this.world.createCollider(this.rapier.ColliderDesc.cuboid(5, 100), this.world.createRigidBody(this.rapier.RigidBodyDesc.fixed().setTranslation(-20, 30))); // Left
    this.world.createCollider(this.rapier.ColliderDesc.cuboid(5, 100), this.world.createRigidBody(this.rapier.RigidBodyDesc.fixed().setTranslation(950, 30))); // Right
    this.world.createCollider(this.rapier.ColliderDesc.cuboid(500, 5), this.world.createRigidBody(this.rapier.RigidBodyDesc.fixed().setTranslation(400, 60))); // Ceiling

    // Background parallax layers
    const bgMat1 = new THREE.MeshBasicMaterial({ color: 0x334433 });
    const bg1 = new THREE.Mesh(new THREE.PlaneGeometry(300, 50), bgMat1);
    bg1.position.set(50, 10, -10);
    this.scene.add(bg1);

    const bgMat2 = new THREE.MeshBasicMaterial({ color: 0x112211 });
    const bg2 = new THREE.Mesh(new THREE.PlaneGeometry(300, 80), bgMat2);
    bg2.position.set(50, 20, -20);
    this.scene.add(bg2);
  }

  private onWindowResize() {
    this.camera.aspect = window.innerWidth / window.innerHeight;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(window.innerWidth, window.innerHeight);
  }

  private updateMouseWorldPos() {
    const vec = new THREE.Vector3(this.mouse.x, this.mouse.y, 0.5);
    vec.unproject(this.camera);
    const dir = vec.sub(this.camera.position).normalize();
    const distance = -this.camera.position.z / dir.z;
    const pos = this.camera.position.clone().add(dir.multiplyScalar(distance));
    this.mousePos.set(pos.x, pos.y);
  }

  private animate(time: number = 0) {
    requestAnimationFrame(this.animate.bind(this));
    if (!this.hasMouseMoved) {
      // Fake a mouse position straight up so the body hangs straight down
      this.mousePos.set(this.robotArm.clawPos.x, this.robotArm.clawPos.y + 4.5);
    } else {
      this.updateMouseWorldPos(); 
    }

    const deltaTime = Math.min((time - this.lastTime) / 1000, 0.1);
    this.lastTime = time;

    // Physics step
    this.world.step();

    // Logic update
    this.robotArm.update(this.mousePos, this.isMouseDown);
    this.levelManager.update(deltaTime);

    // Camera follow (Body)
    const bodyPos = this.robotArm.bodyMesh.position;
    this.camera.position.x += (bodyPos.x - this.camera.position.x) * 0.1;
    this.camera.position.y += (bodyPos.y - this.camera.position.y) * 0.1;
    this.camera.lookAt(this.camera.position.x, this.camera.position.y, 0);

    // Render
    this.renderer.render(this.scene, this.camera);
  }
}

// Load Rapier dynamically and start game
import('@dimforge/rapier2d').then(RAPIER => {
  new Game(RAPIER);
}).catch(e => console.error("Failed to load Rapier", e));
