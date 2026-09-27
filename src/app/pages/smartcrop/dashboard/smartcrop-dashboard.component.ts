import { Component, OnInit, OnDestroy, computed, effect, inject, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { DecimalPipe, NgStyle } from '@angular/common';
import { FormsModule } from '@angular/forms';
import type { CropData, CropSaveResult, DetectedType, ShopCustomer, SmartcropPhoto } from '../../../core/models/smartcrop.model';
import { I18nService } from '../../../core/services/i18n.service';
import { SmartcropAuthService } from '../../../core/services/smartcrop-auth.service';
import { SmartcropPhotosService } from '../../../core/services/smartcrop-photos.service';
import { SmartcropApiService } from '../../../core/services/smartcrop-api.service';
import { SmartcropCropModalComponent } from '../components/crop-modal/crop-modal.component';
import { SmartcropBatchActionBarComponent } from '../components/batch-action-bar/batch-action-bar.component';
import { SmartcropFileUploaderComponent } from '../components/file-uploader/file-uploader.component';
import { SmartcropPhotoComparisonCardComponent } from '../components/photo-comparison-card/photo-comparison-card.component';
import { SmartcropStudioTutorialComponent } from '../components/studio-tutorial/studio-tutorial.component';
import { SmartcropQuotaExceededModalComponent } from '../components/quota-exceeded-modal/quota-exceeded-modal.component';
import { SmartcropCustomerSearchBarComponent } from '../components/customer-search-bar/customer-search-bar.component';
import { SmartcropCustomerFilterHeaderComponent } from '../components/customer-filter-header/customer-filter-header.component';
import { FooterComponent } from '../../../layout/footer/footer.component';
import { CROP_LOSS_WARN_PERCENT, HEAD_TOP_PADDING_RATIO, confidenceTone } from '../../../core/smartcrop/crop-engine.math';
import { heatmapGradientStyle, LOW_FOCUS_THRESHOLD } from '../../../core/smartcrop/focus-heatmap';
import { DEFAULT_SUPPORT_WA } from '../../../core/smartcrop/subscriptions';
import {
  findPrintSize,
  getCalculatedAspectRatio,
  defaultPrintSize,
} from '../../../core/smartcrop/print-sizes';
import { blindCenterCropFromUrl, smartCropFromUrl } from '../../../core/smartcrop/crop-engine.client';
import { applyClientCrop } from '../../../core/data/smartcrop-demo.data';

const TUTORIAL_STORAGE_KEY = 'smartcrop-studio-tutorial-v1';
/** Nudge crop by this fraction of the current crop box. */
const PAN_STEP = 0.06;
/** Zoom in/out scale factor per click. */
const ZOOM_STEP = 1.08;

@Component({
  selector: 'app-smartcrop-dashboard',
  standalone: true,
  imports: [
    FormsModule,
    RouterLink,
    DecimalPipe,
    NgStyle,
    SmartcropCropModalComponent,
    SmartcropBatchActionBarComponent,
    SmartcropFileUploaderComponent,
    SmartcropPhotoComparisonCardComponent,
    SmartcropStudioTutorialComponent,
    SmartcropQuotaExceededModalComponent,
    SmartcropCustomerSearchBarComponent,
    SmartcropCustomerFilterHeaderComponent,
    FooterComponent,
  ],
  templateUrl: './smartcrop-dashboard.component.html',
  styleUrl: './smartcrop-dashboard.component.scss',
})
export class SmartcropDashboardComponent implements OnInit, OnDestroy {
  readonly i18n = inject(I18nService);
  readonly auth = inject(SmartcropAuthService);
  readonly photosService = inject(SmartcropPhotosService);
  readonly api = inject(SmartcropApiService);
  private readonly router = inject(Router);

  readonly cropLossWarn = CROP_LOSS_WARN_PERCENT;

  readonly activeId = signal<string | null>(null);
  readonly showOriginal = signal(false);
  readonly compareMode = signal(false);
  readonly cropOpen = signal(false);
  readonly showTutorial = signal(false);
  readonly showQuotaModal = signal(false);
  readonly quotaSupportUrl = signal(DEFAULT_SUPPORT_WA);
  readonly generativeBusy = signal(false);
  readonly busy = signal(false);
  readonly aiBusy = signal(false);
  readonly toast = signal<string | null>(null);
  readonly selectedIds = signal(new Set<string>());
  readonly uploadSizeName = signal(defaultPrintSize().name);
  /** null = all customers */
  readonly activeCustomerPhone = signal<string | null>(null);
  readonly customerQuery = signal('');
  readonly showGrid = signal(false);
  readonly showHeatmap = signal(false);
  /** Print-folder path is hidden by default — lab staff can reveal when needed. */
  readonly showHotfolder = signal(false);
  /** Blind center-crop preview URL for “regular crop” mode (revoked on replace). */
  readonly blindPreviewUrl = signal<string | null>(null);
  readonly blindBusy = signal(false);

  private pollTimer: ReturnType<typeof setInterval> | null = null;
  private blindCacheKey = '';

  constructor() {
    // When switching to regular-crop mode, generate a true center crop (not full original).
    effect(() => {
      const photo = this.activePhoto();
      const showBlind = this.showOriginal();
      const aspect = this.activeAspect();
      if (!photo || !showBlind || this.compareMode()) {
        return;
      }
      const key = `geo2|${photo.id}|${aspect}|${photo.original_url}`;
      if (key === this.blindCacheKey && this.blindPreviewUrl()) return;
      void this.loadBlindPreview(photo, aspect, key);
    });

    // Keep selection valid when WhatsApp pushes new photos into the list
    effect(() => {
      const list = this.filteredPhotos();
      const id = this.activeId();
      if (!list.length) return;
      if (!id || !list.some((p) => p.id === id)) {
        this.activeId.set(list[0]!.id);
      }
    });
  }

  readonly photos = computed(() => this.photosService.photos());

  /** CRM list: one row per end-customer phone under this shop. */
  readonly customers = computed((): ShopCustomer[] => {
    const map = new Map<string, ShopCustomer>();
    for (const p of this.photos()) {
      const phone = p.sender_phone || 'unknown';
      const row = map.get(phone) ?? {
        phone,
        full_name: p.customer_name ?? null,
        photo_count: 0,
        pending_count: 0,
        ready_count: 0,
        crop_loss_alerts: 0,
        last_order_at: p.created_at,
        has_whatsapp: false,
        has_web_upload: false,
      };
      row.photo_count += 1;
      if (p.status === 'pending') row.pending_count += 1;
      if (p.status === 'approved' || p.status === 'printed') row.ready_count = (row.ready_count ?? 0) + 1;
      const loss = Number(p.crop_data?.metrics?.cropLossPercentage) || 0;
      if (p.crop_data?.metrics?.hasTruncationRisk || loss > CROP_LOSS_WARN_PERCENT) {
        row.crop_loss_alerts = (row.crop_loss_alerts ?? 0) + 1;
      }
      if (p.source === 'WEB_UPLOAD') row.has_web_upload = true;
      else row.has_whatsapp = true;
      if (p.customer_name && !row.full_name) row.full_name = p.customer_name;
      if (!row.last_order_at || p.created_at > row.last_order_at) row.last_order_at = p.created_at;
      map.set(phone, row);
    }
    const q = this.customerQuery().trim().toLowerCase();
    let list = [...map.values()];
    if (q) {
      const qDigits = q.replace(/\D/g, '');
      list = list.filter((c) => {
        const phoneDigits = c.phone.replace(/\D/g, '');
        return (
          c.phone.toLowerCase().includes(q) ||
          (c.full_name || '').toLowerCase().includes(q) ||
          (qDigits.length >= 3 && phoneDigits.includes(qDigits))
        );
      });
    }
    return list.sort((a, b) =>
      String(b.last_order_at ?? '').localeCompare(String(a.last_order_at ?? '')),
    );
  });

  readonly selectedCustomer = computed(() => {
    const phone = this.activeCustomerPhone();
    if (!phone) return null;
    return this.customers().find((c) => c.phone === phone) ?? null;
  });

  readonly filteredPhotos = computed(() => {
    const phone = this.activeCustomerPhone();
    const list = this.photos();
    if (!phone) return list;
    return list.filter((p) => p.sender_phone === phone);
  });

  readonly activePhoto = computed(() => {
    const id = this.activeId();
    const list = this.filteredPhotos();
    return list.find((p) => p.id === id) ?? list[0] ?? null;
  });

  readonly activeAspect = computed(() => {
    const photo = this.activePhoto();
    if (!photo) return 2 / 3;
    const size =
      findPrintSize(this.photosService.sizes(), photo.size_id) ||
      findPrintSize(this.photosService.sizes(), photo.target_size_name);
    return size ? getCalculatedAspectRatio(size, false) : 2 / 3;
  });

  readonly activeSizeLabel = computed(() => {
    const photo = this.activePhoto();
    if (!photo) return '';
    const size = this.photosService
      .sizes()
      .find((s) => s.id === photo.size_id || s.name === photo.target_size_name);
    if (!size) return photo.target_size_name;
    return `${size.name} (${size.width_cm}×${size.height_cm} cm)`;
  });

  readonly activeMetrics = computed(() => this.activePhoto()?.crop_data?.metrics ?? null);

  /** Auto headroom % the engine applied above faces (0 if not a portrait pad). */
  readonly autoHeadroomPct = computed(() => {
    const m = this.activeMetrics();
    if (!m?.headPaddingApplied) return 0;
    return Math.round(HEAD_TOP_PADDING_RATIO * 100);
  });

  /** Print safety / bleed margin % from metrics. */
  readonly autoSafetyPct = computed(() => {
    const m = this.activeMetrics();
    if (m?.safetyMarginPercentage != null) return Math.round(m.safetyMarginPercentage);
    return m?.addedSafetyMargin ? 6 : 0;
  });

  /**
   * Where the AI focus sits inside the crop (0% = top, 100% = bottom).
   * Typical portraits land ~35–45% from the top.
   */
  readonly autoFaceCenterPct = computed(() => {
    const crop = this.activePhoto()?.crop_data;
    if (!crop?.focalPoint || !crop.height) return null;
    const rel = ((crop.focalPoint.y - crop.y) / crop.height) * 100;
    return Math.round(Math.min(100, Math.max(0, rel)));
  });

  /** How far AI shifted from geometric center (percent of diagonal). */
  readonly autoFaceShiftPct = computed(() => {
    const d = this.activeMetrics()?.correctionDelta?.distancePercent;
    return d != null ? Math.round(d * 10) / 10 : null;
  });

  /** Compact chips for step 2 — what AI found/applied (no sliders). */
  readonly aiFindingTags = computed((): { id: string; label: string; tone: string }[] => {
    const m = this.activeMetrics();
    const tags: { id: string; label: string; tone: string }[] = [];
    if (!m) return tags;

    if (m.detectedType) {
      const typeLabel = this.detectionLabel(m.detectedType);
      const conf =
        m.confidenceScore != null ? ` (${Math.round(m.confidenceScore * 10) / 10}%)` : '';
      tags.push({ id: 'type', label: `${typeLabel}${conf}`, tone: 'is-purple' });
    }
    if (m.headPaddingApplied && this.autoHeadroomPct() > 0) {
      tags.push({
        id: 'headroom',
        label: `${this.i18n.t('smartcrop.studio.headroomTag')} +${this.autoHeadroomPct()}%`,
        tone: 'is-green',
      });
    }
    if (this.autoSafetyPct() > 0) {
      tags.push({
        id: 'bleed',
        label: `${this.i18n.t('smartcrop.studio.bleedSafe')} +${this.autoSafetyPct()}%`,
        tone: 'is-green',
      });
    }
    if (this.autoFaceCenterPct() != null) {
      tags.push({
        id: 'face',
        label: `${this.i18n.t('smartcrop.studio.faceCenter')} ${this.autoFaceCenterPct()}%`,
        tone: 'is-purple',
      });
    }
    if (this.autoFaceShiftPct() != null && this.autoFaceShiftPct()! > 0) {
      tags.push({
        id: 'shift',
        label: `${this.i18n.t('smartcrop.metrics.correction')} Δ${this.autoFaceShiftPct()}%`,
        tone: 'is-muted',
      });
    }
    if (this.focusScore() != null) {
      tags.push({
        id: 'focus',
        label: `${this.i18n.t('smartcrop.studio.focusQuality')}: ${this.focusScore()}%`,
        tone: this.isLowFocus() ? 'is-warn' : 'is-green',
      });
    }
    if (m.usedSmartShift) {
      tags.push({
        id: 'smart',
        label: this.i18n.t('smartcrop.studio.focusLock'),
        tone: 'is-purple',
      });
    }
    return tags;
  });

  readonly focusScore = computed(() => {
    const m = this.activeMetrics();
    if (m?.focusScore != null) return Math.round(m.focusScore);
    return null;
  });

  readonly isLowFocus = computed(() => {
    const m = this.activeMetrics();
    if (m?.isLowFocus != null) return m.isLowFocus;
    const s = this.focusScore();
    return s != null && s < LOW_FOCUS_THRESHOLD;
  });

  readonly heatmapStyle = computed(() => {
    const photo = this.activePhoto();
    const crop = photo?.crop_data;
    if (!crop?.focalPoint) return heatmapGradientStyle({ xPercent: 48, yPercent: 38 });
    // Focal is in source image space; approximate % within crop frame for overlay
    const relX = crop.width ? ((crop.focalPoint.x - crop.x) / crop.width) * 100 : 50;
    const relY = crop.height ? ((crop.focalPoint.y - crop.y) / crop.height) * 100 : 40;
    return heatmapGradientStyle({
      xPercent: Math.max(5, Math.min(95, relX)),
      yPercent: Math.max(5, Math.min(95, relY)),
    });
  });

  readonly confidenceClass = computed(() => {
    const m = this.activeMetrics();
    if (!m) return 'is-muted';
    return `is-${confidenceTone(m.confidenceScore)}`;
  });

  readonly cropLossWarnUi = computed(() => {
    const m = this.activeMetrics();
    if (!m) return false;
    return m.hasTruncationRisk || m.cropLossPercentage > CROP_LOSS_WARN_PERCENT;
  });

  readonly pendingCount = computed(() => this.filteredPhotos().filter((p) => p.status === 'pending').length);
  readonly approvedCount = computed(() =>
    this.filteredPhotos().filter((p) => p.status === 'approved' || p.status === 'printed').length,
  );
  readonly stripReadyCount = computed(
    () => this.filteredPhotos().filter((p) => !this.thumbNeedsReview(p)).length,
  );
  readonly stripReviewCount = computed(
    () => this.filteredPhotos().filter((p) => this.thumbNeedsReview(p)).length,
  );
  readonly selectedCount = computed(() => this.selectedIds().size);

  /** Inbound WhatsApp caption for the active photo (with a readable fallback). */
  readonly whatsappMessage = computed(() => {
    const p = this.activePhoto();
    if (!p) return null;
    const text = (p.caption_text || '').trim();
    if (text) return text;
    if (p.parsed_summary?.trim()) return p.parsed_summary.trim();
    return null;
  });

  readonly whatsappOrderRef = computed(() => {
    const p = this.activePhoto();
    if (!p) return '';
    const short = (p.order_id || p.id).replace(/-/g, '').slice(0, 8).toUpperCase();
    return `#CF-${short.slice(0, 4)}`;
  });

  readonly previewUrl = computed(() => {
    const p = this.activePhoto();
    if (!p) return null;
    // Regular crop = blind geometric center crop (lab default), not the full original.
    if (this.showOriginal()) return this.blindPreviewUrl() || p.original_url;
    return p.cropped_url || p.original_url;
  });

  readonly userLabel = computed(() => {
    const p = this.auth.profile();
    return p?.full_name || p?.email || p?.phone || 'Studio';
  });

  /** Short studio alias for the avatar circle (first word / initials). */
  readonly userInitials = computed(() => {
    const studio = (this.auth.profile()?.full_name || '').trim();
    if (studio) {
      const parts = studio.split(/\s+/).filter(Boolean);
      const first = parts[0] ?? studio;
      // Latin multi-word → initials (e.g. Photo Lab → PL)
      if (/^[A-Za-z]/.test(first) && parts.length >= 2) {
        return `${parts[0]![0]}${parts[1]![0]}`.toUpperCase();
      }
      if (/^[A-Za-z]/.test(first)) return first.slice(0, 2).toUpperCase();
      // Hebrew / mixed: show first name/word as alias (e.g. יוסי צלמים → יוסי)
      return first.length > 6 ? first.slice(0, 4) : first;
    }
    const label = this.userLabel();
    const parts = label.split(/\s+/).filter(Boolean);
    if (parts.length >= 2) return `${parts[0]![0]}${parts[1]![0]}`.toUpperCase();
    return label.slice(0, 2).toUpperCase();
  });

  readonly whatsappBadge = computed(() =>
    this.api.isConfigured()
      ? this.i18n.t('smartcrop.studio.whatsappOn')
      : this.i18n.t('smartcrop.studio.whatsappDemo'),
  );

  readonly whatsappBadgeTitle = computed(() =>
    this.api.isConfigured()
      ? this.i18n.t('smartcrop.studio.whatsappOnHint')
      : this.i18n.t('smartcrop.studio.whatsappDemoHint'),
  );

  async ngOnInit(): Promise<void> {
    await this.auth.waitUntilReady();
    await this.auth.syncPhoneFromAuthUser();
    await this.auth.ensureStoreCode();
    await this.photosService.refreshAll();
    const first = this.filteredPhotos()[0];
    if (first) this.activeId.set(first.id);
    // Phone OTP registration already links the number — skip WhatsApp sync modal.
    this.maybeOpenTutorial();
    // Fallback poll if Realtime is disabled on the project
    this.pollTimer = setInterval(() => {
      void this.photosService.loadPhotosQuiet();
    }, 12_000);
  }

  ngOnDestroy(): void {
    if (this.pollTimer) {
      clearInterval(this.pollTimer);
      this.pollTimer = null;
    }
    this.revokeBlindPreview();
    this.photosService.teardownPhotosRealtime();
  }

  private revokeBlindPreview(): void {
    const url = this.blindPreviewUrl();
    if (url?.startsWith('blob:')) URL.revokeObjectURL(url);
    this.blindPreviewUrl.set(null);
    this.blindCacheKey = '';
  }

  private async loadBlindPreview(
    photo: SmartcropPhoto,
    aspect: number,
    key: string,
  ): Promise<void> {
    this.blindBusy.set(true);
    try {
      const blob = await blindCenterCropFromUrl(photo.original_url, aspect);
      this.revokeBlindPreview();
      this.blindCacheKey = key;
      this.blindPreviewUrl.set(URL.createObjectURL(blob));
    } catch (err) {
      console.warn('[SmartcropDashboard] blind preview', err);
      this.blindPreviewUrl.set(null);
    } finally {
      this.blindBusy.set(false);
    }
  }

  openTutorial(): void {
    this.showTutorial.set(true);
  }

  onTutorialClosed(): void {
    this.showTutorial.set(false);
    try {
      localStorage.setItem(TUTORIAL_STORAGE_KEY, '1');
    } catch {
      /* private mode */
    }
  }

  private maybeOpenTutorial(): void {
    try {
      if (localStorage.getItem(TUTORIAL_STORAGE_KEY) === '1') return;
    } catch {
      /* show anyway */
    }
    // Delay slightly so the studio paints first
    setTimeout(() => this.showTutorial.set(true), 450);
  }

  selectCustomer(phone: string | null): void {
    this.activeCustomerPhone.set(phone);
    const first = this.filteredPhotos()[0];
    this.activeId.set(first?.id ?? null);
    this.compareMode.set(false);
    this.showOriginal.set(false);
  }

  selectPhoto(photo: SmartcropPhoto): void {
    this.activeId.set(photo.id);
    this.showOriginal.set(false);
    this.compareMode.set(false);
  }

  toggleSelect(photoId: string, event: Event): void {
    event.stopPropagation();
    const next = new Set(this.selectedIds());
    if (next.has(photoId)) next.delete(photoId);
    else next.add(photoId);
    this.selectedIds.set(next);
  }

  clearSelection(): void {
    this.selectedIds.set(new Set());
  }

  toggleOriginal(): void {
    this.compareMode.set(false);
    this.showOriginal.update((v) => !v);
  }

  toggleCompare(): void {
    this.showOriginal.set(false);
    this.compareMode.update((v) => !v);
  }

  toggleGrid(): void {
    this.showGrid.update((v) => !v);
  }

  toggleHeatmap(): void {
    this.showHeatmap.update((v) => !v);
  }

  toggleHotfolder(): void {
    this.showHotfolder.update((v) => !v);
  }

  /** Notes: Move the crop window on the original (image appears to pan opposite). */
  async panCrop(dir: 'up' | 'down' | 'left' | 'right'): Promise<void> {
    const photo = this.activePhoto();
    if (!photo || this.showOriginal() || this.compareMode() || this.busy()) return;
    const crop = await this.ensureCropBox(photo);
    if (!crop) return;
    const stepX = Math.max(4, Math.round(crop.width * PAN_STEP));
    const stepY = Math.max(4, Math.round(crop.height * PAN_STEP));
    let dx = 0;
    let dy = 0;
    // Moving the *image* up/right means the crop box moves down/left on the source.
    if (dir === 'up') dy = -stepY;
    if (dir === 'down') dy = stepY;
    if (dir === 'left') dx = -stepX;
    if (dir === 'right') dx = stepX;
    await this.applyCropAdjust(photo, { ...crop, x: crop.x + dx, y: crop.y + dy });
  }

  /** Notes: Zoom in/out by shrinking/growing the crop box around its center. */
  async zoomCrop(direction: 'in' | 'out'): Promise<void> {
    const photo = this.activePhoto();
    if (!photo || this.showOriginal() || this.compareMode() || this.busy()) return;
    const crop = await this.ensureCropBox(photo);
    if (!crop) return;
    const factor = direction === 'in' ? 1 / ZOOM_STEP : ZOOM_STEP;
    const cx = crop.x + crop.width / 2;
    const cy = crop.y + crop.height / 2;
    const nextW = crop.width * factor;
    const nextH = crop.height * factor;
    await this.applyCropAdjust(photo, {
      ...crop,
      width: nextW,
      height: nextH,
      x: cx - nextW / 2,
      y: cy - nextH / 2,
      zoom: Math.max(0.25, Math.min(4, (crop.zoom || 1) * (direction === 'in' ? ZOOM_STEP : 1 / ZOOM_STEP))),
    });
  }

  private async ensureCropBox(photo: SmartcropPhoto): Promise<CropData | null> {
    if (photo.crop_data?.width && photo.crop_data?.height) {
      return { ...photo.crop_data };
    }
    try {
      const size = await this.loadNaturalSize(photo.original_url);
      const aspect = this.activeAspect();
      let cropW: number;
      let cropH: number;
      if (size.w / size.h > aspect) {
        cropH = size.h;
        cropW = Math.round(cropH * aspect);
      } else {
        cropW = size.w;
        cropH = Math.round(cropW / aspect);
      }
      return {
        x: Math.round((size.w - cropW) / 2),
        y: Math.round((size.h - cropH) / 2),
        width: cropW,
        height: cropH,
        zoom: 1,
        focalPoint: { x: size.w / 2, y: size.h * 0.4 },
        isManuallyEdited: false,
      };
    } catch {
      return null;
    }
  }

  private async applyCropAdjust(photo: SmartcropPhoto, raw: CropData): Promise<void> {
    this.busy.set(true);
    try {
      const size = await this.loadNaturalSize(photo.original_url);
      const aspect = this.activeAspect();
      // Keep print aspect while clamping inside the original.
      let width = Math.max(32, raw.width);
      let height = width / aspect;
      if (height > size.h) {
        height = size.h;
        width = height * aspect;
      }
      if (width > size.w) {
        width = size.w;
        height = width / aspect;
      }
      const x = Math.min(Math.max(0, raw.x), Math.max(0, size.w - width));
      const y = Math.min(Math.max(0, raw.y), Math.max(0, size.h - height));
      const crop: CropData = {
        ...raw,
        x: Math.round(x),
        y: Math.round(y),
        width: Math.round(width),
        height: Math.round(height),
        isManuallyEdited: true,
        focalPoint: {
          x: Math.round(x + width / 2),
          y: Math.round(y + height * 0.4),
        },
      };
      const applied = await applyClientCrop(photo.original_url, crop);
      if (photo.cropped_url?.startsWith('blob:')) {
        try {
          URL.revokeObjectURL(photo.cropped_url);
        } catch {
          /* ignore */
        }
      }
      await this.photosService.updatePhoto(photo.id, {
        crop_data: applied.cropData,
        cropped_url: applied.blobUrl,
        status: 'pending',
      });
      this.showOriginal.set(false);
      this.compareMode.set(false);
    } catch (e) {
      this.toast.set(e instanceof Error ? e.message : 'Adjust failed');
    } finally {
      this.busy.set(false);
    }
  }

  private naturalSizeCache = new Map<string, { w: number; h: number }>();

  private loadNaturalSize(url: string): Promise<{ w: number; h: number }> {
    const hit = this.naturalSizeCache.get(url);
    if (hit) return Promise.resolve(hit);
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.decoding = 'async';
      img.onload = () => {
        const size = { w: img.naturalWidth, h: img.naturalHeight };
        this.naturalSizeCache.set(url, size);
        resolve(size);
      };
      img.onerror = () => reject(new Error('Failed to load image'));
      img.src = url;
    });
  }

  async selectSize(sizeId: string): Promise<void> {
    const photo = this.activePhoto();
    const size = this.photosService.sizes().find((s) => s.id === sizeId);
    if (!photo || !size) return;
    if (photo.size_id === size.id && photo.target_size_name === size.name) return;

    this.busy.set(true);
    this.aiBusy.set(true);
    this.toast.set(this.i18n.t('smartcrop.studio.aiWorking'));
    try {
      // Always recrop in place — never reload the photo list (that wiped blob uploads).
      const err = await this.photosService.recropPhotoWithAi(photo, size);
      if (err.error) {
        this.toast.set(err.error.message);
        return;
      }
      if (this.api.isConfigured() && !this.photosService.isLocalOnly(photo)) {
        await this.api.batchUpdate({ photoIds: [photo.id], sizeId: size.id });
      }
      this.compareMode.set(false);
      this.showOriginal.set(false);
      this.toast.set(this.i18n.t('smartcrop.dash.simulated'));
    } catch (e) {
      this.toast.set(e instanceof Error ? e.message : 'Size change failed');
    } finally {
      this.busy.set(false);
      this.aiBusy.set(false);
    }
  }

  /** Notes: Size changed inside crop editor — update photo metadata immediately. */
  onModalSizeChanged(ev: { sizeId: string; sizeName: string }): void {
    const photo = this.activePhoto();
    if (!photo) return;
    this.photosService.patchPhoto(photo.id, {
      size_id: ev.sizeId,
      target_size_name: ev.sizeName,
    });
  }

  openCrop(): void {
    if (this.activePhoto()) this.cropOpen.set(true);
  }

  async approveActive(): Promise<void> {
    const photo = this.activePhoto();
    if (!photo) return;
    await this.sendToPrint([photo.id]);
  }

  async approveAll(): Promise<void> {
    const ids = this.filteredPhotos()
      .filter((p) => p.status === 'pending' || p.status === 'approved')
      .map((p) => p.id);
    if (!ids.length) return;
    await this.sendToPrint(ids);
  }

  async batchApprove(): Promise<void> {
    const ids = [...this.selectedIds()];
    if (!ids.length) return;
    await this.sendToPrint(ids);
    this.clearSelection();
  }

  /** Notes: Approve + mark printed with hotfolder path for the lab. */
  private async sendToPrint(ids: string[]): Promise<void> {
    this.busy.set(true);
    try {
      if (this.api.isConfigured()) {
        const res = await this.api.sendToPrint(ids);
        await this.photosService.loadPhotos();
        const folder = res.hotfolderPaths?.[0];
        this.toast.set(
          folder
            ? this.i18n.t('smartcrop.dash.printedFolder').replace('{path}', folder)
            : this.i18n.t('smartcrop.dash.printed'),
        );
      } else {
        this.photosService.photos.update((list) =>
          list.map((p) =>
            ids.includes(p.id)
              ? {
                  ...p,
                  status: 'printed' as const,
                  hotfolder_path:
                    p.hotfolder_path ||
                    `C:\\Hotfolder\\${(p.customer_name || p.sender_phone).replace(/\s+/g, '_')}_${p.target_size_name}`,
                }
              : p,
          ),
        );
        const sample = this.photos().find((p) => ids.includes(p.id));
        this.toast.set(
          sample?.hotfolder_path
            ? this.i18n.t('smartcrop.dash.printedFolder').replace('{path}', sample.hotfolder_path)
            : this.i18n.t('smartcrop.dash.printed'),
        );
      }
      this.cropOpen.set(false);
    } finally {
      this.busy.set(false);
    }
  }

  async batchChangeSize(sizeId: string): Promise<void> {
    const size = this.photosService.sizes().find((s) => s.id === sizeId);
    const ids = [...this.selectedIds()];
    if (!size || !ids.length) return;
    this.busy.set(true);
    this.aiBusy.set(true);
    this.toast.set(this.i18n.t('smartcrop.studio.aiWorking'));
    try {
      const remoteIds: string[] = [];
      for (const id of ids) {
        const photo = this.photos().find((p) => p.id === id);
        if (!photo) continue;
        await this.photosService.recropPhotoWithAi(photo, size);
        if (!this.photosService.isLocalOnly(photo)) remoteIds.push(id);
      }
      if (this.api.isConfigured() && remoteIds.length) {
        await this.api.batchUpdate({ photoIds: remoteIds, sizeId });
      }
      this.toast.set(this.i18n.t('smartcrop.dash.simulated'));
    } finally {
      this.busy.set(false);
      this.aiBusy.set(false);
      this.clearSelection();
    }
  }

  async batchDelete(): Promise<void> {
    const ids = [...this.selectedIds()];
    if (!ids.length) return;
    if (!confirm(this.i18n.t('smartcrop.dash.confirmDelete'))) return;
    this.busy.set(true);
    await this.photosService.deletePhotos(ids);
    this.busy.set(false);
    this.clearSelection();
    const first = this.photos()[0];
    this.activeId.set(first?.id ?? null);
  }

  async onSimulateFile(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    if (!file) return;
    await this.onUploadFiles({ files: [file], sizeName: this.uploadSizeName() });
  }

  async onUploadFiles(payload: { files: File[]; sizeName: string }): Promise<void> {
    if (!payload.files.length) return;

    if (!this.auth.user()) {
      this.toast.set(this.i18n.t('smartcrop.dash.needPhone'));
      return;
    }

    this.uploadSizeName.set(payload.sizeName || defaultPrintSize().name);
    this.busy.set(true);
    this.aiBusy.set(true);
    this.toast.set(this.i18n.t('smartcrop.studio.aiWorking'));

    const phone = this.auth.profile()?.phone ?? '';
    let lastId: string | undefined;

    if (this.api.isConfigured() && phone) {
      const remote = await this.api.uploadPhotos({
        files: payload.files,
        sizeName: payload.sizeName,
        senderPhone: phone,
        userId: this.auth.user()?.id,
      });
      if (remote.ok) {
        await this.photosService.refreshAll();
        lastId = remote.photos?.[0]?.photoId;
      } else {
        for (const file of payload.files) {
          const local = await this.photosService.simulateFromFile(file, phone, payload.sizeName);
          if (local.error) {
            this.busy.set(false);
            this.aiBusy.set(false);
            this.toast.set(local.error.message);
            return;
          }
          lastId = local.photoId;
        }
      }
    } else {
      for (const file of payload.files) {
        const local = await this.photosService.simulateFromFile(file, phone, payload.sizeName);
        if (local.error) {
          this.busy.set(false);
          this.aiBusy.set(false);
          this.toast.set(local.error.message);
          return;
        }
        lastId = local.photoId;
      }
    }

    this.aiBusy.set(false);
    const newest = lastId
      ? this.photos().find((p) => p.id === lastId) ?? this.photos()[0]
      : this.photos()[0];
    if (newest) {
      this.activeId.set(newest.id);
      this.compareMode.set(true);
      this.showOriginal.set(false);
    }
    this.busy.set(false);
    this.toast.set(this.i18n.t('smartcrop.dash.simulated'));
  }

  async saveCrop(result: CropSaveResult): Promise<void> {
    const photo = this.activePhoto();
    if (!photo) return;
    this.busy.set(true);
    try {
      if (this.api.isConfigured() && !this.photosService.isLocalOnly(photo)) {
        await this.api.processCrop({
          photoId: photo.id,
          cropData: result.cropData,
          sizeId: result.sizeId,
        });
        await this.photosService.loadPhotos();
      } else {
        await this.photosService.updatePhoto(photo.id, {
          crop_data: result.cropData,
          cropped_url: result.objectUrl ?? photo.cropped_url,
          size_id: result.sizeId ?? photo.size_id,
          target_size_name: result.sizeName ?? photo.target_size_name,
          status: 'pending',
        });
      }
      this.cropOpen.set(false);
    } finally {
      this.busy.set(false);
    }
  }

  async resetAiCrop(): Promise<void> {
    const photo = this.activePhoto();
    if (!photo) return;
    this.busy.set(true);
    this.aiBusy.set(true);
    this.toast.set(this.i18n.t('smartcrop.studio.aiWorking'));
    try {
      const size =
        findPrintSize(this.photosService.sizes(), photo.target_size_name) ||
        findPrintSize(this.photosService.sizes(), photo.size_id) ||
        this.photosService.sizes()[0];
      if (this.api.isConfigured() && !this.photosService.isLocalOnly(photo)) {
        await this.api.processCrop({ photoId: photo.id, resetToAi: true });
        await this.photosService.loadPhotos();
      } else if (size) {
        await this.photosService.recropPhotoWithAi(photo, size);
      } else {
        const result = await smartCropFromUrl(photo.original_url, this.activeAspect());
        const url = URL.createObjectURL(result.blob);
        this.photosService.patchPhoto(photo.id, {
          cropped_url: url,
          crop_data: result.cropData,
        });
      }
      this.compareMode.set(false);
      this.showOriginal.set(false);
      this.toast.set(this.i18n.t('smartcrop.crop.aiDone'));
    } catch (e) {
      this.toast.set(e instanceof Error ? e.message : 'AI crop failed');
    } finally {
      this.aiBusy.set(false);
      this.cropOpen.set(false);
      this.busy.set(false);
    }
  }

  async runGenerativeFill(): Promise<void> {
    const photo = this.activePhoto();
    if (!photo) return;
    if (!this.api.isConfigured() || this.photosService.isLocalOnly(photo)) {
      this.toast.set(this.i18n.t('smartcrop.generative.needApi'));
      return;
    }
    this.generativeBusy.set(true);
    this.busy.set(true);
    this.toast.set(this.i18n.t('smartcrop.generative.working'));
    try {
      const result = await this.api.generativeFill({
        photoId: photo.id,
        userId: this.auth.user()?.id,
        aspectRatio: this.activeAspect(),
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
      await this.photosService.loadPhotos();
      this.compareMode.set(false);
      this.showOriginal.set(false);
      this.cropOpen.set(false);
      this.toast.set(
        result.usedClipdrop
          ? this.i18n.t('smartcrop.generative.done')
          : this.i18n.t('smartcrop.generative.fallback'),
      );
    } catch (e) {
      this.toast.set(e instanceof Error ? e.message : 'Generative fill failed');
    } finally {
      this.generativeBusy.set(false);
      this.busy.set(false);
    }
  }

  /** Notes: Generative Fill launched from the crop editor popup. */
  async onModalGenerativeFill(): Promise<void> {
    await this.runGenerativeFill();
  }

  downloadActive(): void {
    const photo = this.activePhoto();
    const url = photo?.cropped_url || photo?.original_url;
    if (!url) return;
    const a = document.createElement('a');
    a.href = url;
    a.download = `smartcrop-${photo.target_size_name || 'print'}.jpg`;
    a.target = '_blank';
    a.rel = 'noopener';
    a.click();
  }

  async signOut(): Promise<void> {
    try {
      await this.auth.signOut();
    } finally {
      this.photosService.photos.set([]);
      await this.router.navigate(['/smartcrop'], {
        queryParams: { login: '1' },
        replaceUrl: true,
      });
    }
  }

  toggleLang(): void {
    this.i18n.toggleLang();
  }

  async copyStoreCode(code: string): Promise<void> {
    try {
      await navigator.clipboard.writeText(code);
      this.toast.set(this.i18n.t('smartcrop.studio.storeCodeCopied').replace('{code}', code));
    } catch {
      this.toast.set(code);
    }
  }

  /** Notes: Full customer web-upload URL to paste into WhatsApp / SMS. */
  storeUploadUrl(code: string): string {
    const safe = encodeURIComponent(String(code || '').trim().toUpperCase());
    if (typeof window !== 'undefined' && window.location?.origin) {
      return `${window.location.origin}/smartcrop/upload/${safe}`;
    }
    return `https://www.lya-solution.com/smartcrop/upload/${safe}`;
  }

  async copyStoreUploadLink(code: string): Promise<void> {
    const url = this.storeUploadUrl(code);
    try {
      await navigator.clipboard.writeText(url);
      this.toast.set(this.i18n.t('smartcrop.studio.uploadLinkCopied'));
    } catch {
      this.toast.set(url);
    }
  }

  statusClass(status: string): string {
    if (status === 'approved' || status === 'printed') return 'is-ok';
    return 'is-warn';
  }

  statusLabel(status: string): string {
    if (status === 'approved' || status === 'printed') return this.i18n.t('smartcrop.studio.approved');
    return this.i18n.t('smartcrop.studio.pending');
  }

  /** Notes: Truncation / crop-loss → “needs review”; clean AI crop → ready (even if pending). */
  thumbNeedsReview(photo: SmartcropPhoto): boolean {
    const m = photo.crop_data?.metrics;
    if (m) {
      const loss = Number(m.cropLossPercentage) || 0;
      return !!m.hasTruncationRisk || loss > CROP_LOSS_WARN_PERCENT;
    }
    return photo.status === 'pending';
  }

  thumbStatusLabel(photo: SmartcropPhoto): string {
    return this.thumbNeedsReview(photo)
      ? this.i18n.t('smartcrop.studio.thumbNeedsReview')
      : this.i18n.t('smartcrop.studio.thumbReady');
  }

  /** Notes: Show WhatsApp-detected print size on the order card. */
  thumbSizeLabel(photo: SmartcropPhoto): string {
    const raw = (photo.target_size_name || '').trim() || '10x15';
    const size = raw.replace(/[x×]/gi, '×').replace(/\s*ס["״]?מ\s*/gi, '').trim();
    if (this.isActiveThumb(photo)) {
      return this.i18n.t('smartcrop.studio.photoSize').replace('{size}', size);
    }
    return this.i18n.t('smartcrop.studio.sizeCm').replace('{size}', size);
  }

  isSizeSelected(size: { id: string; name: string }): boolean {
    const photo = this.activePhoto();
    if (!photo) return false;
    const matched =
      findPrintSize(this.photosService.sizes(), photo.target_size_name) ||
      findPrintSize(this.photosService.sizes(), photo.size_id);
    return matched?.id === size.id;
  }

  isActiveThumb(photo: SmartcropPhoto): boolean {
    return this.activePhoto()?.id === photo.id;
  }

  isSelected(photoId: string): boolean {
    return this.selectedIds().has(photoId);
  }

  sizeRatioLabel(size: { width_cm: number; height_cm: number }): string {
    let w = Math.round(size.width_cm);
    let h = Math.round(size.height_cm);
    if (!w || !h) return '';
    let a = w;
    let b = h;
    while (b) {
      const t = b;
      b = a % b;
      a = t;
    }
    return `${w / a}:${h / a}`;
  }

  detectionLabel(type: DetectedType | undefined): string {
    if (!type) return '';
    return this.i18n.t(`smartcrop.metrics.type.${type}`);
  }
}
