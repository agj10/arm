import * as PIXI from 'pixi.js';
import * as RAPIER from '@dimforge/rapier2d';
import { Vec2 } from './Vec2';

export class RobotArm {
  public bodyMesh: PIXI.Graphics;
  public clawMesh: PIXI.Graphics;
  
  private armMeshes: PIXI.Graphics[] = [];
  private jointMeshes: PIXI.Graphics[] = [];
  
  public clawPos: Vec2;
  private rigidBody: RAPIER.RigidBody;
  private clawBody: RAPIER.RigidBody;

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

    // Create Base
    const rigidBodyDesc = rapierModule.RigidBodyDesc.dynamic().setTranslation(0, -1);
    this.rigidBody = world.createRigidBody(rigidBodyDesc);
    const colliderDesc = rapierModule.ColliderDesc.ball(0.8).setMass(2.0).setSensor(true);
    world.createCollider(colliderDesc, this.rigidBody);

    this.bodyMesh = new PIXI.Graphics();
    this.bodyMesh.circle(0, 0, 0.8 * 40).fill(0x4a4a4a);
    container.addChild(this.bodyMesh);

    let prevBody = this.rigidBody;
    let currentY = -1 - 0.8; // Bottom of the base

    // Arm 1
    const arm1Desc = rapierModule.RigidBodyDesc.dynamic().setTranslation(0, currentY - 1.25);
    const arm1Body = world.createRigidBody(arm1Desc);
    const arm1Col = rapierModule.ColliderDesc.cuboid(0.25, 1.25).setMass(0.5).setSensor(true);
    world.createCollider(arm1Col, arm1Body);
    world.createImpulseJoint(rapierModule.JointData.revolute({x:0, y:-0.8}, {x:0, y:1.25}), prevBody, arm1Body, true);
    this.armBodies.push(arm1Body);
    prevBody = arm1Body;
    currentY -= 2.5;

    // Joint 1
    const j1Desc = rapierModule.RigidBodyDesc.dynamic().setTranslation(0, currentY);
    const j1Body = world.createRigidBody(j1Desc);
    const j1Col = rapierModule.ColliderDesc.ball(0.4).setMass(0.2).setSensor(true);
    world.createCollider(j1Col, j1Body);
    world.createImpulseJoint(rapierModule.JointData.revolute({x:0, y:-1.25}, {x:0, y:0}), prevBody, j1Body, true);
    this.jointBodies.push(j1Body);
    prevBody = j1Body;

    // Arm 2
    const arm2Desc = rapierModule.RigidBodyDesc.dynamic().setTranslation(0, currentY - 1.25);
    const arm2Body = world.createRigidBody(arm2Desc);
    const arm2Col = rapierModule.ColliderDesc.cuboid(0.25, 1.25).setMass(0.5).setSensor(true);
    world.createCollider(arm2Col, arm2Body);
    world.createImpulseJoint(rapierModule.JointData.revolute({x:0, y:0}, {x:0, y:1.25}), prevBody, arm2Body, true);
    this.armBodies.push(arm2Body);
    prevBody = arm2Body;
    currentY -= 2.5;

    // Joint 2
    const j2Desc = rapierModule.RigidBodyDesc.dynamic().setTranslation(0, currentY);
    const j2Body = world.createRigidBody(j2Desc);
    const j2Col = rapierModule.ColliderDesc.ball(0.4).setMass(0.2).setSensor(true);
    world.createCollider(j2Col, j2Body);
    world.createImpulseJoint(rapierModule.JointData.revolute({x:0, y:-1.25}, {x:0, y:0}), prevBody, j2Body, true);
    this.jointBodies.push(j2Body);
    prevBody = j2Body;

    // Arm 3
    const arm3Desc = rapierModule.RigidBodyDesc.dynamic().setTranslation(0, currentY - 1.25);
    const arm3Body = world.createRigidBody(arm3Desc);
    const arm3Col = rapierModule.ColliderDesc.cuboid(0.25, 1.25).setMass(0.5).setSensor(true);
    world.createCollider(arm3Col, arm3Body);
    world.createImpulseJoint(rapierModule.JointData.revolute({x:0, y:0}, {x:0, y:1.25}), prevBody, arm3Body, true);
    this.armBodies.push(arm3Body);
    prevBody = arm3Body;
    currentY -= 2.5;

    // Claw
    const clawDesc = rapierModule.RigidBodyDesc.dynamic().setTranslation(0, currentY - 0.6).setLinearDamping(0.5);
    this.clawBody = world.createRigidBody(clawDesc);
    const clawCol = rapierModule.ColliderDesc.cuboid(0.6, 0.6).setMass(0.5); // NOT a sensor
    world.createCollider(clawCol, this.clawBody);
    world.createImpulseJoint(rapierModule.JointData.revolute({x:0, y:-1.25}, {x:0, y:0.6}), prevBody, this.clawBody, true);

    this.clawMesh = new PIXI.Graphics();
    this.clawMesh.rect(-0.6 * 40, -0.6 * 40, 1.2 * 40, 1.2 * 40).fill(0x8b5a2b);
    container.addChild(this.clawMesh);

    // Create Graphics for Arms and Joints
    for (let i = 0; i < 3; i++) {
      const arm = new PIXI.Graphics();
      arm.rect(-0.25 * 40, -1.25 * 40, 0.5 * 40, 2.5 * 40).fill(0x5a5a5a);
      container.addChild(arm);
      this.armMeshes.push(arm);
    }
    for (let i = 0; i < 2; i++) {
      const jMesh = new PIXI.Graphics();
      jMesh.circle(0, 0, 0.4 * 40).fill(0x8b5a2b);
      container.addChild(jMesh);
      this.jointMeshes.push(jMesh);
    }
  }

  public update(mousePos: Vec2, isMouseDown: boolean) {
    if (this.isAttached) {
      this.clawBody.setBodyType(this.rapier.RigidBodyType.KinematicPositionBased, true);
      // Keep claw perfectly fixed at clawPos
      this.clawBody.setTranslation({ x: this.clawPos.x, y: this.clawPos.y }, true);
      this.clawBody.setRotation(0, true);

      if (isMouseDown) {
        // Natural swing: apply a continuous pulling force toward the opposite side of mouse drag
        const pullX = this.clawPos.x - mousePos.x;
        const pullY = this.clawPos.y - mousePos.y;
        this.rigidBody.applyForce({ x: pullX * 40, y: pullY * 40 }, true);
      }

      if (this.prevIsMouseDown && !isMouseDown) {
        this.isAttached = false;
        this.clawBody.setBodyType(this.rapier.RigidBodyType.Dynamic, true);
        
        // Massive impulse to fly!
        const pullX = this.clawPos.x - mousePos.x;
        const pullY = this.clawPos.y - mousePos.y;
        this.rigidBody.applyImpulse({ x: pullX * 250, y: pullY * 250 }, true);
      }
    } else {
      // Flying - Everything is dynamic and swings naturally!
      const cPos = this.clawBody.translation();
      this.clawPos.set(cPos.x, cPos.y);

      if (isMouseDown && !this.prevIsMouseDown) { 
        const dir = mousePos.clone().sub(this.clawPos);
        if (dir.lengthSq() > 0.001) {
          dir.normalize();
          const ray = new this.rapier.Ray({ x: this.clawPos.x, y: this.clawPos.y }, { x: dir.x, y: dir.y });
          const hit = this.world.castRay(ray, 15, true, this.rapier.QueryFilterFlags.EXCLUDE_DYNAMIC);
          
          if (hit && !isNaN((hit as any).toi)) {
            const hitPoint = new Vec2(
              ray.origin.x + ray.dir.x * (hit as any).toi,
              ray.origin.y + ray.dir.y * (hit as any).toi
            );
            this.isAttached = true;
            this.clawPos.set(hitPoint.x, hitPoint.y);
            this.clawBody.setTranslation({ x: hitPoint.x, y: hitPoint.y }, true);
            this.clawBody.setLinvel({ x: 0, y: 0 }, true);
            this.clawBody.setAngvel(0, true);
          }
        }
      }
      
      const bodyPos = this.rigidBody.translation();
      // Auto-attach triggers
      if (bodyPos.y <= -4.1 && bodyPos.x < 155) { 
        this.isAttached = true;
        this.clawPos.set(bodyPos.x, -5); 
        this.clawBody.setTranslation({ x: bodyPos.x, y: -5 }, true);
        this.clawBody.setLinvel({ x: 0, y: 0 }, true);
        this.clawBody.setAngvel(0, true);
      } else if (bodyPos.y <= -1499.1 && bodyPos.x >= 150) { 
        this.isAttached = true;
        this.clawPos.set(bodyPos.x, -1500);
        this.clawBody.setTranslation({ x: bodyPos.x, y: -1500 }, true);
        this.clawBody.setLinvel({ x: 0, y: 0 }, true);
        this.clawBody.setAngvel(0, true);
      }
    }

    this.prevIsMouseDown = isMouseDown;
    
    // SYNC VISUALS PERFECTLY WITH PHYSICS
    const bPos = this.rigidBody.translation();
    this.bodyMesh.position.set(bPos.x * 40, -bPos.y * 40); 
    this.bodyMesh.rotation = -this.rigidBody.rotation(); // Rapier uses +CCW, Pixi +CW

    const cPos = this.clawBody.translation();
    this.clawMesh.position.set(cPos.x * 40, -cPos.y * 40);
    this.clawMesh.rotation = -this.clawBody.rotation();

    for (let i = 0; i < 3; i++) {
      const aPos = this.armBodies[i].translation();
      this.armMeshes[i].position.set(aPos.x * 40, -aPos.y * 40);
      this.armMeshes[i].rotation = -this.armBodies[i].rotation();
    }
    for (let i = 0; i < 2; i++) {
      const jPos = this.jointBodies[i].translation();
      this.jointMeshes[i].position.set(jPos.x * 40, -jPos.y * 40);
      this.jointMeshes[i].rotation = -this.jointBodies[i].rotation();
    }
  }
}
