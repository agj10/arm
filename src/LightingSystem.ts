import * as PIXI from 'pixi.js';
import * as RAPIER from '@dimforge/rapier2d';
import { Vec2 } from './Vec2';

export class LightingSystem {
  private world: RAPIER.World;
  private rapier: typeof RAPIER;
  
  public lightContainer: PIXI.Container;
  private lightGraphics: PIXI.Graphics;

  private rayCount: number = 360; // High resolution for smooth surfaces
  private maxDistance: number = 100; // In rapier units (meters)

  constructor(world: RAPIER.World, rapierModule: typeof RAPIER) {
    this.world = world;
    this.rapier = rapierModule;

    this.lightContainer = new PIXI.Container();
    this.lightContainer.blendMode = 'add';
    
    this.lightGraphics = new PIXI.Graphics();
    
    // Apply a high-quality blur filter to create smooth, soft shadows without banding
    const blurFilter = new PIXI.BlurFilter({ strength: 16, quality: 4 });
    this.lightGraphics.filters = [blurFilter];

    this.lightContainer.addChild(this.lightGraphics);
  }

  public update(lightPos: Vec2) {
    this.lightGraphics.clear();
    
    // Very subtle, moody sunset orange light
    const color = 0xff6622; 
    const alpha = 0.35; // Greatly reduced to prevent blinding whiteout

    const points: {x: number, y: number}[] = [];

    for (let i = 0; i < this.rayCount; i++) {
      const angle = (i / this.rayCount) * Math.PI * 2;
      const dir = { x: Math.cos(angle), y: Math.sin(angle) };

      const ray = new this.rapier.Ray(
        { x: lightPos.x, y: lightPos.y },
        dir
      );

      // Exclude dynamic bodies (2)
      const hit = this.world.castRay(ray, this.maxDistance, true, 2 as any);
      
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

    this.lightGraphics.poly(points).fill({ color: color, alpha: alpha });
  }
}
