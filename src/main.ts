import './style.css';
import * as PIXI from 'pixi.js';
import { RobotArm } from './RobotArm';
import { UIManager } from './UIManager';
import { LevelManager } from './LevelManager';
import { LightingSystem } from './LightingSystem';
import { Vec2 } from './Vec2';
import * as RAPIER from '@dimforge/rapier2d';
import { AdvancedBloomFilter, GodrayFilter, AdjustmentFilter } from 'pixi-filters';

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
  private lightingSystem!: LightingSystem;

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
  private sunVisual!: PIXI.Graphics;

  constructor(rapierModule: typeof RAPIER) {
    this.rapier = rapierModule;
    this.init();
  }

  private async init() {
    this.uiManager = new UIManager();
    
    this.app = new PIXI.Application();
    
    // Pixel Art settings
    PIXI.AbstractRenderer.defaultOptions.roundPixels = true;
    PIXI.TextureStyle.defaultOptions.scaleMode = 'nearest';

    await this.app.init({ 
      width: window.innerWidth, 
      height: window.innerHeight, 
      backgroundColor: 0xaa5533, // Darker, moody sunset orange sky
      resizeTo: window,
      antialias: false
    });
    
    const container = document.getElementById('game-container')!;
    container.innerHTML = ''; 
    container.appendChild(this.app.canvas);

    this.app.stage.scale.set(0.5); // Zoom out 2x to widen FOV

    const adjustmentFilter = new AdjustmentFilter({
      saturation: 1.2,
      contrast: 1.1,
      brightness: 1.05
    });

    this.postProcessLayer = new PIXI.Container();
    this.app.stage.addChild(this.postProcessLayer);
    
    // Apply cinematic post-processing to everything
    this.postProcessLayer.filters = [
      new AdvancedBloomFilter({
        threshold: 0.4,
        bloomScale: 1.5,
        brightness: 1.0,
        blur: 8,
        quality: 4
      }),
      adjustmentFilter
    ];

    this.skyLayer = new PIXI.Container();
    
    // Draw a sunset Sun in the sky
    const sun = new PIXI.Graphics();
    sun.circle(0, 0, 100).fill({ color: 0xffeadd });
    sun.position.set(window.innerWidth * 0.7, window.innerHeight * 0.7);
    
    // Add sun halo/glow
    const sunGlow = new PIXI.Graphics();
    sunGlow.circle(0, 0, 300).fill({ color: 0xffaa44, alpha: 0.35 });
    sunGlow.filters = [new PIXI.BlurFilter(50)];
    sun.addChild(sunGlow);
    
    this.skyLayer.addChild(sun);
    this.sunVisual = sun;
    
    this.bgLayerFar = new PIXI.Container();
    this.bgLayerMid = new PIXI.Container();
    this.gameplayLayer = new PIXI.Container();
    this.shadowLayer = new PIXI.Container();
    this.lightLayer = new PIXI.Container();

    this.postProcessLayer.addChild(this.skyLayer);
    this.postProcessLayer.addChild(this.bgLayerFar);
    this.postProcessLayer.addChild(this.bgLayerMid);
    this.postProcessLayer.addChild(this.gameplayLayer);
    
    // Dark Ambient Shadow (Sunset Twilight)
    const shadowOverlay = new PIXI.Graphics();
    shadowOverlay.rect(-5000, -5000, 10000, 10000).fill({ color: 0x221133, alpha: 0.65 }); // Brighter shadow
    this.shadowLayer.addChild(shadowOverlay);
    
    this.shadowLayer.blendMode = 'multiply';
    this.postProcessLayer.addChild(this.shadowLayer);

    // Physics World
    const gravity = { x: 0.0, y: -30.0 };
    this.world = new this.rapier.World(gravity);

    // Dynamic Lighting System
    this.lightingSystem = new LightingSystem(this.world, this.rapier);
    this.lightLayer = this.lightingSystem.lightContainer;
    this.postProcessLayer.addChild(this.lightLayer);

    // Create Robot Arm
    this.robotArm = new RobotArm(this.gameplayLayer, this.world, this.rapier);
    
    // Level Manager
    this.levelManager = new LevelManager(this.uiManager, this.robotArm);

    this.createTestScene();

    // Input events
    window.addEventListener('mousemove', (e) => {
      const cx = window.innerWidth / 2;
      const cy = window.innerHeight / 2;
      const stageScale = 0.5;
      const ppm = 40;
      // Convert screen pixels to world units, accounting for stage scale
      const worldX = (e.clientX - cx) / (ppm * stageScale) + this.cameraPos.x;
      const worldY = -(e.clientY - cy) / (ppm * stageScale) + this.cameraPos.y; 
      
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

    // Swing Blocks with Static Shadows
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
    
    // Update Cinematic Shaders
    const sunWorldPos = new Vec2(this.cameraPos.x, this.cameraPos.y);
    this.lightingSystem.update(sunWorldPos);

    // Parallax Camera System
    const targetCamX = this.robotArm.clawPos.x;
    const targetCamY = this.robotArm.clawPos.y; 
    this.cameraPos.x += (targetCamX - this.cameraPos.x) * 5 * deltaTime;
    this.cameraPos.y += (targetCamY - this.cameraPos.y) * 5 * deltaTime;
    
    const ppm = 40;
    const stageScale = 0.5;
    const cx = (window.innerWidth / 2) / stageScale;
    const cy = (window.innerHeight / 2) / stageScale;

    // Fix Sun directly in the center of the screen
    this.sunVisual.position.set(cx + this.cameraPos.x * ppm, cy + (-this.cameraPos.y * ppm));

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
