import { UIManager } from './UIManager';
import { RobotArm } from './RobotArm';

export class LevelManager {
  private uiManager: UIManager;
  private robotArm: RobotArm;
  private state: 'FOREST' | 'FACTORY_ENTRANCE' | 'CONVEYOR' | 'TITLE' | 'DROP' | 'UNDERGROUND' = 'FOREST';
  private initDone: boolean = false;

  constructor(uiManager: UIManager, robotArm: RobotArm) {
    this.uiManager = uiManager;
    this.robotArm = robotArm;
  }

  public update(_deltaTime: number) {
    const px = this.robotArm.clawPos.x;
    const py = this.robotArm.clawPos.y;

    if (!this.initDone) {
      this.uiManager.showAreaTitle('Sector 00');
      this.initDone = true;
    }

    switch (this.state) {
      case 'FOREST':
        if (px > 120) { 
          this.state = 'FACTORY_ENTRANCE';
          this.uiManager.showAreaTitle('Sector 01');
          this.uiManager.showSubtitle('SYSTEM ONLINE', true);
        }
        break;
      
      case 'FACTORY_ENTRANCE':
        if (py < -20) { 
          this.state = 'DROP';
          this.uiManager.clearSubtitle();
          this.uiManager.showSubtitle('CRITICAL ERROR', false);
        }
        break;
        
      case 'DROP':
        if (py < -1400) {
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
