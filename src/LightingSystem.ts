import * as PIXI from 'pixi.js';
import * as RAPIER from '@dimforge/rapier2d';
import { Vec2 } from './Vec2';

export class LightingSystem {
  private world: RAPIER.World;
  private rapier: typeof RAPIER;
  
  public lightContainer: PIXI.Container;
  private lightSprite: PIXI.Sprite;
  private visibilityMask: PIXI.Graphics;

  private rayCount: number = 360;
  private maxDistance: number = 50; // In rapier units (meters)

  constructor(world: RAPIER.World, rapierModule: typeof RAPIER) {
    this.world = world;
    this.rapier = rapierModule;

    this.lightContainer = new PIXI.Container();

    // Create a radial gradient for the light source
    const canvas = document.createElement('canvas');
    canvas.width = 512; canvas.height = 512;
    const ctx = canvas.getContext('2d')!;
    const grd = ctx.createRadialGradient(256, 256, 0, 256, 256, 256);
    grd.addColorStop(0, 'rgba(255, 255, 255, 1)');
    grd.addColorStop(0.5, 'rgba(255, 255, 255, 0.5)');
    grd.addColorStop(1, 'rgba(255, 255, 255, 0)');
    ctx.fillStyle = grd;
    ctx.fillRect(0, 0, 512, 512);
    
    this.lightSprite = new PIXI.Sprite(PIXI.Texture.from(canvas));
    this.lightSprite.anchor.set(0.5);
    this.lightSprite.scale.set(6.0);
    this.lightSprite.tint = 0xffeebb;
    this.lightSprite.blendMode = 'add';
    
    this.visibilityMask = new PIXI.Graphics();
    
    // Apply mask to light
    this.lightSprite.mask = this.visibilityMask;

    this.lightContainer.addChild(this.lightSprite);
    this.lightContainer.addChild(this.visibilityMask);
  }

  public update(lightPos: Vec2) {
    // Pixi positions
    const pixiX = lightPos.x * 40;
    const pixiY = -lightPos.y * 40;

    this.lightSprite.position.set(pixiX, pixiY);
    
    this.visibilityMask.clear();
    
    // Cast rays in 360 degrees
    const points: {x: number, y: number}[] = [];
    
    for (let i = 0; i < this.rayCount; i++) {
      const angle = (i / this.rayCount) * Math.PI * 2;
      const dir = { x: Math.cos(angle), y: Math.sin(angle) };
      
      const ray = new this.rapier.Ray(
        { x: lightPos.x, y: lightPos.y },
        dir
      );

      // Cast ray against everything
      const hit = this.world.castRay(ray, this.maxDistance, true);
      
      let hitX, hitY;
      if (hit) {
        const toi = (hit as any).toi ?? (hit as any).timeOfImpact ?? (hit as any).time_of_impact ?? this.maxDistance;
        hitX = lightPos.x + dir.x * toi;
        hitY = lightPos.y + dir.y * toi;
      } else {
        hitX = lightPos.x + dir.x * this.maxDistance;
        hitY = lightPos.y + dir.y * this.maxDistance;
      }
      
      // Convert to Pixi coordinates
      points.push({ x: hitX * 40, y: -hitY * 40 });
    }

    // Draw visibility polygon
    this.visibilityMask.poly(points).fill(0xffffff);
  }
}
