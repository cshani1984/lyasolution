import {
  Component,
  EventEmitter,
  HostListener,
  Input,
  OnChanges,
  OnDestroy,
  Output,
  SimpleChanges,
  ViewChild,
  computed,
  inject,
  signal,
} from '@angular/core';
import { DecimalPipe, isPlatformBrowser } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { PLATFORM_ID } from '@angular/core';
import {
  ImageCropperComponent,
  type ImageCroppedEvent,
  type ImageTransform,
  type CropperPosition,
  type LoadedImage,
  type Dimensions,
} from 'ngx-image-cropper';
import type {
  CropData,
  CropMetrics,
  CropSaveResult,
  PrintSize,
  SmartcropPhoto,
} from '../../../../core/models/smartcrop.model';
import { I18nService } from '../../../../core/services/i18n.service';
import { smartCropFromUrl } from '../../../../core/smartcrop/crop-engine.client';
import {
  PRINT_SIZE_CATEGORY_LABELS,
  getCalculatedAspectRatio,
  groupPrintSizesByCategory,
  orientAspectRatio,
  type PrintSizeCategory,
} from '../../../../core/smartcrop/print-sizes';

@Component({
  selector: 'app-smartcrop-crop-modal',
  standalone: true,
  imports: [DecimalPipe, FormsModule, ImageCropperComponent],
  templateUrl: './crop-modal.component.html',
  styleUrl: './crop-modal.component.scss',
})
export class SmartcropCropModalComponent implements OnChanges, OnDestroy {
  readonly i18n = inject(I18nService);
  private readonly platformId = inject(PLATFORM_ID);

  @ViewChild(ImageCropperComponent) cropperCmp?: ImageCropperComponent;

  @Input() photo: SmartcropPhoto | null = null;
  @Input() sizes: PrintSize[] = [];
  /** Fallback when sizes list is empty. */
  @Input() aspectRatio = 2 / 3;
  @Input() open = false;

  @Output() readonly closed = new EventEmitter<void>();
  @Output() readonly saved = new EventEmitter<CropSaveResult>();
  @Output() readonly resetAi = new EventEmitter<void>();
  /** Notes: Approve for printing without leaving the editor. */
  @Output() readonly approved = new EventEmitter<void>();
  /** Notes: Print size changed in the editor — parent should update photo + aspect. */
  @Output() readonly sizeChanged = new EventEmitter<{ sizeId: string; sizeName: string }>();

  readonly selectedSizeId = signal<string>('');
  readonly transform = signal<ImageTransform>({ scale: 1, rotate: 0 });
  readonly ready = signal(false);
  readonly loadFailed = signal(false);
  readonly cropperPos = signal<CropperPosition | undefined>(undefined);
  readonly aiRunning = signal(false);
  readonly originalSizeSig = signal<Dimensions | null>(null);
  private aiMetrics: CropMetrics | null = null;

  /** When true, restore previous crop box after ready (converted to display coords). */
  private restoreExistingCrop = true;

  private lastCrop: ImageCroppedEvent | null = null;
  private displayedSize: Dimensions | null = null;
  private lockedScrollY = 0;
  private bodyLocked = false;
  private readonly onDocWheel = (event: WheelEvent) => {
    if (!this.open) return;
    const target = event.target as HTMLElement | null;
    if (!target?.closest?.('.sc-modal__panel')) {
      event.preventDefault();
    }
  };
  private readonly onDocTouchMove = (event: TouchEvent) => {
    if (!this.open) return;
    const target = event.target as HTMLElement | null;
    if (!target?.closest?.('.sc-modal__panel')) {
      event.preventDefault();
    }
  };
  cropperKey = 0;

  /**
   * Two-way bridge for ngx-image-cropper [(transform)].
   */
  get transformModel(): ImageTransform {
    return this.transform();
  }
  set transformModel(value: ImageTransform) {
    this.transform.set(value ?? { scale: 1, rotate: 0 });
  }

  readonly activeSize = computed(() => {
    const id = this.selectedSizeId();
    return this.sizes.find((s) => s.id === id) ?? this.sizes[0] ?? null;
  });

  readonly activeAspect = computed(() => {
    const size = this.activeSize();
    const portrait = size ? getCalculatedAspectRatio(size, false) : this.aspectRatio;
    const dims = this.originalSizeSig();
    if (dims?.width && dims?.height) {
      return orientAspectRatio(portrait, dims.width, dims.height);
    }
    return portrait;
  });

  sizeGroups() {
    return groupPrintSizesByCategory(this.sizes);
  }

  categoryLabel(category: PrintSizeCategory | 'other'): string {
    if (category === 'other') return this.i18n.lang() === 'he' ? 'אחר' : 'Other';
    const labels = PRINT_SIZE_CATEGORY_LABELS[category];
    return this.i18n.lang() === 'he' ? labels.he : labels.en;
  }

  /** Remount key includes size so aspect changes always recreate the cropper. */
  readonly cropperTrackKey = computed(
    () => `${this.cropperKey}-${this.selectedSizeId()}-${this.activeAspect().toFixed(4)}`,
  );

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['open']) {
      if (this.open) this.lockBodyScroll();
      else this.unlockBodyScroll();
    }
    if (changes['photo'] || changes['open'] || changes['sizes']) {
      if (this.open && this.photo) {
        this.syncSizeFromPhoto();
        this.resetCropperState(true);
        // Recalculate cropper size after panel layout settles.
        setTimeout(() => this.cropperCmp?.onResize(), 80);
        setTimeout(() => this.cropperCmp?.onResize(), 220);
      }
    }
  }

  ngOnDestroy(): void {
    this.unlockBodyScroll();
  }

  /** Notes: Prevent the dashboard behind the dialog from scrolling. */
  private lockBodyScroll(): void {
    if (!isPlatformBrowser(this.platformId) || this.bodyLocked) return;
    const body = document.body;
    this.lockedScrollY = window.scrollY || document.documentElement.scrollTop || 0;
    body.classList.add('sc-crop-modal-open');
    body.style.position = 'fixed';
    body.style.top = `-${this.lockedScrollY}px`;
    body.style.left = '0';
    body.style.right = '0';
    body.style.width = '100%';
    body.style.overflow = 'hidden';
    document.addEventListener('wheel', this.onDocWheel, { passive: false });
    document.addEventListener('touchmove', this.onDocTouchMove, { passive: false });
    this.bodyLocked = true;
  }

  private unlockBodyScroll(): void {
    if (!isPlatformBrowser(this.platformId) || !this.bodyLocked) return;
    const body = document.body;
    body.classList.remove('sc-crop-modal-open');
    body.style.position = '';
    body.style.top = '';
    body.style.left = '';
    body.style.right = '';
    body.style.width = '';
    body.style.overflow = '';
    document.removeEventListener('wheel', this.onDocWheel);
    document.removeEventListener('touchmove', this.onDocTouchMove);
    window.scrollTo(0, this.lockedScrollY);
    this.bodyLocked = false;
  }

  /** Keep wheel inside the modal panel when it can scroll; otherwise block. */
  onWheel(event: WheelEvent): void {
    if (!this.open) return;
    const target = event.target as HTMLElement | null;
    const panel = target?.closest?.('.sc-modal__panel') as HTMLElement | null;
    if (!panel) {
      event.preventDefault();
      return;
    }
    const canScroll = panel.scrollHeight > panel.clientHeight + 1;
    if (!canScroll) {
      event.preventDefault();
      return;
    }
    const atTop = panel.scrollTop <= 0 && event.deltaY < 0;
    const atBottom = panel.scrollTop + panel.clientHeight >= panel.scrollHeight - 1 && event.deltaY > 0;
    if (atTop || atBottom) event.preventDefault();
  }

  onTouchMove(event: TouchEvent): void {
    if (!this.open) return;
    const target = event.target as HTMLElement | null;
    if (!target?.closest?.('.sc-modal__panel')) {
      event.preventDefault();
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
    this.aiMetrics = null;
    this.originalSizeSig.set(null);
    this.displayedSize = null;
    this.ready.set(false);
    this.loadFailed.set(false);
    this.cropperPos.set(undefined);
    // Always open at scale 1 so the full original fits in the stage.
    this.transform.set({
      scale: 1,
      rotate: restoreCrop ? (this.photo?.crop_data?.rotation ?? 0) : 0,
    });
    this.cropperKey += 1;
  }

  onImageLoaded(image: LoadedImage): void {
    this.originalSizeSig.set(image.original.size);
  }

  /**
   * Notes: cropperReady dimensions = displayed image size.
   * crop_data / AI results use original pixels — convert before applying.
   */
  onCropperReady(dimensions: Dimensions): void {
    this.displayedSize = dimensions;
    this.ready.set(true);
    requestAnimationFrame(() => {
      this.cropperCmp?.onResize();
      if (!this.restoreExistingCrop) return;
      const existing = this.photo?.crop_data;
      if (existing && existing.width > 0 && existing.height > 0) {
        this.applyOriginalCropBox({
          x1: existing.x,
          y1: existing.y,
          x2: existing.x + existing.width,
          y2: existing.y + existing.height,
        });
      }
    });
  }

  /**
   * Notes: AI Generator — detect faces and move crop frame smoothly (no remount / no toolbar reflow).
   */
  async runAiGenerate(): Promise<void> {
    if (!this.photo || this.aiRunning()) return;
    this.aiRunning.set(true);
    try {
      const result = await smartCropFromUrl(this.photo.original_url, this.activeAspect());
      this.aiMetrics = result.metrics;
      this.transform.set({ scale: 1, rotate: this.transform().rotate ?? 0 });
      this.applyOriginalCropBox({
        x1: result.cropData.x,
        y1: result.cropData.y,
        x2: result.cropData.x + result.cropData.width,
        y2: result.cropData.y + result.cropData.height,
      });
      requestAnimationFrame(() => this.cropperCmp?.onResize());
    } catch {
      // Keep editor usable.
    } finally {
      this.aiRunning.set(false);
    }
  }

  /** Convert original-image crop box → displayed cropper coordinates. */
  private applyOriginalCropBox(original: CropperPosition): void {
    const box = this.toDisplayedCropper(original);
    if (!box) return;
    this.cropperPos.set({ ...box });
  }

  private toDisplayedCropper(original: CropperPosition): CropperPosition | null {
    const orig = this.originalSizeSig();
    const disp = this.displayedSize;
    if (!orig?.width || !orig?.height || !disp?.width || !disp?.height) {
      // Fallback: assume 1:1 if sizes not ready yet (rare).
      return original;
    }
    const sx = disp.width / orig.width;
    const sy = disp.height / orig.height;
    return {
      x1: original.x1 * sx,
      y1: original.y1 * sy,
      x2: original.x2 * sx,
      y2: original.y2 * sy,
    };
  }

  onSizeChange(sizeId: string): void {
    if (!sizeId || sizeId === this.selectedSizeId()) return;
    this.selectedSizeId.set(sizeId);
    const size = this.sizes.find((s) => s.id === sizeId);
    if (size) {
      this.sizeChanged.emit({ sizeId: size.id, sizeName: size.name });
    }
    // Remount cropper so ngx-image-cropper picks up the new aspect ratio.
    this.resetCropperState(false);
    setTimeout(() => {
      this.cropperCmp?.onResize();
      void this.runAiGenerate();
    }, 160);
  }

  onImageCropped(event: ImageCroppedEvent): void {
    this.lastCrop = event;
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
    if (this.open && !this.aiRunning()) this.closed.emit();
  }

  async save(): Promise<void> {
    if (this.aiRunning()) return;
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

    // imagePosition is relative to the ORIGINAL image — store as-is.
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
      metrics: this.aiMetrics ?? {
        detectedType: this.photo?.crop_data?.metrics?.detectedType ?? 'saliency_landscape',
        confidenceScore: 100,
        cropLossPercentage: this.photo?.crop_data?.metrics?.cropLossPercentage ?? 0,
        headPaddingApplied: Boolean(this.photo?.crop_data?.metrics?.headPaddingApplied),
        hasTruncationRisk: this.photo?.crop_data?.metrics?.hasTruncationRisk ?? false,
      },
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
