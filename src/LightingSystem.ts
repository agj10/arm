import * as PIXI from 'pixi.js';
import * as RAPIER from '@dimforge/rapier2d';
import { Vec2 } from './Vec2';

export class LightingSystem {
  private world: RAPIER.World;
  private rapier: typeof RAPIER;
  
  public lightContainer: PIXI.Container;
  private lightGraphics: PIXI.Graphics;

  private rayCount: number = 180; // 180 rays per sample for performance
  private samples: number = 8; // 8 area light samples for soft shadows
  private lightRadius: number = 2.0; // The physical size of the light source (causes penumbra)
  private maxDistance: number = 80; // In rapier units (meters)

  constructor(world: RAPIER.World, rapierModule: typeof RAPIER) {
    this.world = world;
    this.rapier = rapierModule;

    this.lightContainer = new PIXI.Container();
    this.lightContainer.blendMode = 'add';
    
    // Instead of a sprite, we will draw multiple overlapping polygons directly
    this.lightGraphics = new PIXI.Graphics();
    // Additive blending for the graphics to accumulate alpha
    this.lightGraphics.blendMode = 'add';
    this.lightContainer.addChild(this.lightGraphics);
  }

  public update(lightPos: Vec2) {
    this.lightGraphics.clear();
    
    // Sunset orange color, very low alpha per sample so they accumulate softly
    const color = 0xffa050; 
    const alpha = 1.0 / this.samples; 

    // We sample the light from a circle (Area Light)
    for (let s = 0; s < this.samples; s++) {
      // Golden ratio sampling or simple circle distribution
      const sampleAngle = (s / this.samples) * Math.PI * 2;
      const offsetX = Math.cos(sampleAngle) * this.lightRadius;
      const offsetY = Math.sin(sampleAngle) * this.lightRadius;
      
      const originX = lightPos.x + offsetX;
      const originY = lightPos.y + offsetY;

      const points: {x: number, y: number}[] = [];

      for (let i = 0; i < this.rayCount; i++) {
        const angle = (i / this.rayCount) * Math.PI * 2;
        const dir = { x: Math.cos(angle), y: Math.sin(angle) };

        const ray = new this.rapier.Ray(
          { x: originX, y: originY },
          dir
        );

        // Exclude dynamic bodies (2)
        const hit = this.world.castRay(ray, this.maxDistance, true, 2 as any);
        
        let hitX, hitY;
        if (hit) {
          const toi = (hit as any).toi ?? (hit as any).timeOfImpact ?? (hit as any).time_of_impact ?? this.maxDistance;
          hitX = originX + dir.x * toi;
          hitY = originY + dir.y * toi;
        } else {
          hitX = originX + dir.x * this.maxDistance;
          hitY = originY + dir.y * this.maxDistance;
        }
        
        // Convert to Pixi coordinates
        points.push({ x: hitX * 40, y: -hitY * 40 });
      }

      this.lightGraphics.poly(points).fill({ color: color, alpha: alpha });
    }
  }
}
