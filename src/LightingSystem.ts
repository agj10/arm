import * as PIXI from 'pixi.js';
import * as RAPIER from '@dimforge/rapier2d';
import { Vec2 } from './Vec2';

export class LightingSystem {
  private world: RAPIER.World;
  private rapier: typeof RAPIER;
  
  public lightContainer: PIXI.Container;
  private lightGraphics: PIXI.Graphics;
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
    canvas.width = 512;
    canvas.height = 512;
    const ctx = canvas.getContext('2d')!;
    const grd = ctx.createRadialGradient(256, 256, 0, 256, 256, 256);
    // Use full alpha here, we'll reduce alpha when drawing the polygon
    grd.addColorStop(0, "rgba(255, 160, 80, 1.0)"); 
    grd.addColorStop(1, "rgba(255, 160, 80, 0.0)"); 
    ctx.fillStyle = grd;
    ctx.fillRect(0, 0, 512, 512);
    
    this.lightTexture = PIXI.Texture.from(canvas);
    this.lightGraphics = new PIXI.Graphics();
    
    this.lightContainer.addChild(this.lightGraphics); 
  }

  public update(lightPos: Vec2) {
    const samples = 12;
    const lightRadius = 0.15;
    // Total desired alpha at center is ~0.35. We divide by samples.
    const alpha = 0.35 / samples; 

    this.lightGraphics.clear();

    // Cast multiple offset rays to create soft penumbra shadows that fade with distance
    for (let s = 0; s < samples; s++) {
      const sampleAngle = (s / samples) * Math.PI * 2;
      const offsetX = Math.cos(sampleAngle) * lightRadius;
      const offsetY = Math.sin(sampleAngle) * lightRadius;
      const originX = lightPos.x + offsetX;
      const originY = lightPos.y + offsetY;

      const points: number[] = [];
      
      for (let i = 0; i < this.rayCount; i++) {
        const angle = (i / this.rayCount) * Math.PI * 2;
        const dir = { x: Math.cos(angle), y: Math.sin(angle) };
        const ray = new this.rapier.Ray({ x: originX, y: originY }, dir);
        
        // EXCLUDE_DYNAMIC so the player doesn't cast a shadow
        const hit = this.world.castRay(ray, this.maxDistance, false, this.rapier.QueryFilterFlags.EXCLUDE_DYNAMIC);
        
        if (hit) {
          const hitPoint = new Vec2(
            ray.origin.x + ray.dir.x * hit.toi,
            ray.origin.y + ray.dir.y * hit.toi
          );
          points.push(hitPoint.x * 40, -hitPoint.y * 40);
        } else {
          points.push(
            (ray.origin.x + ray.dir.x * this.maxDistance) * 40,
            -(ray.origin.y + ray.dir.y * this.maxDistance) * 40
          );
        }
      }
      
      const matrix = new PIXI.Matrix();
      matrix.translate(-256, -256); // Center the 512x512 texture
      matrix.scale(3000 / 512, 3000 / 512); // Scale to 3000x3000
      matrix.translate(originX * 40, -originY * 40); // Move to the ray origin
      
      this.lightGraphics.poly(points).fill({ 
        texture: this.lightTexture,
        matrix: matrix,
        alpha: alpha
      });
    }
  }
}
