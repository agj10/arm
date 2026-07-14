import * as PIXI from 'pixi.js';
import * as RAPIER from '@dimforge/rapier2d';
import { Vec2 } from './Vec2';

export class LightingSystem {
  private world: RAPIER.World;
  private rapier: typeof RAPIER;
  
  public lightContainer: PIXI.Container;
  private lightGraphics: PIXI.Graphics;

  private rayCount: number = 720; // Maximum resolution for perfectly smooth edges
  private maxDistance: number = 100; // In rapier units (meters)
  private samples: number = 8; // Very smooth gradient stepping
  private lightRadius: number = 0.3; // Small radius for sharp contact shadows

  constructor(world: RAPIER.World, rapierModule: typeof RAPIER) {
    this.world = world;
    this.rapier = rapierModule;

    this.lightContainer = new PIXI.Container();
    // Force container to render offscreen and apply a soft blur for smooth shadows
    this.lightContainer.filters = [
      new PIXI.BlurFilter(8)
    ];
    this.lightContainer.blendMode = 'add';
    
    this.lightGraphics = new PIXI.Graphics();
    this.lightGraphics.blendMode = 'normal'; // Drawn normally into the offscreen buffer

    this.lightContainer.addChild(this.lightGraphics);
  }

  public update(lightPos: Vec2) {
    this.lightGraphics.clear();
    
    // Warm sunset orange, bright center
    const color = 0xffa050; 
    const alpha = 0.08; // 8 samples * 0.08 = 0.64 total alpha

    for (let s = 0; s < this.samples; s++) {
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

      this.lightGraphics.poly(points).fill({ color: color, alpha: alpha });
    }
  }
}
