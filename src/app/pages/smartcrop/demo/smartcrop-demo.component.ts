import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import type { CropSaveResult, SmartcropPhoto } from '../../../core/models/smartcrop.model';
import {
  DEMO_PRINT_SIZES,
  applyClientCrop,
  autoCenterCrop,
  createDemoPhotos,
} from '../../../core/data/smartcrop-demo.data';
import { I18nService } from '../../../core/services/i18n.service';
import { SmartcropPhotoCardComponent } from '../components/photo-card/photo-card.component';
import { SmartcropCropModalComponent } from '../components/crop-modal/crop-modal.component';

@Component({
  selector: 'app-smartcrop-demo',
  standalone: true,
  imports: [FormsModule, RouterLink, SmartcropPhotoCardComponent, SmartcropCropModalComponent],
  templateUrl: './smartcrop-demo.component.html',
  styleUrl: './smartcrop-demo.component.scss',
})
export class SmartcropDemoComponent implements OnInit {
  readonly i18n = inject(I18nService);
  readonly sizes = DEMO_PRINT_SIZES;

  readonly photos = signal<SmartcropPhoto[]>([]);
  readonly selectedIds = signal(new Set<string>());
  readonly originalPreviewIds = signal(new Set<string>());
  readonly sizeFilter = signal('all');
  readonly editingPhoto = signal<SmartcropPhoto | null>(null);
  readonly busy = signal(false);
  readonly toast = signal<string | null>(null);
  readonly editingIndex = signal(0);

  /** Keep blob URLs to revoke later */
  private readonly blobUrls = new Set<string>();

  readonly filteredPhotos = computed(() => {
    const size = this.sizeFilter();
    return this.photos().filter((p) => (size === 'all' ? true : p.target_size_name === size));
  });

  readonly editingAspect = computed(() => {
    const photo = this.editingPhoto();
    if (!photo) return 2 / 3;
    const size = this.sizes.find((s) => s.id === photo.size_id || s.name === photo.target_size_name);
    return size ? Number(size.aspect_ratio) : 2 / 3;
  });

  async ngOnInit(): Promise<void> {
    const list = createDemoPhotos();
    this.photos.set(list);
    // Pre-apply AI-style center crop so gallery shows print frames
    this.busy.set(true);
    const next: SmartcropPhoto[] = [];
    for (const photo of list) {
      const size = this.sizes.find((s) => s.name === photo.target_size_name) ?? this.sizes[0];
      try {
        const crop = await autoCenterCrop(photo.original_url, Number(size.aspect_ratio));
        const { blobUrl, cropData } = await applyClientCrop(photo.original_url, crop);
        this.blobUrls.add(blobUrl);
        next.push({ ...photo, cropped_url: blobUrl, crop_data: cropData });
      } catch {
        next.push(photo);
      }
    }
    this.photos.set(next);
    this.busy.set(false);
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

  async remove(photo: SmartcropPhoto): Promise<void> {
    this.photos.update((list) => list.filter((p) => p.id !== photo.id));
  }

  async changeSize(photoId: string, sizeName: string): Promise<void> {
    const size = this.sizes.find((s) => s.name === sizeName);
    if (!size) return;
    const photo = this.photos().find((p) => p.id === photoId);
    if (!photo) return;
    this.busy.set(true);
    try {
      const crop = await autoCenterCrop(photo.original_url, Number(size.aspect_ratio));
      const { blobUrl, cropData } = await applyClientCrop(photo.original_url, crop);
      this.blobUrls.add(blobUrl);
      this.patchPhoto(photoId, {
        size_id: size.id,
        target_size_name: size.name,
        cropped_url: blobUrl,
        crop_data: cropData,
      });
      this.toast.set(this.i18n.t('smartcrop.demo.sizeChanged').replace('{size}', size.name));
    } finally {
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
    try {
      const crop = await autoCenterCrop(photo.original_url, this.editingAspect());
      const { blobUrl, cropData } = await applyClientCrop(photo.original_url, crop);
      this.blobUrls.add(blobUrl);
      this.patchPhoto(photo.id, { cropped_url: blobUrl, crop_data: cropData });
      this.editingPhoto.set({ ...photo, cropped_url: blobUrl, crop_data: cropData });
      this.toast.set(this.i18n.t('smartcrop.demo.resetAi'));
    } finally {
      this.busy.set(false);
    }
  }

  private patchPhoto(id: string, patch: Partial<SmartcropPhoto>): void {
    this.photos.update((list) => list.map((p) => (p.id === id ? { ...p, ...patch } : p)));
  }
}
