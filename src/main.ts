import './style.css';
import * as PIXI from 'pixi.js';
import { RobotArm } from './RobotArm';
import { UIManager } from './UIManager';
import { LevelManager } from './LevelManager';
import { LightingSystem } from './LightingSystem';
import { Vec2 } from './Vec2';
import * as RAPIER from '@dimforge/rapier2d';
import { AdvancedBloomFilter, AdjustmentFilter, GlowFilter } from 'pixi-filters';

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
  private postProcessLayer!: PIXI.Container;
  
  private targetZoom: number = 1.0;
  private currentZoom: number = 1.0;
  
  private silhouetteLayer!: PIXI.Container;
  private levelMaskContainer!: PIXI.Container;

  // Input & State
  private isMouseDown = false;
  private isRightClickDown = false;
  private mousePos = new Vec2();
  private rawMouseX = 0;
  private rawMouseY = 0;
  private cameraPos = new Vec2(0, 0);
  private sunLayer!: PIXI.Container;
  private sunVisual!: PIXI.Sprite;

  // Crosshair & Snap trails
  private crosshair!: PIXI.Graphics;
  private crosshairSnap!: PIXI.Graphics;
  private snapLine!: PIXI.Graphics;
  private crosshairGlow!: PIXI.Graphics;
  private glowIntensity: number = 0;
  private isShiftDown: boolean = false;
  private uiLayer!: PIXI.Container;
  private snapGhosts: { container: PIXI.Container, filter?: PIXI.AlphaFilter, alpha: number, delay: number }[] = [];

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
    this.sunLayer = new PIXI.Container();
    
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

    this.postProcessLayer.addChild(this.skyLayer);
    this.postProcessLayer.addChild(this.bgLayerFar);
    this.postProcessLayer.addChild(this.bgLayerMid);
    this.postProcessLayer.addChild(this.sunLayer);
    this.postProcessLayer.addChild(this.gameplayLayer);
    this.postProcessLayer.addChild(this.clawLayer);
    
    // Add mask container to display tree so its world transforms are updated!
    // Since it's assigned as a mask, PixiJS will not render it to the color buffer.
    this.postProcessLayer.addChild(this.levelMaskContainer);
    
    const shadowOverlay = new PIXI.Graphics();
    shadowOverlay.rect(-50000, -50000, 100000, 100000).fill({ color: 0x221133, alpha: 0.45 });
    this.shadowLayer.addChild(shadowOverlay);
    this.shadowLayer.blendMode = 'multiply';
    this.postProcessLayer.addChild(this.shadowLayer);

    const gravity = { x: 0.0, y: -30.0 };
    this.world = new this.rapier.World(gravity);

    this.lightingSystem = new LightingSystem(this.world, this.rapier);
    this.lightLayer = this.lightingSystem.lightContainer;
    this.postProcessLayer.addChild(this.lightLayer);

    // Create the persistent visual sun using the beautiful lighting texture
    this.sunVisual = new PIXI.Sprite(this.lightingSystem.sunTexture);
    this.sunVisual.anchor.set(0.5);
    this.sunVisual.blendMode = 'add';
    // maxDistance is 80 (3200px radius), texture is 4096px (2048px radius)
    // 3200 / 2048 = 1.5625
    this.sunVisual.scale.set(1.5625);
    this.sunLayer.addChild(this.sunVisual);

    // Add silhouette on top of shadows and lights so it glows clearly
    this.postProcessLayer.addChild(this.silhouetteLayer);

    // Create Robot Arm
    this.robotArm = new RobotArm(this.gameplayLayer, this.clawLayer, this.silhouetteLayer, this.world, this.rapier);
    
    this.levelManager = new LevelManager(this.uiManager, this.robotArm);
    this.createTestScene();

    window.addEventListener('mousemove', (e) => {
      this.rawMouseX = e.clientX;
      this.rawMouseY = e.clientY;
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
    window.addEventListener('mousedown', (e) => { if (e.button === 0) this.isMouseDown = true; });
    window.addEventListener('mouseup', (e) => { if (e.button === 0) this.isMouseDown = false; });
    window.addEventListener('mousedown', (e) => { if (e.button === 2) this.isRightClickDown = true; });
    window.addEventListener('mouseup', (e) => { if (e.button === 2) this.isRightClickDown = false; });
    window.addEventListener('contextmenu', (e) => e.preventDefault());

    window.addEventListener('keydown', (e) => { if (e.key === 'Shift') this.isShiftDown = true; });
    window.addEventListener('keyup', (e) => { if (e.key === 'Shift') this.isShiftDown = false; });

    this.app.ticker.add((ticker) => {
      this.animate(ticker.deltaMS);
    });

    // Hide default cursor
    document.body.style.cursor = 'none';
    this.app.canvas.style.cursor = 'none';

    // UI layer (screen-space, on top of everything)
    this.uiLayer = new PIXI.Container();
    this.app.stage.addChild(this.uiLayer);

    // Normal crosshair (cyan +)
    this.crosshair = new PIXI.Graphics();
    this.drawCrosshair(this.crosshair);
    this.uiLayer.addChild(this.crosshair);

    // Snap-ready crosshair (diamond with inner dot)
    this.crosshairSnap = new PIXI.Graphics();
    this.drawSnapCrosshair(this.crosshairSnap);
    this.crosshairSnap.visible = false;
    this.uiLayer.addChild(this.crosshairSnap);

    // Snap line (connects claw to snap crosshair)
    this.snapLine = new PIXI.Graphics();
    this.uiLayer.addChild(this.snapLine);

    // Click glow (crosshair shape burst)
    this.crosshairGlow = new PIXI.Graphics();
    
    // Outer thick glow
    this.crosshairGlow.setStrokeStyle({ width: 8, color: 0x00ffff, alpha: 0.3 });
    this.crosshairGlow.moveTo(-16, 0).lineTo(16, 0).stroke();
    this.crosshairGlow.moveTo(0, -16).lineTo(0, 16).stroke();
    
    // Inner bright glow
    this.crosshairGlow.setStrokeStyle({ width: 4, color: 0x88ffff, alpha: 0.5 });
    this.crosshairGlow.moveTo(-16, 0).lineTo(16, 0).stroke();
    this.crosshairGlow.moveTo(0, -16).lineTo(0, 16).stroke();
    
    this.crosshairGlow.alpha = 0;
    this.uiLayer.addChild(this.crosshairGlow);
  }

  private drawCrosshair(g: PIXI.Graphics) {
    g.setStrokeStyle({ width: 2, color: 0x00ffff, alpha: 0.9 });
    // Horizontal line
    g.moveTo(-12, 0).lineTo(-4, 0).stroke();
    g.moveTo(4, 0).lineTo(12, 0).stroke();
    // Vertical line
    g.moveTo(0, -12).lineTo(0, -4).stroke();
    g.setStrokeStyle({ width: 3, color: 0x00ffff, alpha: 0.9 });
    g.moveTo(-20, 0).lineTo(-8, 0).stroke();
    g.moveTo(8, 0).lineTo(20, 0).stroke();
    g.moveTo(0, -20).lineTo(0, -8).stroke();
    g.moveTo(0, 8).lineTo(0, 20).stroke();
    g.circle(0, 0, 2).fill({ color: 0x00ffff, alpha: 0.8 });
  }

  private drawSnapCrosshair(g: PIXI.Graphics) {
    g.setStrokeStyle({ width: 3, color: 0x00ffff, alpha: 1.0 });
    g.moveTo(0, -24).lineTo(24, 0).lineTo(0, 24).lineTo(-24, 0).closePath().stroke();
    g.setStrokeStyle({ width: 2, color: 0x00ffff, alpha: 0.6 });
    g.moveTo(0, -14).lineTo(14, 0).lineTo(0, 14).lineTo(-14, 0).closePath().stroke();
    g.circle(0, 0, 4).fill({ color: 0x00ffff, alpha: 1.0 });
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
    this.world.createCollider(this.rapier.ColliderDesc.cuboid(5, 1000).setCollisionGroups(0x00010003), this.world.createRigidBody(this.rapier.RigidBodyDesc.fixed().setTranslation(-200, -500)));
    const w1Mask = new PIXI.Graphics();
    w1Mask.rect(-5 * 40, -1000 * 40, 10 * 40, 2000 * 40).fill(0xffffff);
    w1Mask.position.set(-200 * 40, 500 * 40); // Y is flipped visually
    this.levelMaskContainer.addChild(w1Mask);

    this.world.createCollider(this.rapier.ColliderDesc.cuboid(5, 1000).setCollisionGroups(0x00010003), this.world.createRigidBody(this.rapier.RigidBodyDesc.fixed().setTranslation(4800, -500)));
    const w2Mask = new PIXI.Graphics();
    w2Mask.rect(-5 * 40, -1000 * 40, 10 * 40, 2000 * 40).fill(0xffffff);
    w2Mask.position.set(4800 * 40, 500 * 40);
    this.levelMaskContainer.addChild(w2Mask);

    // Ceiling
    this.world.createCollider(this.rapier.ColliderDesc.cuboid(5000, 5).setCollisionGroups(0x00010003), this.world.createRigidBody(this.rapier.RigidBodyDesc.fixed().setTranslation(0, 60)));

    // Low ceiling obstacle
    this.world.createCollider(this.rapier.ColliderDesc.cuboid(15, 2).setCollisionGroups(0x00010003), this.world.createRigidBody(this.rapier.RigidBodyDesc.fixed().setTranslation(40, 10)));
    const lowCeilMesh = new PIXI.Graphics();
    lowCeilMesh.rect((40 - 15) * 40, (-10 - 2) * 40, 30 * 40, 4 * 40).fill(0x3a3a3a);
    this.gameplayLayer.addChild(lowCeilMesh);

    const cMask = new PIXI.Graphics();
    cMask.rect(-5000 * 40, -5 * 40, 10000 * 40, 10 * 40).fill(0xffffff);
    cMask.position.set(0, -60 * 40);
    this.levelMaskContainer.addChild(cMask);

    // === TEST OBJECTS (temporary) ===
    const addBlock = (x: number, y: number, hw: number, hh: number, color: number) => {
      const body = this.world.createRigidBody(this.rapier.RigidBodyDesc.fixed().setTranslation(x, y));
      this.world.createCollider(this.rapier.ColliderDesc.cuboid(hw, hh).setCollisionGroups(0x0001000b), body);
      const vis = new PIXI.Graphics();
      vis.rect(-hw * 40, -hh * 40, hw * 2 * 40, hh * 2 * 40).fill(color);
      vis.position.set(x * 40, -y * 40);
      this.gameplayLayer.addChild(vis);
      const mask = new PIXI.Graphics();
      mask.rect(-hw * 40, -hh * 40, hw * 2 * 40, hh * 2 * 40).fill(0xffffff);
      mask.position.set(x * 40, -y * 40);
      this.levelMaskContainer.addChild(mask);
    };

    // Small platforms at varying heights
    addBlock(15, -7, 3, 0.5, 0x886644);   // Low platform near spawn
    addBlock(30, -3, 2.5, 0.5, 0x886644); // Mid platform
    addBlock(45, 2, 2, 0.5, 0x886644);    // Higher platform
    addBlock(60, 8, 3, 0.5, 0x886644);    // High platform

    // Tall pillar
    addBlock(25, -5, 1, 5, 0x666666);

    // Floating blocks for grappling
    addBlock(50, 15, 2, 1, 0x555577);
    addBlock(70, 20, 2, 1, 0x555577);
    addBlock(90, 25, 2, 1, 0x555577);
    addBlock(110, 30, 3, 1, 0x555577);

    // Step formation
    addBlock(130, -8, 2, 1, 0x775544);
    addBlock(136, -4, 2, 1, 0x775544);
    addBlock(142, 0, 2, 1, 0x775544);
    addBlock(148, 4, 2, 1, 0x775544);

    // Giant ceiling slab (for hanging and swinging)
    addBlock(80, 40, 40, 2, 0x444466);

    // Another giant ceiling further out
    addBlock(200, 35, 50, 2, 0x444466);

    // Narrow vertical walls to swing around
    addBlock(160, 10, 0.5, 8, 0x666644);
    addBlock(180, 10, 0.5, 8, 0x666644);
  }

  private animate(deltaMS: number) {
    const deltaTime = Math.min(deltaMS / 1000, 0.1);

    this.robotArm.update(this.mousePos, this.isMouseDown, this.isRightClickDown, this.isShiftDown);
    this.isRightClickDown = false; // Consume right click as a single event
    this.world.step();
    
    this.levelManager.update(deltaTime);
    
    // Update lighting system
    const sunWorldPos = new Vec2(this.cameraPos.x, this.cameraPos.y + 7.5);
    this.lightingSystem.update(sunWorldPos);

    // Position the visual sun exactly at the raycast origin (in pixel coordinates)
    this.sunVisual.position.set(sunWorldPos.x * 40, -sunWorldPos.y * 40);

    const targetCamX = this.robotArm.clawPos.x;
    const targetCamY = this.robotArm.clawPos.y; 
    this.cameraPos.x += (targetCamX - this.cameraPos.x) * 5 * deltaTime;
    this.cameraPos.y += (targetCamY - this.cameraPos.y) * 5 * deltaTime;
    
    this.currentZoom += (this.targetZoom - this.currentZoom) * 0.1;
    const zoom = this.currentZoom;
    const ppm = 40;
    const stageScale = 0.5;
    const cx = (window.innerWidth / 2) / stageScale;
    const cy = (window.innerHeight / 2) / stageScale;

    const layers = [
      this.gameplayLayer, this.clawLayer, this.shadowLayer, 
      this.lightLayer, this.silhouetteLayer, this.levelMaskContainer,
      this.sunLayer
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

    // === Crosshair ===
    const stageScaleUI = 0.5;
    this.crosshair.position.set(this.rawMouseX / stageScaleUI, this.rawMouseY / stageScaleUI);
    this.crosshairGlow.position.set(this.rawMouseX / stageScaleUI, this.rawMouseY / stageScaleUI);
    this.crosshair.visible = true; // Always visible

    // Predict snap target using RobotArm
    const snapTarget = this.robotArm.getSnapTarget(this.mousePos);
    this.snapLine.clear();
    
    if (snapTarget) {
      this.crosshairSnap.visible = true;
      const uiX = cx + (snapTarget.point.x * ppm - this.cameraPos.x * ppm) * zoom;
      const uiY = cy + (-snapTarget.point.y * ppm - (-this.cameraPos.y * ppm)) * zoom;
      this.crosshairSnap.position.set(uiX, uiY);
      
      const clawUiX = cx + (this.robotArm.clawPos.x * ppm - this.cameraPos.x * ppm) * zoom;
      const clawUiY = cy + (-this.robotArm.clawPos.y * ppm - (-this.cameraPos.y * ppm)) * zoom;
      
      this.snapLine.setStrokeStyle({ width: 1.5, color: 0x00ffff, alpha: 0.35 });
      this.snapLine.moveTo(clawUiX, clawUiY);
      this.snapLine.lineTo(uiX, uiY);
      this.snapLine.stroke();
    } else {
      this.crosshairSnap.visible = false;
    }

    // Click glow effect
    if (this.isMouseDown || this.isRightClickDown) {
      this.glowIntensity = 1.0;
    }
    this.glowIntensity = Math.max(0, this.glowIntensity - deltaTime * 5);
    this.crosshairGlow.alpha = this.glowIntensity;
    this.crosshairGlow.scale.set(1 + this.glowIntensity * 0.5);

    // === Snap ghost afterimages (sandevistan style) ===
    if (this.robotArm.didSnap && this.robotArm.snapGhosts.length > 0) {
      const ghosts = this.robotArm.snapGhosts;
      for (let g = 0; g < ghosts.length; g++) {
        const pose = ghosts[g];
        const ghost = new PIXI.Container();
        const gfx = new PIXI.Graphics();

        // Body circle
        gfx.circle(pose.bodyPos.x * ppm, -pose.bodyPos.y * ppm, 0.8 * ppm).fill(0x00ffff);

        // Arm segments
        for (let i = 0; i < 3; i++) {
          const s = pose.joints[i];
          const e = pose.joints[i + 1];
          const sx = s.x * ppm, sy = -s.y * ppm;
          const ex = e.x * ppm, ey = -e.y * ppm;
          gfx.setStrokeStyle({ width: 0.5 * ppm, color: 0x00ffff });
          gfx.moveTo(sx, sy).lineTo(ex, ey).stroke();

          // Joint circles (between segments)
          if (i < 2) {
            gfx.circle(ex, ey, 0.4 * ppm).fill(0x00ffff);
          }
        }

        // Claw
        gfx.circle(pose.clawPos.x * ppm, -pose.clawPos.y * ppm, 0.6 * ppm).fill(0x00ffff);

        ghost.addChild(gfx);
        
        const alphaFilter = new PIXI.AlphaFilter({ alpha: 0.15 });
        ghost.filters = [
          new GlowFilter({ distance: 10, outerStrength: 1.5, innerStrength: 0, color: 0x00ffff, quality: 0.2 }),
          alphaFilter
        ];
        
        this.gameplayLayer.addChild(ghost);
        // Stagger the appearance:        // Add to persistent list for slow fade out
        this.snapGhosts.push({ container: ghost, filter: alphaFilter, alpha: 0.15, delay: g * 0.06 });
      }
    }

    // Fade and remove old ghosts (FIFO: earlier ones fade first)
    for (let i = this.snapGhosts.length - 1; i >= 0; i--) {
      const g = this.snapGhosts[i] as any;
      if (g.delay > 0) {
        g.delay -= deltaTime;
        continue;
      }
      g.alpha -= deltaTime * 0.1; // Smoothly fade out over 1.5s
      g.filter.alpha = Math.max(0, g.alpha);
      if (g.alpha <= 0) {
        g.container.destroy();
        this.snapGhosts.splice(i, 1);
      }
    }
  }
}

import('@dimforge/rapier2d').then(RAPIER => {
  new Game(RAPIER);
});
