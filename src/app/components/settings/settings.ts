import { Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatSlideToggleModule } from '@angular/material/slide-toggle';

import { ThemeService } from '../../services/theme';

@Component({
  selector: 'app-settings',
  imports: [CommonModule, MatSlideToggleModule],
  templateUrl: './settings.html',
  styleUrl: './settings.scss'
})
export class Settings {
  private theme = inject(ThemeService);
  dark = this.theme.isDark();

  onToggle(dark: boolean) {
    this.theme.setTheme(dark ? 'dark' : 'light');
    this.dark = dark;
  }
}
