import * as PIXI from 'pixi.js';
import * as RAPIER from '@dimforge/rapier2d';
import { Vec2 } from './Vec2';

export class LightingSystem {
  private world: RAPIER.World;
  private rapier: typeof RAPIER;
  
  public lightContainer: PIXI.Container;
  private lightGraphicsList: PIXI.Graphics[] = [];
  private lightTexture: PIXI.Texture;

  private rayCount: number = 720; 
  private maxDistance: number = 100;

  constructor(world: RAPIER.World, rapierModule: typeof RAPIER) {
    this.world = world;
    this.rapier = rapierModule;

    this.lightContainer = new PIXI.Container();
    this.lightContainer.blendMode = 'add';
    
    // Create a smooth radial gradient texture
    const canvas = document.createElement('canvas');
    canvas.width = 2048;
    canvas.height = 2048;
    const ctx = canvas.getContext('2d')!;
    const grd = ctx.createRadialGradient(1024, 1024, 0, 1024, 1024, 1024);
    grd.addColorStop(0, "rgba(255, 160, 80, 0.15)"); // Low alpha because we layer 8 samples
    grd.addColorStop(1, "rgba(255, 160, 80, 0.0)");
    ctx.fillStyle = grd;
    ctx.fillRect(0, 0, 2048, 2048);
    
    this.lightTexture = PIXI.Texture.from(canvas);
    
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
    
    const matrix = new PIXI.Matrix();
    matrix.translate(lightPos.x * 40 - 1024, -lightPos.y * 40 - 1024);

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

      // Draw the polygon natively filled with the gradient texture
      g.poly(points).fill({ texture: this.lightTexture, matrix: matrix });
    }
  }
}
