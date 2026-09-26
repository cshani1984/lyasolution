import { Component, EventEmitter, Input, Output, inject } from '@angular/core';
import type { SmartcropPhoto } from '../../../../core/models/smartcrop.model';
import { I18nService } from '../../../../core/services/i18n.service';

@Component({
  selector: 'app-smartcrop-photo-card',
  standalone: true,
  templateUrl: './photo-card.component.html',
  styleUrl: './photo-card.component.scss',
})
export class SmartcropPhotoCardComponent {
  readonly i18n = inject(I18nService);

  @Input({ required: true }) photo!: SmartcropPhoto;
  @Input() selected = false;
  @Input() showOriginal = false;

  @Output() readonly toggleSelect = new EventEmitter<void>();
  @Output() readonly edit = new EventEmitter<void>();
  @Output() readonly remove = new EventEmitter<void>();
  @Output() readonly togglePreview = new EventEmitter<void>();

  previewUrl(): string {
    if (this.showOriginal) return this.photo.original_url;
    return this.photo.cropped_url || this.photo.original_url;
  }

  /** Print presentation ratio from saved crop box (falls back to 2:3). */
  frameAspect(): number {
    const c = this.photo?.crop_data;
    if (c?.width && c?.height) return c.width / c.height;
    return 2 / 3;
  }
}
