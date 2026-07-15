import './style.css';
import * as PIXI from 'pixi.js';
import { RobotArm } from './RobotArm';
import { UIManager } from './UIManager';
import { LevelManager } from './LevelManager';
import { LightingSystem } from './LightingSystem';
import { Vec2 } from './Vec2';
import * as RAPIER from '@dimforge/rapier2d';
import { GlowFilter, GodrayFilter, AdvancedBloomFilter, AdjustmentFilter } from 'pixi-filters';

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
  private clawLayer!: PIXI.Container;
  private shadowLayer!: PIXI.Container;
  private lightLayer!: PIXI.Container;
  private silhouetteLayer!: PIXI.Container;
  private levelMaskContainer!: PIXI.Container;
  private sunLayer!: PIXI.Container;
  private postProcessLayer!: PIXI.Container;
  
  private godrayFilter!: GodrayFilter;
  
  private targetZoom: number = 1.0;
  private currentZoom: number = 1.0;
  
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
    
    PIXI.AbstractRenderer.defaultOptions.roundPixels = true;
    PIXI.TextureStyle.defaultOptions.scaleMode = 'nearest';

    await this.app.init({ 
      width: window.innerWidth, 
      height: window.innerHeight, 
      backgroundColor: 0xaa5533,
      resizeTo: window,
      antialias: false
    });
    
    const container = document.getElementById('game-container')!;
    container.innerHTML = ''; 
    container.appendChild(this.app.canvas);

    this.app.stage.scale.set(0.5);

    const adjustmentFilter = new AdjustmentFilter({
      gamma: 1.2,
      saturation: 1.1,
      contrast: 1.3,
      brightness: 1.1,
    });

    this.postProcessLayer = new PIXI.Container();
    this.app.stage.addChild(this.postProcessLayer);
    this.postProcessLayer.filters = [
      new AdvancedBloomFilter({
        threshold: 0.5,
        bloomScale: 0.4,
        brightness: 1.0,
        blur: 4,
        quality: 4
      }),
      adjustmentFilter
    ];

    this.skyLayer = new PIXI.Container();
    
    this.bgLayerFar = new PIXI.Container();
    this.bgLayerMid = new PIXI.Container();
    this.gameplayLayer = new PIXI.Container();
    this.clawLayer = new PIXI.Container();
    this.shadowLayer = new PIXI.Container();
    this.lightLayer = new PIXI.Container();
    
    this.silhouetteLayer = new PIXI.Container();
    this.levelMaskContainer = new PIXI.Container();
    this.silhouetteLayer.mask = this.levelMaskContainer;
    this.silhouetteLayer.filters = [
        new GlowFilter({ distance: 10, outerStrength: 1.5, innerStrength: 0, color: 0x00ffff, quality: 0.2 }),
        new PIXI.AlphaFilter({ alpha: 0.12 })
    ];

    this.sunLayer = new PIXI.Container();
    
    // Create the sun visual
    this.sunVisual = new PIXI.Graphics();
    
    // Outer glow
    this.sunVisual.circle(0, 0, 120).fill({ color: 0xffaa00, alpha: 0.2 });
    this.sunVisual.circle(0, 0, 80).fill({ color: 0xffdd66, alpha: 0.4 });
    // Core
    this.sunVisual.circle(0, 0, 50).fill({ color: 0xffffff });
    
    this.sunVisual.position.set(35 * 40, 45 * 40);
    
    this.godrayFilter = new GodrayFilter({ angle: 30, gain: 0.4, lacunarity: 2.5, time: 0 });
    this.sunLayer.filters = [this.godrayFilter];
    this.sunLayer.addChild(this.sunVisual);

    this.postProcessLayer.addChild(this.skyLayer);
    this.postProcessLayer.addChild(this.bgLayerFar);
    this.postProcessLayer.addChild(this.bgLayerMid);
    this.postProcessLayer.addChild(this.sunLayer);
    this.postProcessLayer.addChild(this.gameplayLayer);
    this.postProcessLayer.addChild(this.clawLayer);
    
    this.postProcessLayer.filters = [
        new AdvancedBloomFilter({ threshold: 0.4, bloomScale: 1.0, brightness: 1.0, blur: 8 })
    ];
    
    // Add mask container to display tree so its world transforms are updated!
    // Since it's assigned as a mask, PixiJS will not render it to the color buffer.
    this.postProcessLayer.addChild(this.levelMaskContainer);
    
    const shadowOverlay = new PIXI.Graphics();
    shadowOverlay.rect(-50000, -50000, 100000, 100000).fill({ color: 0x221133, alpha: 0.45 });
    this.shadowLayer.addChild(shadowOverlay);
    this.shadowLayer.blendMode = 'multiply';
    this.postProcessLayer.addChild(this.shadowLayer);

    const gravity = { x: 0.0, y: -60.0 };
    this.world = new this.rapier.World(gravity);

    this.lightingSystem = new LightingSystem(this.world, this.rapier);
    this.lightLayer = this.lightingSystem.lightContainer;
    this.postProcessLayer.addChild(this.lightLayer);

    // Add silhouette on top of shadows and lights so it glows clearly
    this.postProcessLayer.addChild(this.silhouetteLayer);

    // Create Robot Arm
    this.robotArm = new RobotArm(this.gameplayLayer, this.clawLayer, this.silhouetteLayer, this.world, this.rapier);
    
    this.levelManager = new LevelManager(this.uiManager, this.robotArm);
    this.createTestScene();

    window.addEventListener('mousemove', (e) => {
      const cx = window.innerWidth / 2;
      const cy = window.innerHeight / 2;
      const stageScale = 0.5;
      const ppm = 40;
      const zoom = this.currentZoom;
      const worldX = (e.clientX - cx) / (ppm * zoom * stageScale) + this.cameraPos.x;
      const worldY = -(e.clientY - cy) / (ppm * zoom * stageScale) + this.cameraPos.y; 
      
      this.mousePos.x = worldX;
      this.mousePos.y = worldY;
    });

    window.addEventListener('wheel', (e) => {
        const zoomSpeed = 0.05;
        if (e.deltaY < 0) {
            this.targetZoom += zoomSpeed;
        } else {
            this.targetZoom -= zoomSpeed;
        }
        this.targetZoom = Math.max(0.6, Math.min(1.5, this.targetZoom));
    });
    window.addEventListener('mousedown', () => this.isMouseDown = true);
    window.addEventListener('mouseup', () => this.isMouseDown = false);

    this.app.ticker.add((ticker) => {
      this.animate(ticker.deltaMS);
    });
  }

  private createTestScene() {
    // Floor
    const floorBodyDesc1 = this.rapier.RigidBodyDesc.fixed().setTranslation(0, -15);
    const floorBody1 = this.world.createRigidBody(floorBodyDesc1);
    this.world.createCollider(this.rapier.ColliderDesc.cuboid(5000, 5).setCollisionGroups(0x0001000b), floorBody1);
    
    const f1Vis = new PIXI.Graphics();
    f1Vis.rect(-5000 * 40, -5 * 40, 10000 * 40, 10 * 40).fill(0x557755);
    f1Vis.position.set(0, 15 * 40);
    this.gameplayLayer.addChild(f1Vis);
    
    const f1Mask = new PIXI.Graphics();
    f1Mask.rect(-5000 * 40, -5 * 40, 10000 * 40, 10 * 40).fill(0xffffff);
    f1Mask.position.set(0, 15 * 40);
    this.levelMaskContainer.addChild(f1Mask);

    // Walls
    this.world.createCollider(this.rapier.ColliderDesc.cuboid(5, 1000).setCollisionGroups(0x0001000b), this.world.createRigidBody(this.rapier.RigidBodyDesc.fixed().setTranslation(-200, -500)));
    const w1Mask = new PIXI.Graphics();
    w1Mask.rect(-5 * 40, -1000 * 40, 10 * 40, 2000 * 40).fill(0xffffff);
    w1Mask.position.set(-200 * 40, 500 * 40); // Y is flipped visually
    this.levelMaskContainer.addChild(w1Mask);

    this.world.createCollider(this.rapier.ColliderDesc.cuboid(5, 1000).setCollisionGroups(0x0001000b), this.world.createRigidBody(this.rapier.RigidBodyDesc.fixed().setTranslation(4800, -500)));
    const w2Mask = new PIXI.Graphics();
    w2Mask.rect(-5 * 40, -1000 * 40, 10 * 40, 2000 * 40).fill(0xffffff);
    w2Mask.position.set(4800 * 40, 500 * 40);
    this.levelMaskContainer.addChild(w2Mask);

    // Test Platform 1
    this.world.createCollider(this.rapier.ColliderDesc.cuboid(10, 2).setCollisionGroups(0x0001000b), this.world.createRigidBody(this.rapier.RigidBodyDesc.fixed().setTranslation(30, 10)));
    const p1Vis = new PIXI.Graphics();
    p1Vis.rect(-10 * 40, -2 * 40, 20 * 40, 4 * 40).fill(0x775555);
    p1Vis.position.set(30 * 40, -10 * 40);
    this.gameplayLayer.addChild(p1Vis);
    const p1Mask = new PIXI.Graphics();
    p1Mask.rect(-10 * 40, -2 * 40, 20 * 40, 4 * 40).fill(0xffffff);
    p1Mask.position.set(30 * 40, -10 * 40);
    this.levelMaskContainer.addChild(p1Mask);

    // Test Platform 2 (Large Block)
    this.world.createCollider(this.rapier.ColliderDesc.cuboid(5, 15).setCollisionGroups(0x0001000b), this.world.createRigidBody(this.rapier.RigidBodyDesc.fixed().setTranslation(60, 5)));
    const p2Vis = new PIXI.Graphics();
    p2Vis.rect(-5 * 40, -15 * 40, 10 * 40, 30 * 40).fill(0x555577);
    p2Vis.position.set(60 * 40, -5 * 40);
    this.gameplayLayer.addChild(p2Vis);
    const p2Mask = new PIXI.Graphics();
    p2Mask.rect(-5 * 40, -15 * 40, 10 * 40, 30 * 40).fill(0xffffff);
    p2Mask.position.set(60 * 40, -5 * 40);
    this.levelMaskContainer.addChild(p2Mask);

    // Test Platform 3 (Giant Ceiling Object)
    this.world.createCollider(this.rapier.ColliderDesc.cuboid(40, 10).setCollisionGroups(0x0001000b), this.world.createRigidBody(this.rapier.RigidBodyDesc.fixed().setTranslation(120, 30)));
    const p3Vis = new PIXI.Graphics();
    p3Vis.rect(-40 * 40, -10 * 40, 80 * 40, 20 * 40).fill(0x444444);
    p3Vis.position.set(120 * 40, -30 * 40);
    this.gameplayLayer.addChild(p3Vis);
    const p3Mask = new PIXI.Graphics();
    p3Mask.rect(-40 * 40, -10 * 40, 80 * 40, 20 * 40).fill(0xffffff);
    p3Mask.position.set(120 * 40, -30 * 40);
    this.levelMaskContainer.addChild(p3Mask);

    // Ceiling
    this.world.createCollider(this.rapier.ColliderDesc.cuboid(5000, 5).setCollisionGroups(0x0001000b), this.world.createRigidBody(this.rapier.RigidBodyDesc.fixed().setTranslation(0, 60)));
    const cMask = new PIXI.Graphics();
    cMask.rect(-5000 * 40, -5 * 40, 10000 * 40, 10 * 40).fill(0xffffff);
    cMask.position.set(0, -60 * 40);
    this.levelMaskContainer.addChild(cMask);
  }

  private animate(deltaMS: number) {
    const deltaTime = Math.min(deltaMS / 1000, 0.1);

    this.robotArm.update(this.mousePos, this.isMouseDown);
    this.world.step();
    
    this.levelManager.update(deltaTime);
    
    const sunWorldPos = new Vec2(this.cameraPos.x, this.cameraPos.y + 7.5);
    this.lightingSystem.update(sunWorldPos);

    const targetCamX = this.robotArm.clawPos.x;
    const targetCamY = this.robotArm.clawPos.y; 
    this.cameraPos.x += (targetCamX - this.cameraPos.x) * 5 * deltaTime;
    this.cameraPos.y += (targetCamY - this.cameraPos.y) * 5 * deltaTime;
    
    this.godrayFilter.time += deltaTime * 0.01;
    
    this.currentZoom += (this.targetZoom - this.currentZoom) * 0.1;
    const zoom = this.currentZoom;
    const ppm = 40;
    const stageScale = 0.5;
    const cx = (window.innerWidth / 2) / stageScale;
    const cy = (window.innerHeight / 2) / stageScale;

    const layers = [
      this.gameplayLayer, this.clawLayer, this.shadowLayer, 
      this.lightLayer, this.silhouetteLayer, this.levelMaskContainer, this.sunLayer
    ];

    layers.forEach(layer => {
      layer.scale.set(zoom);
      layer.x = cx - this.cameraPos.x * ppm * zoom;
      layer.y = cy - (-this.cameraPos.y * ppm) * zoom;
    });

    this.bgLayerMid.scale.set(zoom);
    this.bgLayerMid.x = cx - this.cameraPos.x * ppm * zoom * 0.5;
    this.bgLayerMid.y = cy - (-this.cameraPos.y * ppm * zoom * 0.5) - 300 * zoom;

    this.bgLayerFar.scale.set(zoom);
    this.bgLayerFar.x = cx - this.cameraPos.x * ppm * zoom * 0.1 - 2500 * zoom;
    this.bgLayerFar.y = cy - (-this.cameraPos.y * ppm * zoom * 0.1) - 1000 * zoom;
  }
}

import('@dimforge/rapier2d').then(RAPIER => {
  new Game(RAPIER);
});
