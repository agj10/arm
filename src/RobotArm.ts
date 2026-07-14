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

  private armBodies: RAPIER.RigidBody[] = [];
  private jointBodies: RAPIER.RigidBody[] = [];

  private rapier: typeof RAPIER;
  private world: RAPIER.World;
  
  constructor(container: PIXI.Container, world: RAPIER.World, rapierModule: typeof RAPIER) {
    this.rapier = rapierModule;
    this.world = world;
    this.clawPos = new Vec2(0, -5);

    // Body
    const rigidBodyDesc = rapierModule.RigidBodyDesc.dynamic().setTranslation(0, -1);
    this.rigidBody = world.createRigidBody(rigidBodyDesc);
    const colliderDesc = rapierModule.ColliderDesc.ball(0.8)
      .setMass(2.0); // NOT a sensor! It will collide with the ground!
    world.createCollider(colliderDesc, this.rigidBody);

    this.bodyMesh = new PIXI.Graphics();
    this.bodyMesh.circle(0, 0, 0.8 * 40).fill(0x4a4a4a);
    container.addChild(this.bodyMesh);

    // Claw
    const clawBodyDesc = rapierModule.RigidBodyDesc.dynamic().setTranslation(0, -5).setLinearDamping(0.5);
    this.clawBody = world.createRigidBody(clawBodyDesc);
    const clawColDesc = rapierModule.ColliderDesc.cuboid(0.6, 0.6)
      .setMass(0.5); // NOT a sensor
    world.createCollider(clawColDesc, this.clawBody);

    this.clawMesh = new PIXI.Graphics();
    this.clawMesh.rect(-0.6 * 40, -0.6 * 40, 1.2 * 40, 1.2 * 40).fill(0x8b5a2b);
    container.addChild(this.clawMesh);

    for (let i = 0; i < 3; i++) {
      const arm = new PIXI.Graphics();
      arm.rect(-0.25 * 40, 0, 0.5 * 40, 1 * 40).fill(0x5a5a5a);
      container.addChild(arm);
      this.armMeshes.push(arm);
      this.joints.push(new Vec2());

      const armBodyDesc = rapierModule.RigidBodyDesc.kinematicPositionBased();
      const armBody = world.createRigidBody(armBodyDesc);
      const armColDesc = rapierModule.ColliderDesc.cuboid(0.25, 1.25).setSensor(true);
      world.createCollider(armColDesc, armBody);
      this.armBodies.push(armBody);
    }
    this.joints.push(new Vec2()); 

    for (let i = 0; i < 2; i++) {
      const jMesh = new PIXI.Graphics();
      jMesh.circle(0, 0, 0.4 * 40).fill(0x8b5a2b);
      container.addChild(jMesh);
      this.jointMeshes.push(jMesh);

      const jointBodyDesc = rapierModule.RigidBodyDesc.kinematicPositionBased();
      const jointBody = world.createRigidBody(jointBodyDesc);
      const jointColDesc = rapierModule.ColliderDesc.ball(0.4).setSensor(true);
      world.createCollider(jointColDesc, jointBody);
      this.jointBodies.push(jointBody);
    }

    // Rope constraint between base and claw
    const maxDist = this.armLengths.reduce((a, b) => a + b, 0);
    const jointParams = rapierModule.JointData.rope(maxDist, {x:0, y:0}, {x:0, y:0});
    this.ropeJoint = world.createImpulseJoint(jointParams, this.rigidBody, this.clawBody, true);
  }

  public update(mousePos: Vec2, isMouseDown: boolean) {
    const maxDist = this.armLengths.reduce((a, b) => a + b, 0);

    if (this.isAttached) {
      this.clawBody.setBodyType(this.rapier.RigidBodyType.KinematicPositionBased, true);
      this.clawBody.setTranslation({ x: this.clawPos.x, y: this.clawPos.y }, true);

      // Inverted slingshot aiming: Base pulls back in the opposite direction of the mouse
      this.rigidBody.setBodyType(this.rapier.RigidBodyType.KinematicPositionBased, true);
      
      let clampedMousePos = mousePos.clone();
      if (clampedMousePos.distanceTo(this.clawPos) > maxDist) {
        const dir = clampedMousePos.clone().sub(this.clawPos).normalize();
        clampedMousePos = this.clawPos.clone().add(dir.multiplyScalar(maxDist));
      }
      
      // Base moves opposite to mouse, anchoring at clawPos
      const targetX = this.clawPos.x - (clampedMousePos.x - this.clawPos.x);
      const targetY = this.clawPos.y - (clampedMousePos.y - this.clawPos.y);

      this.rigidBody.setTranslation({ x: targetX, y: targetY }, true);

      if (this.prevIsMouseDown && !isMouseDown) {
        // Released! Shoot towards the mouse!
        this.isAttached = false;
        this.rigidBody.setBodyType(this.rapier.RigidBodyType.Dynamic, true);
        this.clawBody.setBodyType(this.rapier.RigidBodyType.Dynamic, true);
        
        // Pull direction is from base towards claw (which is towards clampedMousePos)
        const pullX = this.clawPos.x - targetX;
        const pullY = this.clawPos.y - targetY;
        
        this.rigidBody.setLinvel({ x: pullX * 12, y: pullY * 12 }, true);
        this.clawBody.setLinvel({ x: pullX * 12, y: pullY * 12 }, true);
      }
    } else {
      // Flying - Rapier Rope Joint automatically keeps them connected!
      const bodyPos = this.rigidBody.translation();
      const cPos = this.clawBody.translation();
      this.clawPos.set(cPos.x, cPos.y);

      // Auto-attach on collision with any fixed geometry, snapping exactly to surface
      const dirs = [{x:0,y:-0.7}, {x:0,y:0.7}, {x:-0.7,y:0}, {x:0.7,y:0}];
      let attachedPoint = null;
      for (const d of dirs) {
        const ray = new this.rapier.Ray({ x: cPos.x, y: cPos.y }, d);
        // Exclude dynamic/kinematic so it only attaches to fixed level geometry
        const filter = this.rapier.QueryFilterFlags.EXCLUDE_DYNAMIC | this.rapier.QueryFilterFlags.EXCLUDE_KINEMATIC;
        const hit = this.world.castRay(ray, 0.7, true, filter);
        if (hit && !isNaN((hit as any).toi)) {
          attachedPoint = new Vec2(
            ray.origin.x + ray.dir.x * (hit as any).toi,
            ray.origin.y + ray.dir.y * (hit as any).toi
          );
          break;
        }
      }

      if (attachedPoint) { 
        this.isAttached = true;
        this.clawPos.set(attachedPoint.x, attachedPoint.y); 
        this.clawBody.setTranslation({ x: attachedPoint.x, y: attachedPoint.y }, true);
        this.clawBody.setLinvel({ x: 0, y: 0 }, true);
        this.clawBody.setAngvel(0, true);
      } else if (bodyPos.y <= -1499.1 && bodyPos.x >= 150) { 
        // Abyss safety net
        this.isAttached = true;
        this.clawPos.set(bodyPos.x, -1500);
        this.clawBody.setTranslation({ x: bodyPos.x, y: -1500 }, true);
        this.clawBody.setLinvel({ x: 0, y: 0 }, true);
        this.clawBody.setAngvel(0, true);
      }
    }

    this.prevIsMouseDown = isMouseDown;
    
    // Update visuals - Sync perfectly with physics
    const pos = this.rigidBody.translation();
    this.bodyMesh.position.set(pos.x * 40, -pos.y * 40); 
    this.bodyMesh.rotation = -this.rigidBody.rotation();

    this.clawMesh.position.set(this.clawPos.x * 40, -this.clawPos.y * 40);
    this.clawMesh.rotation = -this.clawBody.rotation();

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
      
      const cx = (start.x + end.x) / 2;
      const cy = (start.y + end.y) / 2;
      
      this.armMeshes[i].position.set(start.x * 40, -start.y * 40);
      this.armMeshes[i].scale.set(1, L);
      
      const physicalAngle = Math.atan2(end.y - start.y, end.x - start.x);
      const visualAngle = Math.atan2(-end.y - (-start.y), end.x - start.x);
      
      this.armMeshes[i].rotation = visualAngle - Math.PI / 2;
      
      this.armBodies[i].setTranslation({ x: cx, y: cy }, true);
      this.armBodies[i].setRotation(physicalAngle - Math.PI / 2, true);

      if (i < 2) {
        this.jointMeshes[i].position.set(end.x * 40, -end.y * 40);
        this.jointMeshes[i].rotation = visualAngle - Math.PI / 2; // Approximate rotation for joints if textured
        this.jointBodies[i].setTranslation({ x: end.x, y: end.y }, true);
      }
    }
  }
}
