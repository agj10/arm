import * as PIXI from 'pixi.js';
import * as RAPIER from '@dimforge/rapier2d';
import { Vec2 } from './Vec2';
import { PixelateFilter } from 'pixi-filters';

export class LightingSystem {
  private world: RAPIER.World;
  private rapier: typeof RAPIER;
  
  public lightContainer: PIXI.Container;
  private lightGraphics: PIXI.Graphics;
  public leafOverlay?: PIXI.TilingSprite;

  private rayCount: number = 180; // Optimized for performance
  private maxDistance: number = 100; // In rapier units (meters)
  private samples: number = 4; // Stepped banding
  private lightRadius: number = 1.5; // Area light radius

  constructor(world: RAPIER.World, rapierModule: typeof RAPIER) {
    this.world = world;
    this.rapier = rapierModule;

    this.lightContainer = new PIXI.Container();
    // Force container to render offscreen so children blend together first
    this.lightContainer.filters = [new PIXI.AlphaFilter({ alpha: 1.0 })];
    this.lightContainer.blendMode = 'add';
    
    this.lightGraphics = new PIXI.Graphics();
    this.lightGraphics.blendMode = 'normal'; // Drawn normally into the offscreen buffer

    this.lightContainer.addChild(this.lightGraphics);

    // Load and add leaf shadows directly to the light
    PIXI.Assets.load('/leaf_shadows.png').then((texture) => {
      this.leafOverlay = new PIXI.TilingSprite({
        texture: texture,
        width: 4000,
        height: 4000
      });
      // Multiply blend mode cuts out the light where leaves are black
      this.leafOverlay.blendMode = 'multiply';
      // Pixelate and increase density
      this.leafOverlay.filters = [new PixelateFilter([4, 4])];
      this.leafOverlay.tileScale.set(0.35); 
      this.leafOverlay.position.set(-2000, -2000);
      this.lightContainer.addChild(this.leafOverlay);
    });
  }

  public update(lightPos: Vec2, cameraPos: Vec2) {
    this.lightGraphics.clear();
    
    // Warm sunset orange, bright center
    const color = 0xffa050; 
    const alpha = 0.15; // Stronger orange per step

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
        const hit = this.world.castRay(ray, this.maxDistance, true);
        
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

    if (this.leafOverlay) {
      this.leafOverlay.tilePosition.x = -cameraPos.x * 5;
      this.leafOverlay.tilePosition.y = cameraPos.y * 5;

      // Fade out leaf shadows when going underground
      const depth = -cameraPos.y;
      if (depth > 15) {
        this.leafOverlay.alpha = Math.max(0, 1.0 - (depth - 15) * 0.05);
      } else {
        this.leafOverlay.alpha = 1.0;
      }
    }
  }
}
