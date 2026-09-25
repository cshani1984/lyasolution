import { Component, EventEmitter, Input, Output, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import type { PrintSize } from '../../../../core/models/smartcrop.model';
import { I18nService } from '../../../../core/services/i18n.service';

const ACCEPT = '.jpg,.jpeg,.png,.webp,.heic,.heif,image/jpeg,image/png,image/webp,image/heic,image/heif';

@Component({
  selector: 'app-smartcrop-file-uploader',
  standalone: true,
  imports: [FormsModule],
  templateUrl: './file-uploader.component.html',
  styleUrl: './file-uploader.component.scss',
})
export class SmartcropFileUploaderComponent {
  readonly i18n = inject(I18nService);
  readonly accept = ACCEPT;
  readonly dragging = signal(false);

  @Input() sizes: PrintSize[] = [];
  @Input() busy = false;
  @Input() sizeName = '10x15';

  @Output() readonly sizeNameChange = new EventEmitter<string>();
  @Output() readonly filesSelected = new EventEmitter<{ files: File[]; sizeName: string }>();

  onSizeChange(value: string): void {
    this.sizeName = value;
    this.sizeNameChange.emit(value);
  }

  onDragEnter(event: DragEvent): void {
    event.preventDefault();
    this.dragging.set(true);
  }

  onDragOver(event: DragEvent): void {
    event.preventDefault();
  }

  onDragLeave(): void {
    this.dragging.set(false);
  }

  onDrop(event: DragEvent): void {
    event.preventDefault();
    this.dragging.set(false);
    this.emitFiles(event.dataTransfer?.files ?? null);
  }

  onPick(event: Event): void {
    const input = event.target as HTMLInputElement;
    this.emitFiles(input.files);
    input.value = '';
  }

  private emitFiles(list: FileList | null): void {
    if (!list?.length || this.busy) return;
    const files = Array.from(list).filter(
      (f) => /^image\//i.test(f.type) || /\.(jpe?g|png|webp|heic|heif)$/i.test(f.name),
    );
    if (!files.length) return;
    this.filesSelected.emit({ files, sizeName: this.sizeName || '10x15' });
  }
}
