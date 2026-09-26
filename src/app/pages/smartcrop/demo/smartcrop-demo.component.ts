import { Component, OnDestroy, OnInit, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import type { CropSaveResult, SmartcropPhoto } from '../../../core/models/smartcrop.model';
import {
  DEMO_PRINT_SIZES,
  applyClientCrop,
  createDemoPhotos,
  findPrintSize,
  getCalculatedAspectRatio,
} from '../../../core/data/smartcrop-demo.data';
import { I18nService } from '../../../core/services/i18n.service';
import { SmartcropApiService } from '../../../core/services/smartcrop-api.service';
import { smartCropFromUrl, smartCropJpeg } from '../../../core/smartcrop/crop-engine.client';
import { CROP_LOSS_WARN_PERCENT, photoStatusFromAutoCrop } from '../../../core/smartcrop/crop-engine.math';
import {
  DEFAULT_SUPPORT_WA,
  TIER_CONFIGS,
  type SubscriptionTier,
} from '../../../core/smartcrop/subscriptions';
import {
  PRINT_SIZE_CATEGORY_LABELS,
  defaultPrintSize,
  groupPrintSizesByCategory,
  type PrintSizeCategory,
} from '../../../core/smartcrop/print-sizes';
import { SmartcropPhotoCardComponent } from '../components/photo-card/photo-card.component';
import { SmartcropCropModalComponent } from '../components/crop-modal/crop-modal.component';
import { SmartcropFileUploaderComponent } from '../components/file-uploader/file-uploader.component';
import { SmartcropPhotoComparisonCardComponent } from '../components/photo-comparison-card/photo-comparison-card.component';
import { SmartcropQuotaExceededModalComponent } from '../components/quota-exceeded-modal/quota-exceeded-modal.component';

@Component({
  selector: 'app-smartcrop-demo',
  standalone: true,
  imports: [
    FormsModule,
    RouterLink,
    SmartcropPhotoCardComponent,
    SmartcropCropModalComponent,
    SmartcropFileUploaderComponent,
    SmartcropPhotoComparisonCardComponent,
    SmartcropQuotaExceededModalComponent,
  ],
  templateUrl: './smartcrop-demo.component.html',
  styleUrl: './smartcrop-demo.component.scss',
})
export class SmartcropDemoComponent implements OnInit, OnDestroy {
  readonly i18n = inject(I18nService);
  readonly api = inject(SmartcropApiService);
  readonly sizes = DEMO_PRINT_SIZES;
  readonly tiers = TIER_CONFIGS;
  readonly tierKeys: SubscriptionTier[] = ['demo', 'basic', 'pro'];

  readonly photos = signal<SmartcropPhoto[]>([]);
  readonly selectedIds = signal(new Set<string>());
  readonly originalPreviewIds = signal(new Set<string>());
  readonly sizeFilter = signal('all');
  readonly editingPhoto = signal<SmartcropPhoto | null>(null);
  readonly comparePhoto = signal<SmartcropPhoto | null>(null);
  readonly busy = signal(false);
  readonly aiBusy = signal(false);
  readonly generativeBusy = signal(false);
  readonly toast = signal<string | null>(null);
  readonly editingIndex = signal(0);
  readonly uploadSizeName = signal(defaultPrintSize().name);

  readonly selectedTier = signal<SubscriptionTier>('demo');
  readonly aiUsed = signal(0);
  readonly showQuotaModal = signal(false);
  readonly quotaSupportUrl = signal(DEFAULT_SUPPORT_WA);

  private readonly blobUrls = new Set<string>();

  readonly tierMax = computed(() => TIER_CONFIGS[this.selectedTier()].maxMonthlyGenerativeAI);

  readonly filteredPhotos = computed(() => {
    const size = this.sizeFilter();
    return this.photos().filter((p) => (size === 'all' ? true : p.target_size_name === size));
  });

  readonly editingAspect = computed(() => {
    const photo = this.editingPhoto();
    if (!photo) return 2 / 3;
    const size =
      findPrintSize(this.sizes, photo.size_id) ||
      findPrintSize(this.sizes, photo.target_size_name) ||
      this.sizes[0];
    return size ? getCalculatedAspectRatio(size, false) : 2 / 3;
  });

  readonly compareAspect = computed(() => {
    const photo = this.comparePhoto();
    if (!photo) return 2 / 3;
    const size =
      findPrintSize(this.sizes, photo.size_id) ||
      findPrintSize(this.sizes, photo.target_size_name) ||
      this.sizes[0];
    return size ? getCalculatedAspectRatio(size, false) : 2 / 3;
  });

  sizeGroups() {
    return groupPrintSizesByCategory(this.sizes);
  }

  categoryLabel(category: PrintSizeCategory | 'other'): string {
    if (category === 'other') return this.i18n.lang() === 'he' ? 'אחר' : 'Other';
    const labels = PRINT_SIZE_CATEGORY_LABELS[category];
    return this.i18n.lang() === 'he' ? labels.he : labels.en;
  }

  async ngOnInit(): Promise<void> {
    const list = createDemoPhotos();
    this.photos.set(list);
    this.busy.set(true);
    this.aiBusy.set(true);
    this.toast.set(this.i18n.t('smartcrop.studio.aiWorking'));
    const next: SmartcropPhoto[] = [];
    for (const photo of list) {
      const size = findPrintSize(this.sizes, photo.target_size_name) ?? this.sizes[0];
      try {
        const cropped = await smartCropFromUrl(photo.original_url, getCalculatedAspectRatio(size, false));
        const blobUrl = URL.createObjectURL(cropped.blob);
        this.blobUrls.add(blobUrl);
        const loss = cropped.cropData.metrics?.cropLossPercentage ?? 0;
        next.push({
          ...photo,
          cropped_url: blobUrl,
          crop_data: cropped.cropData,
          recommend_generative_fill: loss > CROP_LOSS_WARN_PERCENT,
          status: photoStatusFromAutoCrop(cropped.cropData.metrics),
        });
      } catch {
        next.push(photo);
      }
    }
    this.photos.set(next);
    this.aiBusy.set(false);
    this.busy.set(false);
    this.toast.set(null);
  }

  ngOnDestroy(): void {
    for (const url of this.blobUrls) URL.revokeObjectURL(url);
  }

  onTierChange(tier: string): void {
    if (tier === 'demo' || tier === 'basic' || tier === 'pro') {
      this.selectedTier.set(tier);
    }
  }

  simulateQuotaReached(): void {
    this.aiUsed.set(this.tierMax());
    this.toast.set(`${this.aiUsed()}/${this.tierMax()} · QUOTA`);
  }

  resetAiCounter(): void {
    this.aiUsed.set(0);
    this.toast.set('0/' + this.tierMax());
  }

  async onUploadFile(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    if (!file) return;
    await this.onUploadFiles({ files: [file], sizeName: this.uploadSizeName() });
  }

  async onUploadFiles(payload: { files: File[]; sizeName: string }): Promise<void> {
    if (!payload.files.length) return;
    this.uploadSizeName.set(payload.sizeName || defaultPrintSize().name);
    this.busy.set(true);
    this.aiBusy.set(true);
    this.toast.set(this.i18n.t('smartcrop.studio.aiWorking'));

    const size =
      findPrintSize(this.sizes, payload.sizeName) ??
      this.sizes.find((s) => s.is_default) ??
      this.sizes[0];

    try {
      let last: SmartcropPhoto | null = null;
      for (const file of payload.files) {
        const originalUrl = URL.createObjectURL(file);
        this.blobUrls.add(originalUrl);
        const cropped = await smartCropJpeg(file, getCalculatedAspectRatio(size, false));
        const croppedUrl = URL.createObjectURL(cropped.blob);
        this.blobUrls.add(croppedUrl);
        const loss = cropped.cropData.metrics?.cropLossPercentage ?? 0;

        const photo: SmartcropPhoto = {
          id: `upload-${crypto.randomUUID()}`,
          order_id: 'demo-order',
          user_id: 'demo-user',
          sender_phone: '+972500000000',
          original_url: originalUrl,
          cropped_url: croppedUrl,
          size_id: size.id,
          target_size_name: size.name,
          crop_data: cropped.cropData,
          recommend_generative_fill: loss > CROP_LOSS_WARN_PERCENT,
          status: photoStatusFromAutoCrop(cropped.cropData.metrics),
          created_at: new Date().toISOString(),
        };
        this.photos.update((list) => [photo, ...list]);
        last = photo;
      }
      if (last) this.comparePhoto.set(last);
      this.toast.set(this.i18n.t('smartcrop.dash.simulated'));
    } catch (e) {
      this.toast.set(e instanceof Error ? e.message : 'Upload failed');
    } finally {
      this.aiBusy.set(false);
      this.busy.set(false);
    }
  }

  /** Live server MediaPipe/Sharp process when API is configured. */
  async runServerProcess(photo: SmartcropPhoto): Promise<void> {
    if (!this.api.isConfigured()) {
      await this.runAiOnCard(photo);
      return;
    }
    this.busy.set(true);
    this.aiBusy.set(true);
    this.toast.set(this.i18n.t('smartcrop.studio.aiWorking'));
    try {
      const media_base64 = await this.urlToDataUrl(photo.original_url);
      const result = await this.api.processPhoto({
        media_base64,
        aspectRatio: this.compareAspectFor(photo),
      });
      if (!result.ok || !result.croppedBase64) {
        this.toast.set(result.error || 'Process failed');
        return;
      }
      this.patchPhoto(photo.id, {
        cropped_url: result.croppedBase64,
        crop_data: result.cropData ?? photo.crop_data,
        recommend_generative_fill: Boolean(result.recommendGenerativeFill),
      });
      this.comparePhoto.set(this.photos().find((p) => p.id === photo.id) ?? photo);
      this.toast.set(this.i18n.t('smartcrop.crop.aiDone'));
    } finally {
      this.aiBusy.set(false);
      this.busy.set(false);
    }
  }

  async runGenerativeFill(photo: SmartcropPhoto): Promise<void> {
    if (this.aiUsed() >= this.tierMax()) {
      this.showQuotaModal.set(true);
      return;
    }

    this.generativeBusy.set(true);
    this.busy.set(true);
    this.toast.set(this.i18n.t('smartcrop.generative.working'));
    try {
      if (!this.api.isConfigured()) {
        // Local fallback: mark as recommended only / keep crop
        this.showQuotaModal.set(false);
        this.toast.set(this.i18n.t('smartcrop.generative.needApi'));
        return;
      }

      const media_base64 = await this.urlToDataUrl(photo.original_url);
      const result = await this.api.generativeFill({
        media_base64,
        aspectRatio: this.compareAspectFor(photo),
        demoMode: true,
        simulateUsed: this.aiUsed(),
        simulateTier: this.selectedTier(),
      });

      if (result.quotaExceeded) {
        this.quotaSupportUrl.set(result.supportUrl || DEFAULT_SUPPORT_WA);
        this.showQuotaModal.set(true);
        this.toast.set(result.message || this.i18n.t('smartcrop.quota.title'));
        return;
      }
      if (!result.ok) {
        this.toast.set(result.error || 'Generative fill failed');
        return;
      }

      if (result.usedClipdrop) {
        this.aiUsed.update((n) => n + 1);
      }

      const gfUrl = result.generativeFillUrl || result.generativeBase64 || null;
      const cropUrl = result.croppedUrl || result.croppedBase64 || photo.cropped_url;
      this.patchPhoto(photo.id, {
        cropped_url: cropUrl,
        generative_fill_url: gfUrl,
        crop_data: result.cropData ?? photo.crop_data,
        recommend_generative_fill: false,
      });
      this.comparePhoto.set(this.photos().find((p) => p.id === photo.id) ?? photo);
      this.toast.set(
        result.usedClipdrop
          ? this.i18n.t('smartcrop.generative.done')
          : this.i18n.t('smartcrop.generative.fallback'),
      );
    } finally {
      this.generativeBusy.set(false);
      this.busy.set(false);
    }
  }

  toggleSelect(id: string): void {
    const next = new Set(this.selectedIds());
    if (next.has(id)) next.delete(id);
    else next.add(id);
    this.selectedIds.set(next);
  }

  togglePreview(id: string): void {
    const next = new Set(this.originalPreviewIds());
    if (next.has(id)) next.delete(id);
    else next.add(id);
    this.originalPreviewIds.set(next);
  }

  openEdit(photo: SmartcropPhoto): void {
    const idx = this.filteredPhotos().findIndex((p) => p.id === photo.id);
    this.editingIndex.set(Math.max(0, idx));
    this.editingPhoto.set(photo);
  }

  /** Notes: Print size changed in crop popup — keep photo + presentation in sync. */
  onModalSizeChanged(ev: { sizeId: string; sizeName: string }): void {
    const photo = this.editingPhoto();
    if (!photo) return;
    const next = { ...photo, size_id: ev.sizeId, target_size_name: ev.sizeName };
    this.patchPhoto(photo.id, { size_id: ev.sizeId, target_size_name: ev.sizeName });
    this.editingPhoto.set(next);
    if (this.comparePhoto()?.id === photo.id) {
      this.comparePhoto.set(next);
    }
  }

  async remove(photo: SmartcropPhoto): Promise<void> {
    this.photos.update((list) => list.filter((p) => p.id !== photo.id));
  }

  async changeSize(photoId: string, sizeName: string): Promise<void> {
    const size = findPrintSize(this.sizes, sizeName);
    if (!size) return;
    const photo = this.photos().find((p) => p.id === photoId);
    if (!photo) return;
    this.busy.set(true);
    this.aiBusy.set(true);
    this.toast.set(this.i18n.t('smartcrop.studio.aiWorking'));
    try {
      const cropped = await smartCropFromUrl(photo.original_url, getCalculatedAspectRatio(size, false));
      const blobUrl = URL.createObjectURL(cropped.blob);
      this.blobUrls.add(blobUrl);
      const loss = cropped.cropData.metrics?.cropLossPercentage ?? 0;
      this.patchPhoto(photoId, {
        size_id: size.id,
        target_size_name: size.name,
        cropped_url: blobUrl,
        crop_data: cropped.cropData,
        recommend_generative_fill: loss > CROP_LOSS_WARN_PERCENT,
        generative_fill_url: null,
        status: photoStatusFromAutoCrop(cropped.cropData.metrics),
      });
      this.toast.set(this.i18n.t('smartcrop.demo.sizeChanged').replace('{size}', size.name));
    } finally {
      this.aiBusy.set(false);
      this.busy.set(false);
    }
  }

  onCardSizeChange(photo: SmartcropPhoto, event: Event): void {
    const value = (event.target as HTMLSelectElement).value;
    if (value) void this.changeSize(photo.id, value);
  }

  async saveCrop(result: CropSaveResult): Promise<void> {
    const photo = this.editingPhoto();
    if (!photo) return;
    const list = this.filteredPhotos();
    const idx = list.findIndex((p) => p.id === photo.id);
    this.busy.set(true);
    try {
      let objectUrl = result.objectUrl;
      if (!objectUrl) {
        const applied = await applyClientCrop(photo.original_url, result.cropData);
        objectUrl = applied.blobUrl;
      }
      this.blobUrls.add(objectUrl);
      this.patchPhoto(photo.id, {
        cropped_url: objectUrl,
        crop_data: result.cropData,
        size_id: result.sizeId ?? photo.size_id,
        target_size_name: result.sizeName ?? photo.target_size_name,
        status: 'pending',
      });
      this.toast.set(this.i18n.t('smartcrop.demo.cropSaved'));
      const next = idx >= 0 ? list[idx + 1] : undefined;
      if (next) {
        this.editingIndex.set(idx + 1);
        this.editingPhoto.set(this.photos().find((p) => p.id === next.id) ?? next);
      } else {
        this.editingPhoto.set(null);
      }
    } finally {
      this.busy.set(false);
    }
  }

  async resetAiCrop(): Promise<void> {
    const photo = this.editingPhoto();
    if (!photo) return;
    this.busy.set(true);
    this.aiBusy.set(true);
    this.toast.set(this.i18n.t('smartcrop.studio.aiWorking'));
    try {
      const cropped = await smartCropFromUrl(photo.original_url, this.editingAspect());
      const blobUrl = URL.createObjectURL(cropped.blob);
      this.blobUrls.add(blobUrl);
      const loss = cropped.cropData.metrics?.cropLossPercentage ?? 0;
      this.patchPhoto(photo.id, {
        cropped_url: blobUrl,
        crop_data: cropped.cropData,
        recommend_generative_fill: loss > CROP_LOSS_WARN_PERCENT,
        status: photoStatusFromAutoCrop(cropped.cropData.metrics),
      });
      this.editingPhoto.set({
        ...photo,
        cropped_url: blobUrl,
        crop_data: cropped.cropData,
        recommend_generative_fill: loss > CROP_LOSS_WARN_PERCENT,
        status: photoStatusFromAutoCrop(cropped.cropData.metrics),
      });
      this.toast.set(this.i18n.t('smartcrop.crop.aiDone'));
    } finally {
      this.aiBusy.set(false);
      this.busy.set(false);
    }
  }

  /** Notes: AI Generator from gallery card — face detect + auto-center without opening modal. */
  async runAiOnCard(photo: SmartcropPhoto): Promise<void> {
    this.editingPhoto.set(photo);
    await this.resetAiCrop();
    this.comparePhoto.set(this.photos().find((p) => p.id === photo.id) ?? photo);
  }

  private compareAspectFor(photo: SmartcropPhoto): number {
    const size =
      findPrintSize(this.sizes, photo.size_id) ||
      findPrintSize(this.sizes, photo.target_size_name) ||
      this.sizes[0];
    return size ? getCalculatedAspectRatio(size, false) : 2 / 3;
  }

  private async urlToDataUrl(url: string): Promise<string> {
    if (url.startsWith('data:')) return url;
    const res = await fetch(url);
    const blob = await res.blob();
    return await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result));
      reader.onerror = () => reject(reader.error);
      reader.readAsDataURL(blob);
    });
  }

  private patchPhoto(id: string, patch: Partial<SmartcropPhoto>): void {
    this.photos.update((list) => list.map((p) => (p.id === id ? { ...p, ...patch } : p)));
  }
}
