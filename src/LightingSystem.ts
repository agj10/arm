import * as PIXI from 'pixi.js';
import * as RAPIER from '@dimforge/rapier2d';
import { Vec2 } from './Vec2';

export class LightingSystem {
  private world: RAPIER.World;
  private rapier: typeof RAPIER;
  
  public lightContainer: PIXI.Container;
  private lightMeshes: PIXI.Mesh[] = [];
  private lightGeometries: PIXI.Geometry[] = [];
  private lightTexture: PIXI.Texture;

  private rayCount: number = 360; // 360 is plenty for smooth shadows
  private maxDistance: number = 80; // 80m = 3200px, enough to cover entire screen even when zoomed out

  constructor(world: RAPIER.World, rapierModule: typeof RAPIER) {
    this.world = world;
    this.rapier = rapierModule;

    this.lightContainer = new PIXI.Container();
    this.lightContainer.blendMode = 'add';
    
    // Create a massive smooth radial gradient texture for the sunset
    const canvas = document.createElement('canvas');
    const size = 4096;
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d')!;
    const grd = ctx.createRadialGradient(size/2, size/2, 0, size/2, size/2, size/2);
    
    // The light ITSELF creates the beautiful sunset colors over the dark sky.
    // Middle ground between intense vibrant colors and soft pastel tones.
    grd.addColorStop(0, "rgba(255, 255, 225, 0.14)");     // Core: bright warm white
    grd.addColorStop(0.08, "rgba(255, 200, 80, 0.08)");   // Inner halo: golden orange
    grd.addColorStop(0.28, "rgba(255, 130, 60, 0.05)");   // Mid sky: warm sunset orange
    grd.addColorStop(0.6, "rgba(210, 60, 40, 0.03)");     // Outer sky: soft sunset red
    grd.addColorStop(1, "rgba(80, 30, 20, 0.0)");         // Fade out smoothly
    
    ctx.fillStyle = grd;
    ctx.fillRect(0, 0, size, size);
    
    this.lightTexture = PIXI.Texture.from(canvas);

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
    const lightRadius = 0.4; // Soft penumbra for large sun
    const maxPixelDist = this.maxDistance * 40;
    
    // Only exclude sensors (arm segment colliders) - let player body/claw cast shadows
    const filterFlags = this.rapier.QueryFilterFlags.EXCLUDE_SENSORS;

    for (let s = 0; s < samples; s++) {
      const sampleAngle = (s / samples) * Math.PI * 2;
      const offsetX = Math.cos(sampleAngle) * lightRadius;
      const offsetY = Math.sin(sampleAngle) * lightRadius;

      const originX = lightPos.x + offsetX;
      const originY = lightPos.y + offsetY;

      const geom = this.lightGeometries[s];
      const vertices = geom.getBuffer('aPosition').data as Float32Array;
      const uvs = geom.getBuffer('aUV').data as Float32Array;

      // Center vertex in world coordinates
      vertices[0] = originX * 40;
      vertices[1] = -originY * 40;
      uvs[0] = 0.5;
      uvs[1] = 0.5;

      for (let i = 0; i < this.rayCount; i++) {
        const angle = (i / this.rayCount) * Math.PI * 2;
        const dir = { x: Math.cos(angle), y: Math.sin(angle) };
        const ray = new this.rapier.Ray({ x: originX, y: originY }, dir);
        const hit = this.world.castRay(ray, this.maxDistance, false, filterFlags, 0x00080005);

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

        // UV mapping relative to maxDistance
        const localX = (hitX - originX) * 40;
        const localY = (-hitY - (-originY)) * 40;
        
        uvs[vIdx] = 0.5 + (localX / maxPixelDist) * 0.5;
        uvs[vIdx + 1] = 0.5 + (localY / maxPixelDist) * 0.5;
      }

      geom.getBuffer('aPosition').update();
      geom.getBuffer('aUV').update();
    }
  }
}
