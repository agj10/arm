export class UIManager {
  private areaDisplay: HTMLElement;
  private subtitleDisplay: HTMLElement;
  private typingTimeout: any = null;

  constructor() {
    this.areaDisplay = document.getElementById('area-display')!;
    this.subtitleDisplay = document.getElementById('subtitle-display')!;
  }

  public showAreaTitle(title: string) {
    this.areaDisplay.textContent = title;
    this.areaDisplay.style.opacity = '1';
    
    setTimeout(() => {
      this.areaDisplay.style.opacity = '0';
    }, 4000);
  }

  public showSubtitle(text: string, typingEffect: boolean = true) {
    if (this.typingTimeout) {
      clearTimeout(this.typingTimeout);
    }
    
    if (!typingEffect) {
      this.subtitleDisplay.textContent = text;
      return;
    }

    this.subtitleDisplay.textContent = '';
    let i = 0;
    
    const typeWriter = () => {
      if (i < text.length) {
        this.subtitleDisplay.textContent += text.charAt(i);
        i++;
        this.typingTimeout = setTimeout(typeWriter, 50); // 50ms per character
      }
    };
    
    typeWriter();
  }

  public clearSubtitle() {
    this.subtitleDisplay.textContent = '';
    if (this.typingTimeout) {
      clearTimeout(this.typingTimeout);
    }
  }
}
