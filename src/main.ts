import './style.css';
import * as PIXI from 'pixi.js';
import { RobotArm } from './RobotArm';
import { UIManager } from './UIManager';
import { LevelManager } from './LevelManager';
import { Vec2 } from './Vec2';
import * as RAPIER from '@dimforge/rapier2d';

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
  private app!: PIXI.Application;
  
  private world!: RAPIER.World;
  private rapier!: typeof RAPIER;
  private robotArm!: RobotArm;
  private uiManager!: UIManager;
  private levelManager!: LevelManager;

  // Parallax Layers
  private skyLayer!: PIXI.Container;
  private bgLayerFar!: PIXI.Container;
  private bgLayerMid!: PIXI.Container;
  private gameplayLayer!: PIXI.Container;
  private shadowLayer!: PIXI.Container;
  private lightLayer!: PIXI.Container;
  private postProcessLayer!: PIXI.Container;

  // Input & State
  private isMouseDown = false;
  private mousePos = new Vec2();
  private cameraPos = new Vec2(0, 0);

  constructor(rapierModule: typeof RAPIER) {
    this.rapier = rapierModule;
    this.init();
  }

  private async init() {
    this.uiManager = new UIManager();
    
    this.app = new PIXI.Application();
    await this.app.init({ 
      width: window.innerWidth, 
      height: window.innerHeight, 
      backgroundColor: 0xdfefff, // Sky blue
      resizeTo: window,
      antialias: false
    });
    
    const container = document.getElementById('game-container')!;
    container.innerHTML = ''; // Clear Three.js canvas if any
    container.appendChild(this.app.canvas);

    this.postProcessLayer = new PIXI.Container();
    this.app.stage.addChild(this.postProcessLayer);

    this.skyLayer = new PIXI.Container();
    this.bgLayerFar = new PIXI.Container();
    this.bgLayerMid = new PIXI.Container();
    this.gameplayLayer = new PIXI.Container();
    this.shadowLayer = new PIXI.Container();
    this.lightLayer = new PIXI.Container();

    this.postProcessLayer.addChild(this.skyLayer);
    this.postProcessLayer.addChild(this.bgLayerFar);
    this.postProcessLayer.addChild(this.bgLayerMid);
    this.postProcessLayer.addChild(this.gameplayLayer);
    this.postProcessLayer.addChild(this.shadowLayer);
    this.postProcessLayer.addChild(this.lightLayer);

    // 2D Light Texture Generator (Radial Gradient)
    const canvas = document.createElement('canvas');
    canvas.width = 512; canvas.height = 512;
    const ctx = canvas.getContext('2d')!;
    const grd = ctx.createRadialGradient(256, 256, 0, 256, 256, 256);
    grd.addColorStop(0, 'rgba(255, 255, 255, 1)');
    grd.addColorStop(1, 'rgba(255, 255, 255, 0)');
    ctx.fillStyle = grd;
    ctx.fillRect(0, 0, 512, 512);
    const lightTex = PIXI.Texture.from(canvas);

    // Giant Sun Light
    const sunLight = new PIXI.Sprite(lightTex);
    sunLight.anchor.set(0.5);
    sunLight.scale.set(6.0); // Huge glow
    sunLight.tint = 0xffeebb; // Warm sunlight
    sunLight.blendMode = 'add';
    sunLight.alpha = 0.8;
    sunLight.position.set(400, -200);
    this.lightLayer.addChild(sunLight);

    // Dappled Shadow Setup (Multiply Blend Mode)
    const shadowOverlay = new PIXI.Graphics();
    shadowOverlay.rect(-5000, -5000, 10000, 10000).fill({ color: 0x223355, alpha: 0.8 });
    this.shadowLayer.addChild(shadowOverlay);
    this.shadowLayer.blendMode = 'multiply';

    // Punch holes in the shadow (Erase Blend Mode)
    for(let i=0; i<300; i++) {
        const hole = new PIXI.Graphics();
        hole.circle(Math.random() * 8000 - 1000, Math.random() * 1000 - 500, Math.random() * 60 + 20).fill({color: 0xffffff, alpha: 1.0});
        hole.blendMode = 'erase';
        this.shadowLayer.addChild(hole);
    }

    // Physics World
    const gravity = { x: 0.0, y: -30.0 };
    this.world = new this.rapier.World(gravity);

    // Create Robot Arm
    this.robotArm = new RobotArm(this.gameplayLayer, this.world, this.rapier);
    
    // Level Manager
    this.levelManager = new LevelManager(this.uiManager, this.robotArm);

    this.createTestScene();

    // Input events
    window.addEventListener('mousemove', (e) => {
      const cx = window.innerWidth / 2;
      const cy = window.innerHeight / 2;
      const worldX = (e.clientX - cx) / 40 + this.cameraPos.x;
      const worldY = -(e.clientY - cy) / 40 + this.cameraPos.y; 
      
      this.mousePos.x = worldX;
      this.mousePos.y = worldY;
    });
    window.addEventListener('mousedown', () => this.isMouseDown = true);
    window.addEventListener('mouseup', () => this.isMouseDown = false);

    this.app.ticker.add((ticker) => {
      this.animate(ticker.deltaMS);
    });
  }

  private createTestScene() {
    // 1. Forest Floor
    const floorBodyDesc1 = this.rapier.RigidBodyDesc.fixed().setTranslation(50, -15);
    const floorBody1 = this.world.createRigidBody(floorBodyDesc1);
    this.world.createCollider(this.rapier.ColliderDesc.cuboid(50, 5), floorBody1);
    
    const f1Vis = new PIXI.Graphics();
    f1Vis.rect(-50 * 40, -5 * 40, 100 * 40, 10 * 40).fill(0x557755);
    f1Vis.position.set(50 * 40, 15 * 40);
    this.gameplayLayer.addChild(f1Vis);

    // 2. Factory Floor
    const factoryMat = 0x444455;
    const floorBodyDesc2 = this.rapier.RigidBodyDesc.fixed().setTranslation(550, -1510);
    const floorBody2 = this.world.createRigidBody(floorBodyDesc2);
    this.world.createCollider(this.rapier.ColliderDesc.cuboid(400, 10), floorBody2);
    
    const f2Vis = new PIXI.Graphics();
    f2Vis.rect(-400 * 40, -10 * 40, 800 * 40, 20 * 40).fill(factoryMat);
    f2Vis.position.set(550 * 40, 1510 * 40);
    this.gameplayLayer.addChild(f2Vis);

    // Swing Blocks
    for (let i = 0; i < 5; i++) {
      const bx = 10 + i * 20;
      const by = 4 + (i % 2) * 5;
      const blockBodyDesc = this.rapier.RigidBodyDesc.fixed().setTranslation(bx, by);
      const blockBody = this.world.createRigidBody(blockBodyDesc);
      this.world.createCollider(this.rapier.ColliderDesc.cuboid(2, 2), blockBody);
      
      const bVis = new PIXI.Graphics();
      bVis.rect(-2 * 40, -2 * 40, 4 * 40, 4 * 40).fill(0x665544);
      bVis.position.set(bx * 40, -by * 40); // Pixi Y is inverted
      this.gameplayLayer.addChild(bVis);
    }
    
    // Boundaries
    this.world.createCollider(this.rapier.ColliderDesc.cuboid(5, 1000), this.world.createRigidBody(this.rapier.RigidBodyDesc.fixed().setTranslation(-20, -500)));
    this.world.createCollider(this.rapier.ColliderDesc.cuboid(5, 1000), this.world.createRigidBody(this.rapier.RigidBodyDesc.fixed().setTranslation(950, -500)));
    this.world.createCollider(this.rapier.ColliderDesc.cuboid(500, 5), this.world.createRigidBody(this.rapier.RigidBodyDesc.fixed().setTranslation(400, 60)));

    // Parallax Backgrounds
    const farBg = new PIXI.Graphics();
    farBg.rect(0, 0, 5000, 2000).fill(0x738473);
    this.bgLayerFar.addChild(farBg);

    for (let i = 0; i < 20; i++) {
      const tx = i * 400 - 200;
      const trunk = new PIXI.Graphics();
      trunk.rect(-100, -2000, 200 + Math.random() * 100, 4000).fill(0x2a1b0a);
      trunk.position.set(tx, 0);
      this.bgLayerMid.addChild(trunk);
    }
  }

  private animate(deltaMS: number) {
    const deltaTime = Math.min(deltaMS / 1000, 0.1);

    this.world.step();
    this.robotArm.update(this.mousePos, this.isMouseDown);
    this.levelManager.update(deltaTime);

    // Parallax Camera System
    const targetCamX = this.robotArm.clawPos.x;
    const targetCamY = this.robotArm.clawPos.y;
    this.cameraPos.x += (targetCamX - this.cameraPos.x) * 5 * deltaTime;
    this.cameraPos.y += (targetCamY - this.cameraPos.y) * 5 * deltaTime;

    const ppm = 40;
    const cx = window.innerWidth / 2;
    const cy = window.innerHeight / 2;

    // 1:1 Gameplay Layer
    this.gameplayLayer.x = cx - this.cameraPos.x * ppm;
    this.gameplayLayer.y = cy - (-this.cameraPos.y * ppm);

    // Sync Lighting & Shadows to Camera
    this.shadowLayer.x = this.gameplayLayer.x;
    this.shadowLayer.y = this.gameplayLayer.y;
    this.lightLayer.x = this.gameplayLayer.x;
    this.lightLayer.y = this.gameplayLayer.y;

    // Parallax - Midground (Trees)
    this.bgLayerMid.x = cx - this.cameraPos.x * ppm * 0.5;
    this.bgLayerMid.y = cy - (-this.cameraPos.y * ppm * 0.5) - 300;

    // Parallax - Far Background
    this.bgLayerFar.x = cx - this.cameraPos.x * ppm * 0.1 - 2500;
    this.bgLayerFar.y = cy - (-this.cameraPos.y * ppm * 0.1) - 1000;
  }
}

import('@dimforge/rapier2d').then(RAPIER => {
  new Game(RAPIER);
});
