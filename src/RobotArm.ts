import * as THREE from 'three';
import type RAPIER from '@dimforge/rapier2d';

export class RobotArm {
  public bodyMesh: THREE.Mesh;
  public clawMesh: THREE.Mesh;
  
  private armMeshes: THREE.Mesh[] = [];
  private jointMeshes: THREE.Mesh[] = [];
  
  private joints: THREE.Vector2[] = [];
  private armLengths: number[] = [1.5, 1.5, 1.5]; // 3 segments

  public clawPos: THREE.Vector2;
  private rigidBody: RAPIER.RigidBody;
  
  constructor(scene: THREE.Scene, world: RAPIER.World, rapierModule: typeof RAPIER) {
    this.clawPos = new THREE.Vector2(0, 5); 

    // Rusted Metal Material
    const bodyMat = new THREE.MeshStandardMaterial({ color: 0x4a4a4a, roughness: 0.7, metalness: 0.8 });
    const armMat = new THREE.MeshStandardMaterial({ color: 0x5a5a5a, roughness: 0.6, metalness: 0.9 });
    const rustMat = new THREE.MeshStandardMaterial({ color: 0x8b5a2b, roughness: 0.9, metalness: 0.3 });

    // Body
    this.bodyMesh = new THREE.Mesh(new THREE.SphereGeometry(0.8, 32, 32), bodyMat);
    this.bodyMesh.castShadow = true;
    scene.add(this.bodyMesh);

    // Claw
    this.clawMesh = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.5, 0.5), rustMat);
    this.clawMesh.castShadow = true;
    scene.add(this.clawMesh);

    // Arms and Joints
    for (let i = 0; i < 3; i++) {
      const cylGeo = new THREE.CylinderGeometry(0.2, 0.2, 1, 16);
      cylGeo.translate(0, 0.5, 0); // Pivot at bottom
      const mesh = new THREE.Mesh(cylGeo, armMat);
      mesh.castShadow = true;
      scene.add(mesh);
      this.armMeshes.push(mesh);
      this.joints.push(new THREE.Vector2());
    }
    this.joints.push(new THREE.Vector2()); // 4 joints total (base, joint1, joint2, claw)

    // 2 visible joints between the 3 arms
    for (let i = 0; i < 2; i++) {
      const jMesh = new THREE.Mesh(new THREE.SphereGeometry(0.3, 16, 16), rustMat);
      scene.add(jMesh);
      this.jointMeshes.push(jMesh);
    }

    // Physics Body
    const rigidBodyDesc = rapierModule.RigidBodyDesc.dynamic().setTranslation(0, 0);
    this.rigidBody = world.createRigidBody(rigidBodyDesc);
    const colliderDesc = rapierModule.ColliderDesc.ball(0.8);
    world.createCollider(colliderDesc, this.rigidBody);
  }

  public update(mousePos: THREE.Vector2, isMouseDown: boolean) {
    if (isMouseDown) {
      // Allows moving the claw when clicked
      this.clawPos.x += (mousePos.x - this.clawPos.x) * 0.1;
      this.clawPos.y += (mousePos.y - this.clawPos.y) * 0.1;
    }

    const maxDist = this.armLengths.reduce((a, b) => a + b, 0);
    let clampedMousePos = mousePos.clone();
    
    // Clamp mouse distance to max arm length
    if (clampedMousePos.distanceTo(this.clawPos) > maxDist) {
      const dir = clampedMousePos.clone().sub(this.clawPos).normalize();
      clampedMousePos = this.clawPos.clone().add(dir.multiplyScalar(maxDist));
    }

    // 1. Calculate Target Position (Point Symmetric to Claw)
    const targetX = this.clawPos.x - (clampedMousePos.x - this.clawPos.x);
    const targetY = this.clawPos.y - (clampedMousePos.y - this.clawPos.y);

    // Instant Teleportation
    this.rigidBody.setTranslation({ x: targetX, y: targetY }, true);
    this.rigidBody.setLinvel({ x: 0, y: 0 }, true); // Stop momentum
    
    // Sync mesh
    this.bodyMesh.position.set(targetX, targetY, 0);
    this.clawMesh.position.set(this.clawPos.x, this.clawPos.y, 0);

    this.updateIK();
  }

  private updateIK() {
    const base = new THREE.Vector2(this.bodyMesh.position.x, this.bodyMesh.position.y);
    const target = this.clawPos.clone();
    
    // Initial setup if distance is large
    this.joints[0].copy(base);
    for(let i=1; i<4; i++) {
        // Just distribute them linearly to give FABRIK a good starting point
        this.joints[i].lerpVectors(base, target, i / 3);
    }

    // FABRIK Algorithm
    for (let iter = 0; iter < 10; iter++) {
      // Backward pass
      this.joints[3].copy(target);
      for (let i = 2; i >= 0; i--) {
        const dir = this.joints[i].clone().sub(this.joints[i+1]).normalize();
        this.joints[i].copy(this.joints[i+1].clone().add(dir.multiplyScalar(this.armLengths[i])));
      }
      
      // Forward pass
      this.joints[0].copy(base);
      for (let i = 1; i <= 3; i++) {
        const dir = this.joints[i].clone().sub(this.joints[i-1]).normalize();
        this.joints[i].copy(this.joints[i-1].clone().add(dir.multiplyScalar(this.armLengths[i-1])));
      }
    }

    // Update visuals
    for (let i = 0; i < 3; i++) {
      const start = this.joints[i];
      const end = this.joints[i+1];
      
      this.armMeshes[i].position.set(start.x, start.y, 0);
      this.armMeshes[i].scale.y = this.armLengths[i];
      this.armMeshes[i].rotation.z = Math.atan2(end.y - start.y, end.x - start.x) - Math.PI / 2;
      
      if (i < 2) {
        this.jointMeshes[i].position.set(end.x, end.y, 0);
      }
    }
  }
}
