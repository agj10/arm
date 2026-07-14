import * as THREE from 'three';
import * as RAPIER from '@dimforge/rapier2d';

export class RobotArm {
  public bodyMesh: THREE.Mesh;
  public clawMesh: THREE.Mesh;
  
  private armMeshes: THREE.Mesh[] = [];
  private jointMeshes: THREE.Mesh[] = [];
  
  private joints: THREE.Vector2[] = [];
  private armLengths: number[] = [2.5, 2.5, 2.5];

  public clawPos: THREE.Vector2;
  private rigidBody: RAPIER.RigidBody;

  private isAttached: boolean = true;
  private prevIsMouseDown: boolean = false;
  private prevBodyPos: THREE.Vector2 = new THREE.Vector2();
  private velocity: THREE.Vector2 = new THREE.Vector2();

  private rapier: typeof RAPIER;
  
  constructor(scene: THREE.Scene, world: RAPIER.World, rapierModule: typeof RAPIER) {
    this.rapier = rapierModule;
    this.clawPos = new THREE.Vector2(0, -5); // Start attached to floor top

    const bodyMat = new THREE.MeshStandardMaterial({ color: 0x4a4a4a, roughness: 0.7, side: THREE.DoubleSide });
    const armMat = new THREE.MeshStandardMaterial({ color: 0x5a5a5a, roughness: 0.6, side: THREE.DoubleSide });
    const rustMat = new THREE.MeshStandardMaterial({ color: 0x8b5a2b, roughness: 0.9, side: THREE.DoubleSide });

    // Use 2D Circle/Plane geometries
    this.bodyMesh = new THREE.Mesh(new THREE.CircleGeometry(0.8, 32), bodyMat);
    this.bodyMesh.position.z = 0.2;
    this.bodyMesh.castShadow = true;
    scene.add(this.bodyMesh);

    this.clawMesh = new THREE.Mesh(new THREE.PlaneGeometry(1.2, 1.2), rustMat);
    this.clawMesh.position.z = 0.1;
    this.clawMesh.castShadow = true;
    scene.add(this.clawMesh);

    for (let i = 0; i < 3; i++) {
      const cylGeo = new THREE.PlaneGeometry(0.5, 1);
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
      const jMesh = new THREE.Mesh(new THREE.CircleGeometry(0.4, 16), rustMat);
      jMesh.position.z = 0.18;
      scene.add(jMesh);
      this.jointMeshes.push(jMesh);
    }

    const rigidBodyDesc = rapierModule.RigidBodyDesc.dynamic().setTranslation(0, -1);
    this.rigidBody = world.createRigidBody(rigidBodyDesc);
    const colliderDesc = rapierModule.ColliderDesc.ball(0.8).setRestitution(0.2);
    world.createCollider(colliderDesc, this.rigidBody);
  }

  private clawVelocity: THREE.Vector2 = new THREE.Vector2();

  public update(mousePos: THREE.Vector2, isMouseDown: boolean) {
    if (this.isAttached) {
      this.rigidBody.setBodyType(this.rapier.RigidBodyType.KinematicPositionBased, true);

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
        this.rigidBody.setBodyType(this.rapier.RigidBodyType.Dynamic, true);
        // Throw!
        this.rigidBody.setLinvel({ x: this.velocity.x, y: this.velocity.y }, true);
      }
    } else {
      // Flying
      const currentPos = this.rigidBody.translation();
      const currentVel = this.rigidBody.linvel();
      
      const trailVector = new THREE.Vector2(-currentVel.x, -currentVel.y);
      if (trailVector.length() > 0.1) {
        trailVector.normalize().multiplyScalar(5);
      } else {
        trailVector.set(0, 5); // Straight up if very slow
      }
      
      // Smoothly interpolate claw towards trailing position instead of teleporting
      const targetClawPos = new THREE.Vector2(currentPos.x + trailVector.x, currentPos.y + trailVector.y);
      const diff = targetClawPos.sub(this.clawPos);
      this.clawVelocity.add(diff.multiplyScalar(0.05));
      this.clawVelocity.multiplyScalar(0.85); // damping
      this.clawPos.add(this.clawVelocity);
      
      // Simple floor collision check
      // Body radius is 0.8. Floor top is -5. 
      if (currentPos.y <= -4.1) { // Hit floor
        this.isAttached = true;
        this.clawPos.set(currentPos.x, -5); // attach to floor top
        this.clawVelocity.set(0, 0);
        this.prevBodyPos.set(currentPos.x, currentPos.y);
      }
    }

    this.prevIsMouseDown = isMouseDown;
    
    // Sync body visual
    const pos = this.rigidBody.translation();
    this.bodyMesh.position.set(pos.x, pos.y, 0.2);
    this.clawMesh.position.set(this.clawPos.x, this.clawPos.y, 0.1);

    this.updateIK();
  }

  private updateIK() {
    const base = new THREE.Vector2(this.bodyMesh.position.x, this.bodyMesh.position.y);
    const target = this.clawPos.clone();
    const L = 2.5; // Fixed segment length
    let dist = base.distanceTo(target);
    const maxDist = 3 * L;

    // Visually clamp claw if physics drift causes it to exceed max length
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
      // Straight line
      this.joints[1].lerpVectors(base, target, 1/3);
      this.joints[2].lerpVectors(base, target, 2/3);
    } else {
      // Exact 3-segment symmetric IK (Trapezoid folding)
      const n = new THREE.Vector2(-dir.y, dir.x); 
      
      // Calculate theta for symmetric folding
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

    // Update visuals
    for (let i = 0; i < 3; i++) {
      const start = this.joints[i];
      const end = this.joints[i+1];
      
      this.armMeshes[i].position.set(start.x, start.y, 0.15);
      this.armMeshes[i].scale.y = L; // Constant length!
      this.armMeshes[i].rotation.z = Math.atan2(end.y - start.y, end.x - start.x) - Math.PI / 2;
      
      if (i < 2) {
        this.jointMeshes[i].position.set(end.x, end.y, 0.18);
      }
    }
  }
}
