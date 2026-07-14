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
    const py = this.robotArm.clawPos.y;

    if (!this.initDone) {
      this.uiManager.showAreaTitle('외진 숲');
      this.initDone = true;
    }

    switch (this.state) {
      case 'FOREST':
        if (px > 120) { 
          this.state = 'FACTORY_ENTRANCE';
          this.uiManager.showAreaTitle('무너진 공장');
          this.uiManager.showSubtitle('자연에 파묻힌 이 곳... 컨베이어 벨트가 아직 작동하고 있다...', true);
        }
        break;
      
      case 'FACTORY_ENTRANCE':
        if (py < -20) { 
          this.state = 'DROP';
          this.uiManager.clearSubtitle();
          this.uiManager.showSubtitle('철컥.', false);
        }
        break;
        
      case 'DROP':
        if (py < -50) {
          this.state = 'UNDERGROUND';
          this.uiManager.clearSubtitle();
          this.uiManager.showAreaTitle('공장 지하 구역');
        }
        break;
        
      case 'UNDERGROUND':
        break;
    }
  }
}
