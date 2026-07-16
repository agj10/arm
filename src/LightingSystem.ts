import * as PIXI from 'pixi.js';
import * as RAPIER from '@dimforge/rapier2d';
import { Vec2 } from './Vec2';

export class LightingSystem {
  private world: RAPIER.World;
  private rapier: typeof RAPIER;
  
  public lightContainer: PIXI.Container;
  private lightMeshes: PIXI.Mesh[] = [];
  private lightGeometries: PIXI.Geometry[] = [];
  public lightTexture: PIXI.Texture;
  public sunTexture: PIXI.Texture;

  private rayCount: number = 360; // 360 is plenty for smooth shadows
  private maxDistance: number = 80; // 80m = 3200px, enough to cover entire screen even when zoomed out

  constructor(world: RAPIER.World, rapierModule: typeof RAPIER) {
    this.world = world;
    this.rapier = rapierModule;

    this.lightContainer = new PIXI.Container();
    this.lightContainer.blendMode = 'add';
    
    const size = 4096;
    
    // Texture 1: Volumetric Rays (Soft, dim, additive)
    const canvas1 = document.createElement('canvas');
    canvas1.width = size;
    canvas1.height = size;
    const ctx1 = canvas1.getContext('2d')!;
    const grd1 = ctx1.createRadialGradient(size/2, size/2, 0, size/2, size/2, size/2);
    grd1.addColorStop(0, "rgba(255, 200, 100, 0.12)");   // Brighter core so shadows are deeply visible when blocked
    grd1.addColorStop(0.3, "rgba(255, 130, 60, 0.06)");  // More distinct spread
    grd1.addColorStop(1, "rgba(80, 30, 20, 0.0)");       // Fade out smoothly
    ctx1.fillStyle = grd1;
    ctx1.fillRect(0, 0, size, size);
    this.lightTexture = PIXI.Texture.from(canvas1);

    // Texture 2: Visual Sun (Solid, bright, persistent)
    const canvas2 = document.createElement('canvas');
    canvas2.width = size;
    canvas2.height = size;
    const ctx2 = canvas2.getContext('2d')!;
    const grd2 = ctx2.createRadialGradient(size/2, size/2, 0, size/2, size/2, size/2);
    grd2.addColorStop(0, "rgba(255, 255, 255, 1.0)");      // Solid white core (never shrinks)
    grd2.addColorStop(0.04, "rgba(255, 255, 220, 1.0)");   // Bright yellow core edge
    grd2.addColorStop(0.1, "rgba(255, 180, 50, 0.6)");     // Golden halo
    grd2.addColorStop(0.3, "rgba(200, 60, 20, 0.2)");      // Soft orange spread
    grd2.addColorStop(1, "rgba(0, 0, 0, 0.0)");
    ctx2.fillStyle = grd2;
    ctx2.fillRect(0, 0, size, size);
    this.sunTexture = PIXI.Texture.from(canvas2);

    // Indices never change
    const indices = new Uint32Array(this.rayCount * 3);
    for (let i = 0; i < this.rayCount; i++) {
      indices[i * 3] = 0; // Center vertex
      indices[i * 3 + 1] = i + 1;
      indices[i * 3 + 2] = (i === this.rayCount - 1) ? 1 : i + 2;
    }

    // 8 layers for area light soft shadows
    for (let i = 0; i < 8; i++) {
      const vertices = new Float32Array((this.rayCount + 1) * 2);
      const uvs = new Float32Array((this.rayCount + 1) * 2);
      
      const geometry = new PIXI.MeshGeometry({
        positions: vertices,
        uvs: uvs,
        indices: indices
      });
        
      const mesh = new PIXI.Mesh({ geometry, texture: this.lightTexture });
      
      this.lightGeometries.push(geometry);
      this.lightMeshes.push(mesh);
      this.lightContainer.addChild(mesh);
    }
  }

  public update(lightPos: Vec2) {
    const samples = 8;
    const lightRadius = 1.5; // Large enough so the claw can't completely eclipse the light
    const maxPixelDist = this.maxDistance * 40;
    
    // Only exclude sensors (arm segment colliders) - let player body/claw cast shadows
    const filterFlags = this.rapier.QueryFilterFlags.EXCLUDE_SENSORS;

    for (let s = 0; s < samples; s++) {
      const sampleAngle = (s / samples) * Math.PI * 2;
      const originX = lightPos.x + Math.cos(sampleAngle) * lightRadius;
      const originY = lightPos.y + Math.sin(sampleAngle) * lightRadius;

      const geom = this.lightGeometries[s];
      const vertices = geom.getBuffer('aPosition').data as Float32Array;
      const uvs = geom.getBuffer('aUV').data as Float32Array;
      
      // Center vertex
      vertices[0] = originX * 40;
      vertices[1] = -originY * 40;
      
      // Map UVs relative to the absolute lightPos, NOT the offset origin!
      // This ensures all 8 sample meshes share the exact same perfectly aligned texture, eliminating lumpiness.
      const centerLocalX = (originX - lightPos.x) * 40;
      const centerLocalY = (-originY - (-lightPos.y)) * 40;
      uvs[0] = 0.5 + (centerLocalX / maxPixelDist) * 0.5;
      uvs[1] = 0.5 + (centerLocalY / maxPixelDist) * 0.5;

      for (let i = 0; i < this.rayCount; i++) {
        const angle = (i / this.rayCount) * Math.PI * 2;
        const dir = { x: Math.cos(angle), y: Math.sin(angle) };
        const ray = new this.rapier.Ray({ x: originX, y: originY }, dir);
        
        // Solid=true ensures rays starting inside colliders hit immediately at toi=0
        const hit = this.world.castRay(ray, this.maxDistance, true, filterFlags, 0x00080007);
        let hitDist = this.maxDistance;
        if (hit) {
          hitDist = hit.timeOfImpact;
        }

        const hitX = originX + dir.x * hitDist;
        const hitY = originY + dir.y * hitDist;

        // Vertex positions (world space)
        const vIdx = (i + 1) * 2;
        vertices[vIdx] = hitX * 40;
        vertices[vIdx + 1] = -hitY * 40;

        // UV mapping relative to the absolute lightPos
        const localX = (hitX - lightPos.x) * 40;
        const localY = (-hitY - (-lightPos.y)) * 40;
        
        uvs[vIdx] = 0.5 + (localX / maxPixelDist) * 0.5;
        uvs[vIdx + 1] = 0.5 + (localY / maxPixelDist) * 0.5;
      }

      geom.getBuffer('aPosition').update();
      geom.getBuffer('aUV').update();
    }
  }
}
