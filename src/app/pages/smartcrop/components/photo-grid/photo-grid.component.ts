import { Component, EventEmitter, Input, Output } from '@angular/core';
import type { SmartcropPhoto } from '../../../../core/models/smartcrop.model';
import { SmartcropPhotoCardComponent } from '../photo-card/photo-card.component';

@Component({
  selector: 'app-smartcrop-photo-grid',
  standalone: true,
  imports: [SmartcropPhotoCardComponent],
  templateUrl: './photo-grid.component.html',
  styleUrl: './photo-grid.component.scss',
})
export class SmartcropPhotoGridComponent {
  @Input() photos: SmartcropPhoto[] = [];
  @Input() selectedIds = new Set<string>();
  @Input() originalPreviewIds = new Set<string>();

  @Output() readonly toggleSelect = new EventEmitter<string>();
  @Output() readonly edit = new EventEmitter<SmartcropPhoto>();
  @Output() readonly remove = new EventEmitter<SmartcropPhoto>();
  @Output() readonly togglePreview = new EventEmitter<string>();
}
