import * as THREE from 'three';
import * as RAPIER from '@dimforge/rapier2d';

export class RobotArm {
  public bodyMesh: THREE.Mesh;
  public clawMesh: THREE.Mesh;
  
  private armMeshes: THREE.Mesh[] = [];
  private jointMeshes: THREE.Mesh[] = [];
  
  private joints: THREE.Vector2[] = [];
  private armLengths: number[] = [1.5, 1.5, 1.5];

  public clawPos: THREE.Vector2;
  private rigidBody: RAPIER.RigidBody;

  private isAttached: boolean = true;
  private prevIsMouseDown: boolean = false;
  private prevBodyPos: THREE.Vector2 = new THREE.Vector2();
  private velocity: THREE.Vector2 = new THREE.Vector2();
  
  constructor(scene: THREE.Scene, world: RAPIER.World, rapierModule: typeof RAPIER) {
    this.clawPos = new THREE.Vector2(0, -4); // Start attached to floor

    const bodyMat = new THREE.MeshStandardMaterial({ color: 0x4a4a4a, roughness: 0.7, side: THREE.DoubleSide });
    const armMat = new THREE.MeshStandardMaterial({ color: 0x5a5a5a, roughness: 0.6, side: THREE.DoubleSide });
    const rustMat = new THREE.MeshStandardMaterial({ color: 0x8b5a2b, roughness: 0.9, side: THREE.DoubleSide });

    // Use 2D Circle/Plane geometries
    this.bodyMesh = new THREE.Mesh(new THREE.CircleGeometry(0.8, 32), bodyMat);
    this.bodyMesh.position.z = 0.2;
    this.bodyMesh.castShadow = true;
    scene.add(this.bodyMesh);

    this.clawMesh = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), rustMat);
    this.clawMesh.position.z = 0.1;
    this.clawMesh.castShadow = true;
    scene.add(this.clawMesh);

    for (let i = 0; i < 3; i++) {
      const cylGeo = new THREE.PlaneGeometry(0.4, 1);
      cylGeo.translate(0, 0.5, 0); 
      const mesh = new THREE.Mesh(cylGeo, armMat);
      mesh.position.z = 0.15;
      mesh.castShadow = true;
      scene.add(mesh);
      this.armMeshes.push(mesh);
      this.joints.push(new THREE.Vector2());
    }
    this.joints.push(new THREE.Vector2()); 

    for (let i = 0; i < 2; i++) {
      const jMesh = new THREE.Mesh(new THREE.CircleGeometry(0.3, 16), rustMat);
      jMesh.position.z = 0.18;
      scene.add(jMesh);
      this.jointMeshes.push(jMesh);
    }

    const rigidBodyDesc = rapierModule.RigidBodyDesc.dynamic().setTranslation(0, 0);
    this.rigidBody = world.createRigidBody(rigidBodyDesc);
    const colliderDesc = rapierModule.ColliderDesc.ball(0.8).setRestitution(0.2);
    world.createCollider(colliderDesc, this.rigidBody);
  }

  public update(mousePos: THREE.Vector2, isMouseDown: boolean) {
    if (this.isAttached) {
      this.rigidBody.setBodyType(RAPIER.RigidBodyType.KinematicPositionBased, true);

      // Body follows mouse symmetrically
      const maxDist = this.armLengths.reduce((a, b) => a + b, 0);
      let clampedMousePos = mousePos.clone();
      if (clampedMousePos.distanceTo(this.clawPos) > maxDist) {
        const dir = clampedMousePos.clone().sub(this.clawPos).normalize();
        clampedMousePos = this.clawPos.clone().add(dir.multiplyScalar(maxDist));
      }

      const targetX = this.clawPos.x - (clampedMousePos.x - this.clawPos.x);
      const targetY = this.clawPos.y - (clampedMousePos.y - this.clawPos.y);

      this.rigidBody.setTranslation({ x: targetX, y: targetY }, true);
      this.rigidBody.setLinvel({ x: 0, y: 0 }, true);

      // Track velocity
      this.velocity.x = (targetX - this.prevBodyPos.x) / 0.016;
      this.velocity.y = (targetY - this.prevBodyPos.y) / 0.016;
      this.prevBodyPos.set(targetX, targetY);

      // Swing Release
      if (this.prevIsMouseDown && !isMouseDown) {
        this.isAttached = false;
        this.rigidBody.setBodyType(RAPIER.RigidBodyType.Dynamic, true);
        // Throw!
        this.rigidBody.setLinvel({ x: this.velocity.x, y: this.velocity.y }, true);
      }
    } else {
      // Flying
      const currentPos = this.rigidBody.translation();
      // Claw trails behind the body loosely
      this.clawPos.lerp(new THREE.Vector2(currentPos.x - this.velocity.x * 0.05, currentPos.y + 1), 0.2);
      
      // Simple floor collision check
      // Body radius is 0.8. Floor top is -5. 
      if (currentPos.y <= -4.1) { // Hit floor
        this.isAttached = true;
        this.clawPos.set(currentPos.x, -5); // attach to floor top
        // Prevent velocity spike on next frame
        this.prevBodyPos.set(currentPos.x, currentPos.y);
      }
    }

    this.prevIsMouseDown = isMouseDown;

    // Sync mesh
    const pos = this.rigidBody.translation();
    this.bodyMesh.position.set(pos.x, pos.y, 0.2);
    this.clawMesh.position.set(this.clawPos.x, this.clawPos.y, 0.1);

    this.updateIK();
  }

  private updateIK() {
    const base = new THREE.Vector2(this.bodyMesh.position.x, this.bodyMesh.position.y);
    const target = this.clawPos.clone();
    const dist = base.distanceTo(target);
    const maxDist = this.armLengths.reduce((a, b) => a + b, 0);

    this.joints[0].copy(base);
    this.joints[3].copy(target);

    if (dist >= maxDist - 0.01) {
      // Straight line
      this.joints[1].lerpVectors(base, target, 1/3);
      this.joints[2].lerpVectors(base, target, 2/3);
    } else {
      // Bezier curve for smooth bending
      const mid = base.clone().add(target).multiplyScalar(0.5);
      const dir = target.clone().sub(base).normalize();
      const normal = new THREE.Vector2(-dir.y, dir.x);
      
      // Curve height proportional to how compressed it is
      const height = Math.sqrt(maxDist * maxDist - dist * dist) * 0.4;
      const control = mid.add(normal.multiplyScalar(height));

      // Quadratic bezier sampling
      for (let i = 1; i <= 2; i++) {
        const t = i / 3.0;
        const mt = 1 - t;
        this.joints[i].set(
          mt * mt * base.x + 2 * mt * t * control.x + t * t * target.x,
          mt * mt * base.y + 2 * mt * t * control.y + t * t * target.y
        );
      }
    }

    // Update visuals
    for (let i = 0; i < 3; i++) {
      const start = this.joints[i];
      const end = this.joints[i+1];
      
      this.armMeshes[i].position.set(start.x, start.y, 0.15);
      this.armMeshes[i].scale.y = start.distanceTo(end);
      this.armMeshes[i].rotation.z = Math.atan2(end.y - start.y, end.x - start.x) - Math.PI / 2;
      
      if (i < 2) {
        this.jointMeshes[i].position.set(end.x, end.y, 0.18);
      }
    }
  }
}
