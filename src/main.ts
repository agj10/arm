import './style.css';
import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';

import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';
import { BokehPass } from 'three/examples/jsm/postprocessing/BokehPass.js';
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
  private dirLight!: THREE.DirectionalLight;

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
    this.scene.background = new THREE.Color(0x87ceeb); // Bright sky blue
    this.scene.fog = new THREE.FogExp2(0x87ceeb, 0.005);

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
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
    this.scene.add(ambientLight);

    this.dirLight = new THREE.DirectionalLight(0xffffe0, 1.5);
    this.dirLight.position.set(10, 30, 20);
    this.dirLight.castShadow = true;
    this.dirLight.shadow.camera.top = 100;
    this.dirLight.shadow.camera.bottom = -100;
    this.dirLight.shadow.camera.left = -100;
    this.dirLight.shadow.camera.right = 100;
    this.dirLight.shadow.mapSize.width = 2048;
    this.dirLight.shadow.mapSize.height = 2048;
    this.scene.add(this.dirLight);
    this.scene.add(this.dirLight.target);

    // Post Processing
    this.composer = new EffectComposer(this.renderer);
    
    const renderPass = new RenderPass(this.scene, this.camera);
    this.composer.addPass(renderPass);

    const bloomPass = new UnrealBloomPass(new THREE.Vector2(window.innerWidth, window.innerHeight), 1.5, 0.4, 0.85);
    bloomPass.threshold = 0.6;
    bloomPass.strength = 0.5;
    bloomPass.radius = 0.5;
    this.composer.addPass(bloomPass);

    const bokehPass = new BokehPass(this.scene, this.camera, {
      focus: 45.0,
      aperture: 0.0001,
      maxblur: 0.01,
      width: window.innerWidth,
      height: window.innerHeight
    });
    this.composer.addPass(bokehPass);

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
    
    // Trees
    const trunkMat = new THREE.MeshStandardMaterial({ color: 0x4a3b2c, roughness: 1.0 });
    const leavesMat = new THREE.MeshStandardMaterial({ color: 0x2d4c1e, roughness: 0.8 });
    for (let i = 0; i < 10; i++) {
      const tx = Math.random() * 120;
      
      const trunkGeo = new THREE.CylinderGeometry(0.5, 0.8, 5);
      const trunkMesh = new THREE.Mesh(trunkGeo, trunkMat);
      trunkMesh.position.set(tx, -2.5, -5 - Math.random() * 5);
      trunkMesh.castShadow = true;
      trunkMesh.receiveShadow = true;
      this.scene.add(trunkMesh);
      
      const leavesGeo = new THREE.ConeGeometry(3, 8);
      const leavesMesh = new THREE.Mesh(leavesGeo, leavesMat);
      leavesMesh.position.set(tx, 4, trunkMesh.position.z);
      leavesMesh.castShadow = true;
      leavesMesh.receiveShadow = true;
      this.scene.add(leavesMesh);
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

    // Camera follow (Claw)
    const clawPos = this.robotArm.clawPos;
    this.camera.position.x += (clawPos.x - this.camera.position.x) * 0.1;
    this.camera.position.y += (clawPos.y - this.camera.position.y) * 0.1;
    this.camera.lookAt(this.camera.position.x, this.camera.position.y, 0);

    // Light follow camera
    this.dirLight.position.x = this.camera.position.x + 10;
    this.dirLight.target.position.x = this.camera.position.x;
    this.dirLight.target.updateMatrixWorld();

    // Render using Composer!
    this.composer.render();
  }
}

// Load Rapier dynamically and start game
import('@dimforge/rapier2d').then(RAPIER => {
  new Game(RAPIER);
}).catch(e => console.error("Failed to load Rapier", e));
