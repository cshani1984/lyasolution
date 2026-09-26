import { Component, EventEmitter, Input, Output, inject } from '@angular/core';
import type { PrintSize } from '../../../../core/models/smartcrop.model';
import { I18nService } from '../../../../core/services/i18n.service';
import {
  PRINT_SIZE_CATEGORY_LABELS,
  groupPrintSizesByCategory,
  type PrintSizeCategory,
} from '../../../../core/smartcrop/print-sizes';

@Component({
  selector: 'app-smartcrop-batch-action-bar',
  standalone: true,
  templateUrl: './batch-action-bar.component.html',
  styleUrl: './batch-action-bar.component.scss',
})
export class SmartcropBatchActionBarComponent {
  readonly i18n = inject(I18nService);

  @Input() count = 0;
  @Input() sizes: PrintSize[] = [];

  @Output() readonly changeSize = new EventEmitter<string>();
  @Output() readonly approve = new EventEmitter<void>();
  @Output() readonly remove = new EventEmitter<void>();
  @Output() readonly clear = new EventEmitter<void>();

  sizeGroups() {
    return groupPrintSizesByCategory(this.sizes);
  }

  categoryLabel(category: PrintSizeCategory | 'other'): string {
    if (category === 'other') return this.i18n.lang() === 'he' ? 'אחר' : 'Other';
    const labels = PRINT_SIZE_CATEGORY_LABELS[category];
    return this.i18n.lang() === 'he' ? labels.he : labels.en;
  }

  onSizeChange(event: Event): void {
    const value = (event.target as HTMLSelectElement).value;
    if (value) this.changeSize.emit(value);
  }
}
