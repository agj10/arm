import * as PIXI from 'pixi.js';
import * as RAPIER from '@dimforge/rapier2d';
import { Vec2 } from './Vec2';

export class RobotArm {
  public bodyMesh: PIXI.Graphics;
  public clawMesh: PIXI.Graphics;
  private armMeshes: PIXI.Graphics[] = [];
  private jointMeshes: PIXI.Graphics[] = [];

  public silBodyMesh: PIXI.Graphics;
  private silArmMeshes: PIXI.Graphics[] = [];
  private silJointMeshes: PIXI.Graphics[] = [];
  
  private joints: Vec2[] = [];
  private armLengths: number[] = [2.5, 2.5, 2.5];

  public clawPos: Vec2;
  private rigidBody: RAPIER.RigidBody;
  private clawBody: RAPIER.RigidBody;
  // @ts-ignore
  private ropeJoint: RAPIER.ImpulseJoint;

  private isAttached: boolean = false;
  private prevIsMouseDown: boolean = false;
  private detachCooldown: number = 0;

  // Snap event data (consumed by main.ts each frame)
  public didSnap: boolean = false;
  public snapFrom: Vec2 = new Vec2();
  public snapTo: Vec2 = new Vec2();

  // Ghost pose: snapshot of all visual positions at one instant
  public snapGhosts: { bodyPos: {x:number,y:number}, bodyRot: number, clawPos: {x:number,y:number}, clawRot: number, joints: {x:number,y:number}[] }[] = [];

  private armBodies: RAPIER.RigidBody[] = [];
  private jointBodies: RAPIER.RigidBody[] = [];

  private rapier: typeof RAPIER;
  private world: RAPIER.World;
  
  constructor(container: PIXI.Container, clawLayer: PIXI.Container, silhouetteContainer: PIXI.Container, world: RAPIER.World, rapierModule: typeof RAPIER) {
    this.rapier = rapierModule;
    this.world = world;
    this.clawPos = new Vec2(0, -5);

    // Body
    const rigidBodyDesc = rapierModule.RigidBodyDesc.dynamic().setTranslation(0, -1);
    this.rigidBody = world.createRigidBody(rigidBodyDesc);
    const colliderDesc = rapierModule.ColliderDesc.ball(0.8)
      .setMass(2.0).setCollisionGroups(0x00040008); // Casts shadow, no level collision
    world.createCollider(colliderDesc, this.rigidBody);

    this.bodyMesh = new PIXI.Graphics();
    this.bodyMesh.circle(0, 0, 0.8 * 40).fill(0x4a4a4a);
    container.addChild(this.bodyMesh);
    
    this.silBodyMesh = new PIXI.Graphics();
    this.silBodyMesh.circle(0, 0, 0.8 * 40).fill(0x00ffff);
    silhouetteContainer.addChild(this.silBodyMesh);

    // Claw
    const clawBodyDesc = rapierModule.RigidBodyDesc.dynamic().setTranslation(0, -5).setLinearDamping(0.5);
    this.clawBody = world.createRigidBody(clawBodyDesc);
    const clawColDesc = rapierModule.ColliderDesc.cuboid(0.6, 0.6)
      .setMass(0.5).setCollisionGroups(0x00020009); // Col Group 2, Mask Group 1 (Level) & Group 4 (Light)
    world.createCollider(clawColDesc, this.clawBody);

    this.clawMesh = new PIXI.Graphics();
    this.clawMesh.roundRect(-20, -20, 40, 20, 5).fill(0x3a3a3a);
    this.clawMesh.poly([-20, 0, -30, 35, -15, 35, -5, 0]).fill(0x5a5a5a);
    this.clawMesh.poly([20, 0, 30, 35, 15, 35, 5, 0]).fill(0x5a5a5a);
    this.clawMesh.circle(0, -5, 8).fill(0xee8822);
    clawLayer.addChild(this.clawMesh);

    for (let i = 0; i < 3; i++) {
      const arm = new PIXI.Graphics();
      arm.rect(-0.25 * 40, 0, 0.5 * 40, 1 * 40).fill(0x5a5a5a);
      container.addChild(arm);
      this.armMeshes.push(arm);
      
      const silArm = new PIXI.Graphics();
      silArm.rect(-0.25 * 40, 0, 0.5 * 40, 1 * 40).fill(0x00ffff);
      silhouetteContainer.addChild(silArm);
      this.silArmMeshes.push(silArm);
      
      this.joints.push(new Vec2());

      const armBodyDesc = rapierModule.RigidBodyDesc.kinematicPositionBased();
      const armBody = world.createRigidBody(armBodyDesc);
      const armColDesc = rapierModule.ColliderDesc.cuboid(0.25, 1.25).setCollisionGroups(0x00040008);
      world.createCollider(armColDesc, armBody);
      this.armBodies.push(armBody);
    }
    this.joints.push(new Vec2()); 

    for (let i = 0; i < 2; i++) {
      const jMesh = new PIXI.Graphics();
      jMesh.circle(0, 0, 0.4 * 40).fill(0x8b5a2b);
      container.addChild(jMesh);
      this.jointMeshes.push(jMesh);
      
      const silJMesh = new PIXI.Graphics();
      silJMesh.circle(0, 0, 0.4 * 40).fill(0x00ffff);
      silhouetteContainer.addChild(silJMesh);
      this.silJointMeshes.push(silJMesh);

      const jointBodyDesc = rapierModule.RigidBodyDesc.kinematicPositionBased();
      const jointBody = world.createRigidBody(jointBodyDesc);
      const jointColDesc = rapierModule.ColliderDesc.ball(0.4).setCollisionGroups(0x00040008);
      world.createCollider(jointColDesc, jointBody);
      this.jointBodies.push(jointBody);
    }

    // Rope constraint between base and claw
    const maxDist = this.armLengths.reduce((a, b) => a + b, 0);
    const jointParams = rapierModule.JointData.rope(maxDist, {x:0, y:0}, {x:0, y:0});
    this.ropeJoint = world.createImpulseJoint(jointParams, this.rigidBody, this.clawBody, true);
  }

  public update(mousePos: Vec2, isMouseDown: boolean, isRightClick: boolean = false, isShiftDown: boolean = false) {
    this.didSnap = false;
    this.snapGhosts = [];
    this.rigidBody.setGravityScale(1.0, true);
    
    const maxDist = this.armLengths.reduce((a, b) => a + b, 0);
    const basePos = this.rigidBody.translation();

    if (this.detachCooldown > 0) {
        this.detachCooldown--;
    }

    if (!this.isAttached) {
      // Flying state
      this.clawBody.setBodyType(this.rapier.RigidBodyType.Dynamic, true);
      this.rigidBody.setBodyType(this.rapier.RigidBodyType.Dynamic, true);

      // SNAP: Right-click to instantly attach to nearby surface in mouse direction
      if (isRightClick) {
        const cPos = this.clawBody.translation();
        const snapOrigin = new Vec2(cPos.x, cPos.y);
        const bodyOrigin = { x: basePos.x, y: basePos.y };
        const bodyRotOrigin = this.rigidBody.rotation();
        const clawRotOrigin = this.clawBody.rotation();
        const snapTarget = this.getSnapTarget(mousePos);
        
        if (snapTarget) {
          const hitPoint = snapTarget.point;
          const normalHit = snapTarget.normal;
          
          // Generate ghost poses along the snap path (sandevistan style)
          const ghostCount = 5;
          const jointsBackup = this.joints.map(j => new Vec2(j.x, j.y));
          for (let g = 0; g < ghostCount; g++) {
            const t = (g + 1) / (ghostCount + 1); // Skip 0 and 1
            const interpClaw = new Vec2(
              snapOrigin.x + (hitPoint.x - snapOrigin.x) * t,
              snapOrigin.y + (hitPoint.y - snapOrigin.y) * t
            );
            const interpBody = {
              x: bodyOrigin.x + (hitPoint.x - bodyOrigin.x) * t * 0.3, // Body lags behind
              y: bodyOrigin.y + (hitPoint.y - bodyOrigin.y) * t * 0.3
            };
            // Solve IK for this interpolated pose
            const ghostJoints = this.solveIKStatic(new Vec2(interpBody.x, interpBody.y), interpClaw);
            this.snapGhosts.push({
              bodyPos: interpBody,
              bodyRot: bodyRotOrigin,
              clawPos: { x: interpClaw.x, y: interpClaw.y },
              clawRot: clawRotOrigin + (g / ghostCount) * 0.5,
              joints: ghostJoints.map(j => ({ x: j.x, y: j.y }))
            });
          }
          // Restore joints
          for (let i = 0; i < this.joints.length; i++) this.joints[i].copy(jointsBackup[i]);
          
          this.isAttached = true;
          this.clawPos.set(hitPoint.x, hitPoint.y);
          this.clawBody.setBodyType(this.rapier.RigidBodyType.KinematicPositionBased, true);
          this.clawBody.setTranslation({ x: hitPoint.x, y: hitPoint.y }, true);

          this.didSnap = true;
          this.snapFrom.set(snapOrigin.x, snapOrigin.y);
          this.snapTo.set(hitPoint.x, hitPoint.y);
          this.clawBody.setLinvel({ x: 0, y: 0 }, true);
          
          // normalHit points AWAY from the wall. We want to face TOWARDS the wall.
          const R = Math.atan2(normalHit.y, -normalHit.x) - Math.PI / 2;
          this.clawBody.setRotation(-R, true);
        }
      }

      // Auto-attach on collision with any fixed geometry
      if (!this.isAttached && this.detachCooldown <= 0) {
          const cPos = this.clawBody.translation();
          const dirs = [{x:0,y:-1}, {x:0,y:1}, {x:-1,y:0}, {x:1,y:0}];
          let attachedPoint = null;
          let attachedNormal = null;
          for (const d of dirs) {
            const ray = new this.rapier.Ray({ x: cPos.x, y: cPos.y }, d);
            const filter = this.rapier.QueryFilterFlags.EXCLUDE_DYNAMIC | this.rapier.QueryFilterFlags.EXCLUDE_KINEMATIC;
            const hit = this.world.castRay(ray, 0.8, true, filter);
            if (hit) {
              attachedPoint = new Vec2(
                ray.origin.x + ray.dir.x * hit.timeOfImpact,
                ray.origin.y + ray.dir.y * hit.timeOfImpact
              );
              attachedNormal = d;
              break;
            }
          }

          if (attachedPoint && attachedNormal) { 
            this.isAttached = true;
            this.clawPos.set(attachedPoint.x, attachedPoint.y); 
            this.clawBody.setBodyType(this.rapier.RigidBodyType.KinematicPositionBased, true);
            this.clawBody.setTranslation({ x: attachedPoint.x, y: attachedPoint.y }, true);
            this.clawBody.setLinvel({ x: 0, y: 0 }, true);
            
            const R = Math.atan2(-attachedNormal.y, attachedNormal.x) - Math.PI / 2;
            this.clawBody.setRotation(-R, true);
          }
      }
      
      if (!this.isAttached) {
          const cPos = this.clawBody.translation();
          this.clawPos.set(cPos.x, cPos.y);
          
          const vel = this.clawBody.linvel();
          if (Math.abs(vel.x) > 0.1 || Math.abs(vel.y) > 0.1) {
              const R = Math.atan2(-vel.y, vel.x) - Math.PI / 2;
              this.clawBody.setRotation(-R, true);
          }

          // Point-symmetric body movement: body goes opposite to mouse relative to claw
          let targetPos = new Vec2(
              this.clawPos.x - (mousePos.x - this.clawPos.x),
              this.clawPos.y - (mousePos.y - this.clawPos.y)
          );
          
          if (targetPos.distanceTo(this.clawPos) > maxDist) {
              const dir = targetPos.clone().sub(this.clawPos).normalize();
              targetPos = this.clawPos.clone().add(dir.multiplyScalar(maxDist));
          }
          
          if (!isShiftDown) {
              const baseVel = this.rigidBody.linvel();
              const targetVx = (targetPos.x - basePos.x) * 10;
              const targetVy = (targetPos.y - basePos.y) * 3;
              
              const lerpFactor = 0.08;
              this.rigidBody.setLinvel({
                  x: baseVel.x + (targetVx - baseVel.x) * lerpFactor,
                  y: baseVel.y + (targetVy - baseVel.y) * lerpFactor
              }, true);
          }
      }
    } else {
      // Attached state
      this.clawBody.setBodyType(this.rapier.RigidBodyType.KinematicPositionBased, true);
      this.rigidBody.setBodyType(this.rapier.RigidBodyType.Dynamic, true);
      this.clawBody.setTranslation({ x: this.clawPos.x, y: this.clawPos.y }, true);

      if (this.prevIsMouseDown && !isMouseDown) {
         // Released! Detach and shoot claw!
         this.isAttached = false;
         this.detachCooldown = 15; 
         this.clawBody.setBodyType(this.rapier.RigidBodyType.Dynamic, true);
         
         const cPos = this.clawBody.translation();
         const dir = new Vec2(mousePos.x - cPos.x, mousePos.y - cPos.y).normalize();
         this.clawBody.setLinvel({ x: dir.x * 300, y: dir.y * 300 }, true);
      } else {
         // Follow point-symmetric target smoothly
         let targetPos = new Vec2(
             this.clawPos.x - (mousePos.x - this.clawPos.x),
             this.clawPos.y - (mousePos.y - this.clawPos.y)
         );
         
         if (targetPos.distanceTo(this.clawPos) > maxDist) {
             const dir = targetPos.clone().sub(this.clawPos).normalize();
             targetPos = this.clawPos.clone().add(dir.multiplyScalar(maxDist));
         }
         
         if (!isShiftDown) {
             const baseVel = this.rigidBody.linvel();
             const targetVx = (targetPos.x - basePos.x) * 25;
             const targetVy = (targetPos.y - basePos.y) * 12;
             
             const lerpFactor = 0.2; 
             this.rigidBody.setLinvel({
                 x: baseVel.x + (targetVx - baseVel.x) * lerpFactor,
                 y: baseVel.y + (targetVy - baseVel.y) * lerpFactor
             }, true);
         } else {
             // Freeze completely!
             this.rigidBody.setGravityScale(0.0, true);
             this.rigidBody.setLinvel({ x: 0, y: 0 }, true);
         }
      }
    }

    // Abyss safety net
    if (basePos.y <= -1499.1 && basePos.x >= 150) { 
      this.isAttached = true;
      this.clawPos.set(basePos.x, -1500);
      this.clawBody.setBodyType(this.rapier.RigidBodyType.KinematicPositionBased, true);
      this.clawBody.setTranslation({ x: basePos.x, y: -1500 }, true);
    }

    this.prevIsMouseDown = isMouseDown;
    
    // Update visuals - Sync perfectly with physics
    const pos = this.rigidBody.translation();
    this.bodyMesh.position.set(pos.x * 40, -pos.y * 40); 
    this.bodyMesh.rotation = -this.rigidBody.rotation();
    this.silBodyMesh.position.copyFrom(this.bodyMesh.position);
    this.silBodyMesh.rotation = this.bodyMesh.rotation;

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
      const n1 = new Vec2(-dir.y, dir.x); 
      const n2 = new Vec2(dir.y, -dir.x); 
      const cosTheta = Math.max(-1, Math.min(1, (dist - L) / (2 * L)));
      const theta = Math.acos(cosTheta);
      
      const elbow1 = new Vec2(
        base.x + L * (dir.x * Math.cos(theta) + n1.x * Math.sin(theta)),
        base.y + L * (dir.y * Math.cos(theta) + n1.y * Math.sin(theta))
      );
      const elbow2 = new Vec2(
        base.x + L * (dir.x * Math.cos(theta) + n2.x * Math.sin(theta)),
        base.y + L * (dir.y * Math.cos(theta) + n2.y * Math.sin(theta))
      );

      const prevElbow = this.joints[1].clone();
      if (elbow1.distanceTo(prevElbow) <= elbow2.distanceTo(prevElbow)) {
          this.joints[1].copy(elbow1);
          this.joints[2].set(
            target.x - L * dir.x * Math.cos(theta) + L * n1.x * Math.sin(theta),
            target.y - L * dir.y * Math.cos(theta) + L * n1.y * Math.sin(theta)
          );
      } else {
          this.joints[1].copy(elbow2);
          this.joints[2].set(
            target.x - L * dir.x * Math.cos(theta) + L * n2.x * Math.sin(theta),
            target.y - L * dir.y * Math.cos(theta) + L * n2.y * Math.sin(theta)
          );
      }
    }

    for (let i = 0; i < 3; i++) {
      const start = this.joints[i];
      const end = this.joints[i+1];
      
      const cx = (start.x + end.x) / 2;
      const cy = (start.y + end.y) / 2;
      
      this.armMeshes[i].position.set(start.x * 40, -start.y * 40);
      const actualDist = start.distanceTo(end);
      this.armMeshes[i].scale.set(1, actualDist);
      
      const physicalAngle = Math.atan2(end.y - start.y, end.x - start.x);
      const visualAngle = Math.atan2(-end.y - (-start.y), end.x - start.x);
      
      this.armMeshes[i].rotation = visualAngle - Math.PI / 2;
      this.silArmMeshes[i].position.copyFrom(this.armMeshes[i].position);
      this.silArmMeshes[i].scale.copyFrom(this.armMeshes[i].scale);
      this.silArmMeshes[i].rotation = this.armMeshes[i].rotation;
      
      this.armBodies[i].setTranslation({ x: cx, y: cy }, true);
      this.armBodies[i].setRotation(physicalAngle - Math.PI / 2, true);

      if (i < 2) {
        this.jointMeshes[i].position.set(end.x * 40, -end.y * 40);
        this.jointMeshes[i].rotation = visualAngle - Math.PI / 2;
        this.silJointMeshes[i].position.copyFrom(this.jointMeshes[i].position);
        this.silJointMeshes[i].rotation = this.jointMeshes[i].rotation;
        this.jointBodies[i].setTranslation({ x: end.x, y: end.y }, true);
      }
    }
  }

  public getSnapTarget(mousePos: Vec2): { point: Vec2, normal: Vec2, toi: number } | null {
    const cPos = this.clawBody.translation();
    const snapDir = new Vec2(mousePos.x - cPos.x, mousePos.y - cPos.y);
    const dirLen = snapDir.length();
    if (dirLen < 0.01) return null;
    snapDir.normalize();

    const filter = this.rapier.QueryFilterFlags.EXCLUDE_DYNAMIC | this.rapier.QueryFilterFlags.EXCLUDE_KINEMATIC;
    
    // 1. Direct raycast
    let ray = new this.rapier.Ray({ x: cPos.x, y: cPos.y }, { x: snapDir.x, y: snapDir.y });
    let hit = this.world.castRayAndGetNormal(ray, 30.0, true, filter);
    
    if (hit && hit.timeOfImpact > 0.1) {
      return {
        point: new Vec2(cPos.x + snapDir.x * hit.timeOfImpact, cPos.y + snapDir.y * hit.timeOfImpact),
        normal: new Vec2(hit.normal.x, hit.normal.y),
        toi: hit.timeOfImpact
      };
    }

    return null;
  }

  /** Pure IK solver - returns joint positions without mutating state */
  private solveIKStatic(base: Vec2, target: Vec2): Vec2[] {
    const L = 2.5;
    const maxDist = 3 * L;
    let dist = base.distanceTo(target);
    const t = target.clone();

    if (dist > maxDist) {
      const d = t.clone().sub(base).normalize();
      t.copy(base.clone().add(d.multiplyScalar(maxDist)));
      dist = maxDist;
    }

    const joints = [new Vec2(base.x, base.y), new Vec2(), new Vec2(), new Vec2(t.x, t.y)];

    let dir = t.clone().sub(base);
    if (dist < 0.001) {
      dir.set(0, 1);
      dist = 0.001;
    } else {
      dir.normalize();
    }

    if (dist >= maxDist - 0.01) {
      joints[1].lerpVectors(base, t, 1/3);
      joints[2].lerpVectors(base, t, 2/3);
    } else {
      const n1 = new Vec2(-dir.y, dir.x);
      const cosTheta = Math.max(-1, Math.min(1, (dist - L) / (2 * L)));
      const theta = Math.acos(cosTheta);

      joints[1].set(
        base.x + L * (dir.x * Math.cos(theta) + n1.x * Math.sin(theta)),
        base.y + L * (dir.y * Math.cos(theta) + n1.y * Math.sin(theta))
      );
      joints[2].set(
        t.x - L * dir.x * Math.cos(theta) + L * n1.x * Math.sin(theta),
        t.y - L * dir.y * Math.cos(theta) + L * n1.y * Math.sin(theta)
      );
    }
    return joints;
  }
}
