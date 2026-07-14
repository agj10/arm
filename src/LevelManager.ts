import { UIManager } from './UIManager';
import { RobotArm } from './RobotArm';

export class LevelManager {
  private uiManager: UIManager;
  private robotArm: RobotArm;
  private state: 'FOREST' | 'FACTORY_ENTRANCE' | 'CONVEYOR' | 'TITLE' | 'DROP' | 'UNDERGROUND' = 'FOREST';
  private timer: number = 0;
  private initDone: boolean = false;

  constructor(uiManager: UIManager, robotArm: RobotArm) {
    this.uiManager = uiManager;
    this.robotArm = robotArm;
  }

  public update(deltaTime: number) {
    const px = this.robotArm.clawPos.x;

    if (!this.initDone) {
      this.uiManager.showAreaTitle('외진 숲');
      this.initDone = true;
    }

    switch (this.state) {
      case 'FOREST':
        if (px > 30) { 
          this.state = 'FACTORY_ENTRANCE';
          this.uiManager.showAreaTitle('무너진 공장');
        }
        break;
      
      case 'FACTORY_ENTRANCE':
        if (px > 60) { 
          this.state = 'CONVEYOR';
          this.timer = 0;
          this.uiManager.showSubtitle('자연에 파묻힌 이 곳... 컨베이어 벨트가 아직 작동하고 있다...', true);
        }
        break;
        
      case 'CONVEYOR':
        this.robotArm.clawPos.x += 10 * deltaTime;
        
        this.timer += deltaTime;
        if (this.timer > 5) {
          this.state = 'TITLE';
          this.timer = 0;
          this.uiManager.clearSubtitle();
          this.uiManager.showAreaTitle('A R M'); 
        }
        break;
        
      case 'TITLE':
        this.robotArm.clawPos.x += 10 * deltaTime;
        
        this.timer += deltaTime;
        if (this.timer > 8) { 
          this.state = 'DROP';
          this.timer = 0;
          this.uiManager.showSubtitle('철컥.', false);
        }
        break;
        
      case 'DROP':
        this.robotArm.clawPos.y -= 25 * deltaTime;
        
        this.timer += deltaTime;
        if (this.timer > 3) {
          this.state = 'UNDERGROUND';
          this.timer = 0;
          this.uiManager.clearSubtitle();
          this.uiManager.showAreaTitle('공장 지하 구역');
        }
        break;
        
      case 'UNDERGROUND':
        break;
    }
  }
}
