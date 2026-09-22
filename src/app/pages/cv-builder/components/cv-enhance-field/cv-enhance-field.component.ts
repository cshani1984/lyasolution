import { Component, inject, input, output, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import type { CvEnhanceField } from '../../../../core/models/cv-resume.model';
import { CvAiService } from '../../../../core/services/cv-ai.service';
import { I18nService } from '../../../../core/services/i18n.service';

@Component({
  selector: 'app-cv-enhance-field',
  standalone: true,
  imports: [FormsModule],
  templateUrl: './cv-enhance-field.component.html',
  styleUrl: './cv-enhance-field.component.scss',
})
export class CvEnhanceFieldComponent {
  readonly i18n = inject(I18nService);
  private readonly ai = inject(CvAiService);

  readonly value = input.required<string>();
  readonly valueChange = output<string>();
  readonly field = input.required<CvEnhanceField>();
  readonly rows = input(5);
  readonly placeholder = input('');

  readonly enhancing = signal(false);

  async enhance(): Promise<void> {
    if (this.enhancing() || !this.value().trim()) {
      return;
    }
    this.enhancing.set(true);
    try {
      const next = await this.ai.enhance(this.value(), this.field());
      this.valueChange.emit(next);
    } finally {
      this.enhancing.set(false);
    }
  }
}
