import * as THREE from 'three';
import type RAPIER from '@dimforge/rapier2d';

export class RobotArm {
  public bodyMesh: THREE.Mesh;
  public clawMesh: THREE.Mesh;
  private armMesh1: THREE.Mesh;
  private armMesh2: THREE.Mesh;
  private jointMesh: THREE.Mesh;

  public clawPos: THREE.Vector2;
  private rigidBody: RAPIER.RigidBody;
  
  private armLength1 = 2.0;
  private armLength2 = 2.0;

  constructor(scene: THREE.Scene, world: RAPIER.World, rapierModule: typeof RAPIER) {
    this.clawPos = new THREE.Vector2(0, 5); 

    // Rusted Metal Material
    const bodyMat = new THREE.MeshStandardMaterial({ color: 0x4a4a4a, roughness: 0.7, metalness: 0.8 });
    const armMat = new THREE.MeshStandardMaterial({ color: 0x5a5a5a, roughness: 0.6, metalness: 0.9 });
    const rustMat = new THREE.MeshStandardMaterial({ color: 0x8b5a2b, roughness: 0.9, metalness: 0.3 }); // Rust color for joints

    // Body
    this.bodyMesh = new THREE.Mesh(new THREE.SphereGeometry(0.8, 32, 32), bodyMat);
    this.bodyMesh.castShadow = true;
    scene.add(this.bodyMesh);

    // Claw
    this.clawMesh = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.5, 0.5), rustMat);
    this.clawMesh.castShadow = true;
    scene.add(this.clawMesh);

    // Arms
    const cylGeo = new THREE.CylinderGeometry(0.2, 0.2, 1, 16);
    cylGeo.translate(0, 0.5, 0); // Pivot at bottom

    this.armMesh1 = new THREE.Mesh(cylGeo, armMat);
    this.armMesh1.castShadow = true;
    scene.add(this.armMesh1);

    this.armMesh2 = new THREE.Mesh(cylGeo, armMat);
    this.armMesh2.castShadow = true;
    scene.add(this.armMesh2);

    this.jointMesh = new THREE.Mesh(new THREE.SphereGeometry(0.3, 16, 16), rustMat);
    scene.add(this.jointMesh);

    // Physics Body
    const rigidBodyDesc = rapierModule.RigidBodyDesc.dynamic().setTranslation(0, 0);
    this.rigidBody = world.createRigidBody(rigidBodyDesc);
    const colliderDesc = rapierModule.ColliderDesc.ball(0.8);
    world.createCollider(colliderDesc, this.rigidBody);
  }

  public update(mousePos: THREE.Vector2, isMouseDown: boolean) {
    if (!isMouseDown) {
      // Just a placeholder to use isMouseDown, actual attachment logic needed later
      // this.clawPos.y -= 0.1; 
    }
    // 1. Calculate Target Position (Point Symmetric to Claw)
    const targetX = this.clawPos.x - (mousePos.x - this.clawPos.x);
    const targetY = this.clawPos.y - (mousePos.y - this.clawPos.y);

    const currentPos = this.rigidBody.translation();
    
    // Apply spring force towards target
    const forceX = (targetX - currentPos.x) * 20.0;
    const forceY = (targetY - currentPos.y) * 20.0;
    
    this.rigidBody.wakeUp();

    // Damping
    const currentVel = this.rigidBody.linvel();
    this.rigidBody.setLinvel({ x: currentVel.x * 0.9, y: currentVel.y * 0.9 }, true);
    
    // Impulse
    this.rigidBody.applyImpulse({ x: forceX * 0.02, y: forceY * 0.02 }, true);

    // Sync mesh
    this.bodyMesh.position.set(currentPos.x, currentPos.y, 0);
    this.clawMesh.position.set(this.clawPos.x, this.clawPos.y, 0);

    this.updateIK();
  }

  private updateIK() {
    // 2-Bone IK
    const base = new THREE.Vector2(this.bodyMesh.position.x, this.bodyMesh.position.y);
    const target = this.clawPos.clone();
    
    const dist = base.distanceTo(target);
    const maxDist = this.armLength1 + this.armLength2;
    
    // If target is too far, stretch out completely
    let p1 = new THREE.Vector2();
    if (dist >= maxDist) {
      const dir = target.clone().sub(base).normalize();
      p1 = base.clone().add(dir.multiplyScalar(this.armLength1));
    } else {
      // Calculate elbow position
      const a = this.armLength1;
      const b = this.armLength2;
      const c = dist;
      
      // Law of cosines
      const angle1 = Math.acos((a*a + c*c - b*b) / (2 * a * c));
      const baseToTargetAngle = Math.atan2(target.y - base.y, target.x - base.x);
      
      const elbowAngle = baseToTargetAngle - angle1; // or + angle1 for other bending direction
      p1.x = base.x + Math.cos(elbowAngle) * a;
      p1.y = base.y + Math.sin(elbowAngle) * a;
    }

    // Update visuals
    this.jointMesh.position.set(p1.x, p1.y, 0);

    // Arm 1 (Body to Elbow)
    this.armMesh1.position.set(base.x, base.y, 0);
    this.armMesh1.scale.y = this.armLength1;
    this.armMesh1.rotation.z = Math.atan2(p1.y - base.y, p1.x - base.x) - Math.PI / 2;

    // Arm 2 (Elbow to Claw)
    this.armMesh2.position.set(p1.x, p1.y, 0);
    this.armMesh2.scale.y = base.distanceTo(target) > maxDist ? dist - this.armLength1 : this.armLength2;
    this.armMesh2.rotation.z = Math.atan2(target.y - p1.y, target.x - p1.x) - Math.PI / 2;
  }
}
