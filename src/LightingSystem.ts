import * as PIXI from 'pixi.js';
import * as RAPIER from '@dimforge/rapier2d';
import { Vec2 } from './Vec2';

export class LightingSystem {
  private world: RAPIER.World;
  private rapier: typeof RAPIER;
  
  public lightContainer: PIXI.Container;
  private lightGraphics: PIXI.Graphics;
  private gradientTexture: PIXI.Texture;

  private rayCount: number = 720; 
  private maxDistance: number = 100;

  constructor(world: RAPIER.World, rapierModule: typeof RAPIER) {
    this.world = world;
    this.rapier = rapierModule;

    this.lightContainer = new PIXI.Container();
    this.lightContainer.blendMode = 'add';
    
    // Create a smooth radial gradient texture for light falloff (attenuation)
    const canvas = document.createElement('canvas');
    canvas.width = 1024;
    canvas.height = 1024;
    const ctx = canvas.getContext('2d')!;
    const grd = ctx.createRadialGradient(512, 512, 0, 512, 512, 512);
    grd.addColorStop(0, "rgba(255, 160, 80, 1.0)"); // Warm orange core
    grd.addColorStop(1, "rgba(255, 160, 80, 0.0)"); // Fades out completely at 512px
    ctx.fillStyle = grd;
    ctx.fillRect(0, 0, 1024, 1024);
    this.gradientTexture = PIXI.Texture.from(canvas);

    this.lightGraphics = new PIXI.Graphics();
    this.lightContainer.addChild(this.lightGraphics);
  }

  public update(lightPos: Vec2) {
    this.lightGraphics.clear();
    
    const color = 0xffa050; 
    const alpha = 0.04; 
    const samples = 8;
    // Tiny radius eliminates circular artifact at start, but still creates blur over distance
    const lightRadius = 0.05; 

    for (let s = 0; s < samples; s++) {
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
        
        // Exclude Dynamic objects so the RobotArm doesn't cast shadows on itself and mask out the light!
        const hit = this.world.castRay(ray, this.maxDistance, false, this.rapier.QueryFilterFlags.EXCLUDE_DYNAMIC);

        let hitX, hitY;
        if (hit) {
          const toi = (hit as any).toi ?? (hit as any).timeOfImpact ?? this.maxDistance;
          hitX = originX + dir.x * toi;
          hitY = originY + dir.y * toi;
        } else {
          hitX = originX + dir.x * this.maxDistance;
          hitY = originY + dir.y * this.maxDistance;
        }

        points.push({ x: hitX * 40, y: -hitY * 40 });
      }

      // Use the radial gradient texture to provide natural light falloff
      const matrix = new PIXI.Matrix();
      matrix.translate(originX * 40 - 512, -originY * 40 - 512);
      this.lightGraphics.poly(points).fill({ 
        texture: this.gradientTexture, 
        alpha: 0.12, 
        matrix: matrix 
      });
    }
  }
}
