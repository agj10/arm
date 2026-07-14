import * as PIXI from 'pixi.js';
import * as RAPIER from '@dimforge/rapier2d';
import { Vec2 } from './Vec2';

export class LightingSystem {
  private world: RAPIER.World;
  private rapier: typeof RAPIER;
  
  public lightContainer: PIXI.Container;
  private lightGraphics: PIXI.Graphics;
  private lightSprite: PIXI.Sprite;

  private rayCount: number = 720; 
  private maxDistance: number = 100;

  constructor(world: RAPIER.World, rapierModule: typeof RAPIER) {
    this.world = world;
    this.rapier = rapierModule;

    this.lightContainer = new PIXI.Container();
    this.lightContainer.blendMode = 'add';
    
    // Create a smooth radial gradient texture
    const canvas = document.createElement('canvas');
    canvas.width = 512;
    canvas.height = 512;
    const ctx = canvas.getContext('2d')!;
    const grd = ctx.createRadialGradient(256, 256, 0, 256, 256, 256);
    grd.addColorStop(0, "rgba(255, 160, 80, 0.8)"); // Warm orange, bright center
    grd.addColorStop(1, "rgba(255, 160, 80, 0.0)"); // Fades out
    ctx.fillStyle = grd;
    ctx.fillRect(0, 0, 512, 512);
    
    const texture = PIXI.Texture.from(canvas);
    this.lightSprite = new PIXI.Sprite(texture);
    this.lightSprite.anchor.set(0.5);
    // Make the sprite large so it fades out smoothly across the screen
    this.lightSprite.width = 3000;
    this.lightSprite.height = 3000;
    
    this.lightGraphics = new PIXI.Graphics();
    
    // The polygon acts as a sharp mask, but the light itself is a soft radial gradient!
    this.lightSprite.mask = this.lightGraphics;

    this.lightContainer.addChild(this.lightGraphics); 
    this.lightContainer.addChild(this.lightSprite);
  }

  public update(lightPos: Vec2) {
    this.lightGraphics.clear();
    
    const originX = lightPos.x;
    const originY = lightPos.y;

      const points: {x: number, y: number}[] = [];

      for (let i = 0; i < this.rayCount; i++) {
        const angle = (i / this.rayCount) * Math.PI * 2;
        const dir = { x: Math.cos(angle), y: Math.sin(angle) };

        const ray = new this.rapier.Ray(
          { x: originX, y: originY },
          dir
        );

        // Cast ray against ALL objects including player (so arm casts shadow!)
        // solid = false: rays originating inside a collider ignore it and escape!
        const hit = this.world.castRay(ray, this.maxDistance, false);
        
        let hitX, hitY;
        if (hit) {
          const toi = (hit as any).toi ?? (hit as any).timeOfImpact ?? (hit as any).time_of_impact ?? this.maxDistance;
          hitX = originX + dir.x * toi;
          hitY = originY + dir.y * toi;
        } else {
          hitX = originX + dir.x * this.maxDistance;
          hitY = originY + dir.y * this.maxDistance;
        }
        
        points.push({ x: hitX * 40, y: -hitY * 40 });
      }

      this.lightGraphics.poly(points).fill(0xffffff); // White color for masking
      
      // Move the radial gradient to the light origin
      this.lightSprite.position.set(originX * 40, -originY * 40);
  }
}
