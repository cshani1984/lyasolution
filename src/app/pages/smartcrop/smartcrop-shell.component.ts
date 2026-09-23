import { Component } from '@angular/core';
import { RouterOutlet } from '@angular/router';

/** Standalone SmartCrop app shell — no LYA site header/footer. */
@Component({
  selector: 'app-smartcrop-shell',
  standalone: true,
  imports: [RouterOutlet],
  template: `<div class="sc-app" dir="inherit"><router-outlet /></div>`,
  styles: [
    `
      :host {
        display: block;
        min-height: 100dvh;
        --sc-purple: #6236ff;
        --sc-purple-dark: #4b23d9;
        --sc-purple-soft: #f0ebff;
        --sc-green: #00a86b;
        --sc-green-soft: #e6f7ef;
        --sc-warn: #f59e0b;
        --sc-danger: #e11d48;
        --sc-bg: #f4f5f8;
        --sc-card: #ffffff;
        --sc-text: #1e2430;
        --sc-muted: #6b7280;
        --sc-border: rgba(30, 36, 48, 0.1);
        --sc-radius: 14px;
        --sc-shadow: 0 8px 28px rgba(30, 36, 48, 0.08);
        font-family: 'Heebo', system-ui, sans-serif;
        color: var(--sc-text);
        background: var(--sc-bg);
      }
      .sc-app {
        min-height: 100dvh;
      }
    `,
  ],
})
export class SmartcropShellComponent {}
