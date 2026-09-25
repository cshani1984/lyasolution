import { Component, EventEmitter, Input, Output, computed, inject, signal } from '@angular/core';
import { I18nService } from '../../../../core/services/i18n.service';

export interface StudioTutorialStep {
  titleKey: string;
  bodyKey: string;
  icon: string;
}

const STEPS: StudioTutorialStep[] = [
  {
    icon: 'chat',
    titleKey: 'smartcrop.tutorial.s1Title',
    bodyKey: 'smartcrop.tutorial.s1Body',
  },
  {
    icon: 'group',
    titleKey: 'smartcrop.tutorial.s2Title',
    bodyKey: 'smartcrop.tutorial.s2Body',
  },
  {
    icon: 'auto_fix_high',
    titleKey: 'smartcrop.tutorial.s3Title',
    bodyKey: 'smartcrop.tutorial.s3Body',
  },
  {
    icon: 'print',
    titleKey: 'smartcrop.tutorial.s4Title',
    bodyKey: 'smartcrop.tutorial.s4Body',
  },
];

@Component({
  selector: 'app-smartcrop-studio-tutorial',
  standalone: true,
  templateUrl: './studio-tutorial.component.html',
  styleUrl: './studio-tutorial.component.scss',
})
export class SmartcropStudioTutorialComponent {
  readonly i18n = inject(I18nService);
  readonly steps = STEPS;
  readonly index = signal(0);

  @Input() open = false;
  @Output() readonly closed = new EventEmitter<void>();

  readonly step = computed(() => this.steps[this.index()] ?? this.steps[0]);
  readonly isLast = computed(() => this.index() >= this.steps.length - 1);
  readonly progress = computed(() => ((this.index() + 1) / this.steps.length) * 100);

  next(): void {
    if (this.isLast()) {
      this.dismiss();
      return;
    }
    this.index.update((i) => Math.min(i + 1, this.steps.length - 1));
  }

  back(): void {
    this.index.update((i) => Math.max(0, i - 1));
  }

  dismiss(): void {
    this.index.set(0);
    this.closed.emit();
  }

  skip(): void {
    this.dismiss();
  }
}
