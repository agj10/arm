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
    this.lightContainer.blendMode = 'add';

    // Create a radial gradient for the light source
    const canvas = document.createElement('canvas');
    canvas.width = 1024; canvas.height = 1024;
    const ctx = canvas.getContext('2d')!;
    const grd = ctx.createRadialGradient(512, 512, 0, 512, 512, 512);
    // Smooth warm orange glow
    grd.addColorStop(0, 'rgba(255, 200, 100, 1.0)');
    grd.addColorStop(0.5, 'rgba(255, 170, 80, 0.5)');
    grd.addColorStop(1, 'rgba(255, 170, 80, 0)');
    ctx.fillStyle = grd;
    ctx.fillRect(0, 0, 1024, 1024);
    
    this.lightSprite = new PIXI.Sprite(PIXI.Texture.from(canvas));
    this.lightSprite.anchor.set(0.5);
    this.lightSprite.scale.set(4.0); // Make it large enough
    
    this.visibilityMask = new PIXI.Graphics();
    
    // Apply BlurFilter to the mask to create shader-based soft shadows!
    const blurFilter = new PIXI.BlurFilter({ strength: 16, quality: 4 });
    this.visibilityMask.filters = [blurFilter];
    
    // Use the blurred graphics as an alpha mask for the light sprite
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
    
    const filter = this.rapier.QueryFilterFlags.EXCLUDE_SENSORS;
    const points: {x: number, y: number}[] = [];
    
    // Cast rays in 360 degrees
    for (let i = 0; i < this.rayCount; i++) {
      const angle = (i / this.rayCount) * Math.PI * 2;
      const dir = { x: Math.cos(angle), y: Math.sin(angle) };
      
      const originX = lightPos.x;
      const originY = lightPos.y;

      const ray = new this.rapier.Ray(
        { x: originX, y: originY },
        dir
      );

      const hit = this.world.castRay(ray, this.maxDistance, false, filter);
      
      let hitX, hitY;
      if (hit) {
        hitX = originX + dir.x * hit.timeOfImpact;
        hitY = originY + dir.y * hit.timeOfImpact;
      } else {
        hitX = originX + dir.x * this.maxDistance;
        hitY = originY + dir.y * this.maxDistance;
      }
      
      points.push({ x: hitX * 40, y: -hitY * 40 });
    }

    // Draw visibility polygon and fill with white (the BlurFilter will soften its edges)
    this.visibilityMask.poly(points).fill(0xffffff);
  }
}
