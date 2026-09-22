import {
  Component,
  EventEmitter,
  HostListener,
  Input,
  OnChanges,
  Output,
  SimpleChanges,
  ViewChild,
  computed,
  inject,
  signal,
} from '@angular/core';
import { DecimalPipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import {
  ImageCropperComponent,
  type ImageCroppedEvent,
  type ImageTransform,
  type CropperPosition,
} from 'ngx-image-cropper';
import type {
  CropData,
  CropSaveResult,
  PrintSize,
  SmartcropPhoto,
} from '../../../../core/models/smartcrop.model';
import { I18nService } from '../../../../core/services/i18n.service';

@Component({
  selector: 'app-smartcrop-crop-modal',
  standalone: true,
  imports: [DecimalPipe, FormsModule, ImageCropperComponent],
  templateUrl: './crop-modal.component.html',
  styleUrl: './crop-modal.component.scss',
})
export class SmartcropCropModalComponent implements OnChanges {
  readonly i18n = inject(I18nService);

  @ViewChild(ImageCropperComponent) cropperCmp?: ImageCropperComponent;

  @Input() photo: SmartcropPhoto | null = null;
  @Input() sizes: PrintSize[] = [];
  /** Fallback when sizes list is empty. */
  @Input() aspectRatio = 2 / 3;
  @Input() open = false;

  @Output() readonly closed = new EventEmitter<void>();
  @Output() readonly saved = new EventEmitter<CropSaveResult>();
  @Output() readonly resetAi = new EventEmitter<void>();

  readonly selectedSizeId = signal<string>('');
  readonly transform = signal<ImageTransform>({ scale: 1, rotate: 0 });
  readonly ready = signal(false);
  readonly loadFailed = signal(false);
  readonly cropperPos = signal<CropperPosition | undefined>(undefined);

  /** When false, do not restore previous crop_data (e.g. after size change). */
  private restoreExistingCrop = true;

  private lastCrop: ImageCroppedEvent | null = null;
  cropperKey = 0;

  readonly activeSize = computed(() => {
    const id = this.selectedSizeId();
    return this.sizes.find((s) => s.id === id) ?? this.sizes[0] ?? null;
  });

  readonly activeAspect = computed(() => {
    const size = this.activeSize();
    if (size) return Number(size.aspect_ratio) || this.aspectRatio;
    return this.aspectRatio;
  });

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['photo'] || changes['open'] || changes['sizes']) {
      if (this.open && this.photo) {
        this.syncSizeFromPhoto();
        this.resetCropperState(true);
      }
    }
  }

  private syncSizeFromPhoto(): void {
    const photo = this.photo;
    if (!photo || !this.sizes.length) {
      this.selectedSizeId.set('');
      return;
    }
    const match =
      this.sizes.find((s) => s.id === photo.size_id) ??
      this.sizes.find((s) => s.name === photo.target_size_name) ??
      this.sizes.find((s) => s.is_default) ??
      this.sizes[0];
    this.selectedSizeId.set(match.id);
  }

  private resetCropperState(restoreCrop: boolean): void {
    this.restoreExistingCrop = restoreCrop;
    this.lastCrop = null;
    this.ready.set(false);
    this.loadFailed.set(false);
    this.cropperPos.set(undefined);
    this.transform.set({
      scale: restoreCrop ? (this.photo?.crop_data?.zoom ?? 1) : 1,
      rotate: restoreCrop ? (this.photo?.crop_data?.rotation ?? 0) : 0,
    });
    this.cropperKey += 1;
  }

  onSizeChange(sizeId: string): void {
    if (!sizeId || sizeId === this.selectedSizeId()) return;
    this.selectedSizeId.set(sizeId);
    // New aspect ratio — rebuild cropper; don't keep old box.
    this.resetCropperState(false);
  }

  onImageCropped(event: ImageCroppedEvent): void {
    this.lastCrop = event;
  }

  onCropperReady(): void {
    this.ready.set(true);
    requestAnimationFrame(() => {
      this.cropperCmp?.onResize();
      if (!this.restoreExistingCrop) return;
      const existing = this.photo?.crop_data;
      if (existing && existing.width > 0 && existing.height > 0) {
        this.cropperPos.set({
          x1: existing.x,
          y1: existing.y,
          x2: existing.x + existing.width,
          y2: existing.y + existing.height,
        });
      }
    });
  }

  onTransformChange(t: ImageTransform): void {
    this.transform.set(t);
  }

  onLoadFailed(): void {
    this.loadFailed.set(true);
  }

  onZoomInput(event: Event): void {
    const scale = Number((event.target as HTMLInputElement).value);
    this.transform.update((t) => ({ ...t, scale }));
  }

  rotateLeft(): void {
    this.transform.update((t) => ({ ...t, rotate: ((t.rotate ?? 0) - 90) % 360 }));
  }

  rotateRight(): void {
    this.transform.update((t) => ({ ...t, rotate: ((t.rotate ?? 0) + 90) % 360 }));
  }

  @HostListener('document:keydown.escape')
  onEsc(): void {
    if (this.open) this.closed.emit();
  }

  async save(): Promise<void> {
    let event = this.lastCrop;
    if (this.cropperCmp) {
      try {
        const cropped = await this.cropperCmp.crop('blob');
        if (cropped) event = cropped;
      } catch {
        // fall back to last auto-crop event
      }
    }
    if (!event?.imagePosition) {
      this.closed.emit();
      return;
    }

    const { x1, y1, x2, y2 } = event.imagePosition;
    const width = Math.max(1, Math.round(x2 - x1));
    const height = Math.max(1, Math.round(y2 - y1));
    const x = Math.round(x1);
    const y = Math.round(y1);
    const t = this.transform();
    const size = this.activeSize();

    const cropData: CropData = {
      x,
      y,
      width,
      height,
      zoom: t.scale ?? 1,
      rotation: t.rotate ?? 0,
      focalPoint: { x: x + width / 2, y: y + height * 0.4 },
      isManuallyEdited: true,
    };

    let objectUrl = event.objectUrl ?? undefined;
    if (!objectUrl && event.blob) {
      objectUrl = URL.createObjectURL(event.blob);
    }

    this.saved.emit({
      cropData,
      objectUrl,
      blob: event.blob ?? undefined,
      sizeId: size?.id,
      sizeName: size?.name,
    });
  }
}
