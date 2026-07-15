import './style.css';
import * as PIXI from 'pixi.js';
import { RobotArm } from './RobotArm';
import { UIManager } from './UIManager';
import { LevelManager } from './LevelManager';
import { LightingSystem } from './LightingSystem';
import { Vec2 } from './Vec2';
import * as RAPIER from '@dimforge/rapier2d';
import { AdvancedBloomFilter, AdjustmentFilter } from 'pixi-filters';

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
      backgroundColor: 0xcc6633, // Vibrant sunset orange sky
      resizeTo: window,
      antialias: false
    });
    
    const container = document.getElementById('game-container')!;
    container.innerHTML = ''; 
    container.appendChild(this.app.canvas);

    this.app.stage.scale.set(0.5); // Zoom out 2x to widen FOV

    const adjustmentFilter = new AdjustmentFilter({
      gamma: 1.2,
      saturation: 1.1,
      contrast: 1.3,
      brightness: 1.1,
    });

    // Apply cinematic post-processing to everything
    this.postProcessLayer = new PIXI.Container();
    this.app.stage.addChild(this.postProcessLayer);
    this.postProcessLayer.filters = [
      new AdvancedBloomFilter({
        threshold: 0.5,
        bloomScale: 0.8,
        brightness: 1.0,
        blur: 4,
        quality: 4
      }),
      adjustmentFilter
    ];

    this.skyLayer = new PIXI.Container();
    
    // Draw a sunset Sun in the sky
    const sun = new PIXI.Graphics();
    sun.circle(0, 0, 60).fill({ color: 0xffffee }); // Smaller, brighter core
    sun.position.set(window.innerWidth * 0.7, window.innerHeight * 0.7);
    // Glow is handled by LightingSystem
    
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
    shadowOverlay.rect(-5000, -5000, 10000, 10000).fill({ color: 0x221133, alpha: 0.45 }); // Lighter shadow to keep sky visible
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
    // 1. Endless Flat Floor
    const floorBodyDesc1 = this.rapier.RigidBodyDesc.fixed().setTranslation(0, -15);
    const floorBody1 = this.world.createRigidBody(floorBodyDesc1);
    this.world.createCollider(this.rapier.ColliderDesc.cuboid(5000, 5), floorBody1);
    
    const f1Vis = new PIXI.Graphics();
    f1Vis.rect(-5000 * 40, -5 * 40, 10000 * 40, 10 * 40).fill(0x557755);
    f1Vis.position.set(0, 15 * 40);
    this.gameplayLayer.addChild(f1Vis);

    // Boundaries
    this.world.createCollider(this.rapier.ColliderDesc.cuboid(5, 1000), this.world.createRigidBody(this.rapier.RigidBodyDesc.fixed().setTranslation(-200, -500)));
    this.world.createCollider(this.rapier.ColliderDesc.cuboid(5, 1000), this.world.createRigidBody(this.rapier.RigidBodyDesc.fixed().setTranslation(4800, -500)));
    this.world.createCollider(this.rapier.ColliderDesc.cuboid(5000, 5), this.world.createRigidBody(this.rapier.RigidBodyDesc.fixed().setTranslation(0, 60)));
  }

  private animate(deltaMS: number) {
    const deltaTime = Math.min(deltaMS / 1000, 0.1);

    this.world.step();
    this.robotArm.update(this.mousePos, this.isMouseDown);
    
    this.levelManager.update(deltaTime);
    
    // Position the sun high in the sky (300 pixels above screen center)
    const sunWorldPos = new Vec2(this.cameraPos.x, this.cameraPos.y + 7.5);
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

    // Fix Sun high in the sky (center X, top Y)
    this.sunVisual.position.set(cx, cy - 300);

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
