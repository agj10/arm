import * as PIXI from 'pixi.js';
import * as RAPIER from '@dimforge/rapier2d';
import { Vec2 } from './Vec2';

export class LightingSystem {
  private world: RAPIER.World;
  private rapier: typeof RAPIER;
  
  public lightContainer: PIXI.Container;
  private lightGraphicsList: PIXI.Graphics[] = [];

  private rayCount: number = 720; 
  private maxDistance: number = 100;

  constructor(world: RAPIER.World, rapierModule: typeof RAPIER) {
    this.world = world;
    this.rapier = rapierModule;

    this.lightContainer = new PIXI.Container();
    this.lightContainer.blendMode = 'add';
    
    // Use an array of Graphics objects to correctly additively blend without path accumulation
    for (let i = 0; i < 8; i++) {
      const g = new PIXI.Graphics();
      this.lightGraphicsList.push(g);
      this.lightContainer.addChild(g);
    }
  }

  public update(lightPos: Vec2) {
    const samples = 8;
    const lightRadius = 0.3; // Creates soft penumbra that blur over distance
    
    for (let s = 0; s < samples; s++) {
      const g = this.lightGraphicsList[s];
      g.clear();

      const sampleAngle = (s / samples) * Math.PI * 2;
      const offsetX = Math.cos(sampleAngle) * lightRadius;
      const offsetY = Math.sin(sampleAngle) * lightRadius;

      const originX = lightPos.x + offsetX;
      const originY = lightPos.y + offsetY;

      const points: {x: number, y: number}[] = [];

      for (let i = 0; i < this.rayCount; i++) {
        const angle = (i / this.rayCount) * Math.PI * 2;
        const dir = { x: Math.cos(angle), y: Math.sin(angle) };
        const ray = new this.rapier.Ray({ x: originX, y: originY }, dir);
        
        // Exclude Dynamic/Kinematic so the robot doesn't cast shadows on itself!
        const filter = this.rapier.QueryFilterFlags.EXCLUDE_DYNAMIC | this.rapier.QueryFilterFlags.EXCLUDE_KINEMATIC;
        const hit = this.world.castRay(ray, this.maxDistance, false, filter);

        let hitX, hitY;
        if (hit && !isNaN((hit as any).toi)) {
          const toi = (hit as any).toi;
          hitX = originX + dir.x * toi;
          hitY = originY + dir.y * toi;
        } else {
          hitX = originX + dir.x * this.maxDistance;
          hitY = originY + dir.y * this.maxDistance;
        }

        points.push({ x: hitX * 40, y: -hitY * 40 });
      }

      // Draw the polygon natively filled with a solid color and low alpha for soft blending
      g.poly(points).fill({ color: 0xffa050, alpha: 0.08 });
    }
  }
}
