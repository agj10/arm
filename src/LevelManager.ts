
import { UIManager } from './UIManager';
import { RobotArm } from './RobotArm';

export class LevelManager {
  private uiManager: UIManager;
  private robotArm: RobotArm;
  private state: 'FOREST' | 'FACTORY_ENTRANCE' | 'CONVEYOR' | 'TITLE' | 'DROP' | 'UNDERGROUND' = 'FOREST';
  private stateTimer: number = 0;

  constructor(uiManager: UIManager, robotArm: RobotArm) {
    this.uiManager = uiManager;
    this.robotArm = robotArm;
  }

  public update(deltaTime: number) {
    this.stateTimer += deltaTime;

    // A simple state machine for the prologue cutscene
    switch (this.state) {
      case 'FOREST':
        if (this.stateTimer > 3) { // After 3 seconds in forest
          this.state = 'FACTORY_ENTRANCE';
          this.stateTimer = 0;
          this.uiManager.showAreaTitle('무너진 공장');
          this.uiManager.showSubtitle('자연에 파묻힌 이 곳... 한때는 인류의 심장이었다.');
        }
        break;
      
      case 'FACTORY_ENTRANCE':
        if (this.stateTimer > 5) {
          this.state = 'CONVEYOR';
          this.stateTimer = 0;
          this.uiManager.clearSubtitle();
          // Assume the player has hopped on the conveyor belt
          this.uiManager.showSubtitle('컨베이어 벨트가 아직 작동하고 있다...', true);
        }
        break;
        
      case 'CONVEYOR':
        // Move the player's claw automatically to simulate conveyor belt
        this.robotArm.clawPos.x += 5 * deltaTime;
        
        if (this.stateTimer > 6) {
          this.state = 'TITLE';
          this.stateTimer = 0;
          this.uiManager.clearSubtitle();
          // Fade in game title
          this.uiManager.showAreaTitle('A R M'); 
        }
        break;
        
      case 'TITLE':
        this.robotArm.clawPos.x += 5 * deltaTime;
        if (this.stateTimer > 5) {
          this.state = 'DROP';
          this.stateTimer = 0;
          this.uiManager.showSubtitle('철컥.', false);
        }
        break;
        
      case 'DROP':
        // Conveyor belt breaks, player falls
        // We simulate this by simply moving the claw down rapidly, 
        // or detaching it.
        this.robotArm.clawPos.y -= 15 * deltaTime;
        if (this.stateTimer > 3) {
          this.state = 'UNDERGROUND';
          this.stateTimer = 0;
          this.uiManager.clearSubtitle();
          this.uiManager.showAreaTitle('공장 지하 구역');
        }
        break;
        
      case 'UNDERGROUND':
        // Prologue over, normal gameplay begins
        break;
    }
  }
}
