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
  private maxDistance: number = 50; // 50m = 2000px, spans across screen

  constructor(world: RAPIER.World, rapierModule: typeof RAPIER) {
    this.world = world;
    this.rapier = rapierModule;

    this.lightContainer = new PIXI.Container();
    this.lightContainer.blendMode = 'add';
    
    // Create a smooth radial gradient texture
    const canvas = document.createElement('canvas');
    const size = 2048;
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d')!;
    const grd = ctx.createRadialGradient(size/2, size/2, 0, size/2, size/2, size/2);
    // Original intense orange/yellow color with full alpha for crisp look
    grd.addColorStop(0, "rgba(255, 200, 100, 1.0)");
    grd.addColorStop(1, "rgba(255, 200, 100, 0.0)");
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

    // Only 1 layer for sharp shadows like the original
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

  public update(lightPos: Vec2) {
    const maxPixelDist = this.maxDistance * 40;
    
    // Only exclude sensors (arm segment colliders) - let player body/claw cast shadows
    const filter = this.rapier.QueryFilterFlags.EXCLUDE_SENSORS;

    const originX = lightPos.x;
    const originY = lightPos.y;

    const geom = this.lightGeometries[0];
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
      const hit = this.world.castRay(ray, this.maxDistance, false, filter);

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
