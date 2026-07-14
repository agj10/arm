import * as PIXI from 'pixi.js';
import * as RAPIER from '@dimforge/rapier2d';
import { Vec2 } from './Vec2';

export class RobotArm {
  public bodyMesh: PIXI.Graphics;
  public clawMesh: PIXI.Graphics;
  
  private armMeshes: PIXI.Graphics[] = [];
  private jointMeshes: PIXI.Graphics[] = [];
  
  private joints: Vec2[] = [];
  private armLengths: number[] = [2.5, 2.5, 2.5];

  public clawPos: Vec2;
  private rigidBody: RAPIER.RigidBody;
  private clawBody: RAPIER.RigidBody;
  // @ts-ignore
  private ropeJoint: RAPIER.ImpulseJoint;

  private isAttached: boolean = true;
  private prevIsMouseDown: boolean = false;

  private rapier: typeof RAPIER;
  private world: RAPIER.World;
  
  constructor(container: PIXI.Container, lightLayer: PIXI.Container, lightTex: PIXI.Texture, world: RAPIER.World, rapierModule: typeof RAPIER) {
    this.rapier = rapierModule;
    this.world = world;
    this.clawPos = new Vec2(0, -5);

    this.bodyMesh = new PIXI.Graphics();
    this.bodyMesh.circle(0, 0, 0.8 * 40).fill(0x4a4a4a);
    container.addChild(this.bodyMesh);

    this.clawMesh = new PIXI.Graphics();
    this.clawMesh.rect(-0.6 * 40, -0.6 * 40, 1.2 * 40, 1.2 * 40).fill(0x8b5a2b);
    container.addChild(this.clawMesh);

    for (let i = 0; i < 3; i++) {
      const arm = new PIXI.Graphics();
      arm.rect(-0.25 * 40, 0, 0.5 * 40, 1 * 40).fill(0x5a5a5a);
      container.addChild(arm);
      this.armMeshes.push(arm);
      this.joints.push(new Vec2());
    }
    this.joints.push(new Vec2()); 

    for (let i = 0; i < 2; i++) {
      const jMesh = new PIXI.Graphics();
      jMesh.circle(0, 0, 0.4 * 40).fill(0x8b5a2b);
      container.addChild(jMesh);
      this.jointMeshes.push(jMesh);
    }

    // Body
    const rigidBodyDesc = rapierModule.RigidBodyDesc.dynamic().setTranslation(0, -1);
    this.rigidBody = world.createRigidBody(rigidBodyDesc);
    const colliderDesc = rapierModule.ColliderDesc.ball(0.8)
      .setMass(2.0)
      .setSensor(true);
    world.createCollider(colliderDesc, this.rigidBody);

    // Claw
    const clawBodyDesc = rapierModule.RigidBodyDesc.dynamic().setTranslation(0, -5).setLinearDamping(0.5);
    this.clawBody = world.createRigidBody(clawBodyDesc);
    const clawColDesc = rapierModule.ColliderDesc.cuboid(0.6, 0.6)
      .setMass(0.5); // Lighter claw
    world.createCollider(clawColDesc, this.clawBody);

    // Rope constraint between them
    const maxDist = this.armLengths.reduce((a, b) => a + b, 0);
    const jointParams = rapierModule.JointData.rope(maxDist, {x:0, y:0}, {x:0, y:0});
    this.ropeJoint = world.createImpulseJoint(jointParams, this.rigidBody, this.clawBody, true);
  }

  public update(mousePos: Vec2, isMouseDown: boolean) {
    const maxDist = this.armLengths.reduce((a, b) => a + b, 0);

    if (this.isAttached) {
      this.rigidBody.setBodyType(this.rapier.RigidBodyType.Dynamic, true);
      this.clawBody.setBodyType(this.rapier.RigidBodyType.KinematicPositionBased, true);

      let clampedMousePos = mousePos.clone();
      if (clampedMousePos.distanceTo(this.clawPos) > maxDist) {
        const dir = clampedMousePos.clone().sub(this.clawPos).normalize();
        clampedMousePos = this.clawPos.clone().add(dir.multiplyScalar(maxDist));
      }

      const targetX = this.clawPos.x - (clampedMousePos.x - this.clawPos.x);
      const targetY = this.clawPos.y - (clampedMousePos.y - this.clawPos.y);

      const currentPos = this.rigidBody.translation();
      const springForceX = (targetX - currentPos.x) * 6;
      const springForceY = (targetY - currentPos.y) * 6;
      
      this.rigidBody.setLinvel({ x: springForceX, y: springForceY }, true);

      if (this.prevIsMouseDown && !isMouseDown) {
        this.isAttached = false;
        this.clawBody.setBodyType(this.rapier.RigidBodyType.Dynamic, true);
      }
    } else {
      // Flying - Rapier Rope Joint automatically keeps them connected!
      const bodyPos = this.rigidBody.translation();
      const cPos = this.clawBody.translation();
      this.clawPos.set(cPos.x, cPos.y);

      if (isMouseDown && !this.prevIsMouseDown) { 
        const dir = mousePos.clone().sub(this.clawPos);
        if (dir.lengthSq() > 0.001) {
          dir.normalize();
          const ray = new this.rapier.Ray({ x: this.clawPos.x, y: this.clawPos.y }, { x: dir.x, y: dir.y });
          const hit = this.world.castRay(ray, maxDist * 1.5, true, this.rapier.QueryFilterFlags.EXCLUDE_DYNAMIC);
          
          if (hit && !isNaN((hit as any).toi)) {
            const hitPoint = new Vec2(
              ray.origin.x + ray.dir.x * (hit as any).toi,
              ray.origin.y + ray.dir.y * (hit as any).toi
            );
            this.isAttached = true;
            this.clawPos.set(hitPoint.x, hitPoint.y);
            this.clawBody.setTranslation({ x: hitPoint.x, y: hitPoint.y }, true);
            this.clawBody.setLinvel({ x: 0, y: 0 }, true);
          }
        }
      }
      
      // Auto-attach triggers
      if (bodyPos.y <= -4.1 && bodyPos.x < 155) { 
        this.isAttached = true;
        this.clawPos.set(bodyPos.x, -5); 
        this.clawBody.setTranslation({ x: bodyPos.x, y: -5 }, true);
        this.clawBody.setLinvel({ x: 0, y: 0 }, true);
      } else if (bodyPos.y <= -1499.1 && bodyPos.x >= 150) { 
        this.isAttached = true;
        this.clawPos.set(bodyPos.x, -1500);
        this.clawBody.setTranslation({ x: bodyPos.x, y: -1500 }, true);
        this.clawBody.setLinvel({ x: 0, y: 0 }, true);
      }
    }

    this.prevIsMouseDown = isMouseDown;
    
    // Update visuals
    const pos = this.rigidBody.translation();
    this.bodyMesh.position.set(pos.x * 40, -pos.y * 40); 
    this.clawMesh.position.set(this.clawPos.x * 40, -this.clawPos.y * 40);

    this.updateIK();
  }

  private updateIK() {
    const base = new Vec2(this.rigidBody.translation().x, this.rigidBody.translation().y);
    const target = this.clawPos.clone();
    const L = 2.5; 
    let dist = base.distanceTo(target);
    const maxDist = 3 * L;

    if (dist > maxDist) {
      const dir = target.clone().sub(base).normalize();
      target.copy(base.clone().add(dir.multiplyScalar(maxDist)));
      dist = maxDist;
    }

    this.joints[0].copy(base);
    this.joints[3].copy(target);

    let dir = target.clone().sub(base);
    if (dist < 0.001) {
      dir.set(0, 1);
      dist = 0.001;
    } else {
      dir.normalize();
    }

    if (dist >= maxDist - 0.01) {
      this.joints[1].lerpVectors(base, target, 1/3);
      this.joints[2].lerpVectors(base, target, 2/3);
    } else {
      const n = new Vec2(-dir.y, dir.x); 
      const cosTheta = Math.max(-1, Math.min(1, (dist - L) / (2 * L)));
      const theta = Math.acos(cosTheta);
      
      this.joints[1].set(
        base.x + L * (dir.x * Math.cos(theta) + n.x * Math.sin(theta)),
        base.y + L * (dir.y * Math.cos(theta) + n.y * Math.sin(theta))
      );
      this.joints[2].set(
        target.x - L * dir.x * Math.cos(theta) + L * n.x * Math.sin(theta),
        target.y - L * dir.y * Math.cos(theta) + L * n.y * Math.sin(theta)
      );
    }

    for (let i = 0; i < 3; i++) {
      const start = this.joints[i];
      const end = this.joints[i+1];
      
      this.armMeshes[i].position.set(start.x * 40, -start.y * 40);
      this.armMeshes[i].scale.set(1, L);
      this.armMeshes[i].rotation = Math.atan2(-end.y - (-start.y), end.x - start.x) - Math.PI / 2;
      
      if (i < 2) {
        this.jointMeshes[i].position.set(end.x * 40, -end.y * 40);
      }
    }
  }
}
