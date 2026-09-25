import {
  Component,
  EventEmitter,
  Input,
  OnChanges,
  Output,
  SimpleChanges,
  inject,
  signal,
} from '@angular/core';
import { DecimalPipe } from '@angular/common';
import type { CropMetrics, SmartcropPhoto } from '../../../../core/models/smartcrop.model';
import { I18nService } from '../../../../core/services/i18n.service';
import {
  CROP_LOSS_WARN_PERCENT,
  confidenceTone,
} from '../../../../core/smartcrop/crop-engine.math';
import { blindCenterCropFromUrl } from '../../../../core/smartcrop/crop-engine.client';

@Component({
  selector: 'app-smartcrop-photo-comparison-card',
  standalone: true,
  imports: [DecimalPipe],
  templateUrl: './photo-comparison-card.component.html',
  styleUrl: './photo-comparison-card.component.scss',
})
export class SmartcropPhotoComparisonCardComponent implements OnChanges {
  readonly i18n = inject(I18nService);
  readonly cropLossWarn = CROP_LOSS_WARN_PERCENT;

  @Input({ required: true }) photo!: SmartcropPhoto;
  @Input() aspectRatio = 2 / 3;
  @Input() sizeLabel = '';
  @Input() blindUrl: string | null = null;

  @Output() readonly edit = new EventEmitter<void>();
  @Output() readonly resetAi = new EventEmitter<void>();

  readonly localBlindUrl = signal<string | null>(null);
  readonly blindBusy = signal(false);

  private ownedBlind: string | null = null;

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['photo'] || changes['aspectRatio'] || changes['blindUrl']) {
      void this.ensureBlindPreview();
    }
  }

  metrics(): CropMetrics | null {
    return this.photo?.crop_data?.metrics ?? null;
  }

  confidenceClass(): string {
    const m = this.metrics();
    if (!m) return 'is-muted';
    return `is-${confidenceTone(m.confidenceScore)}`;
  }

  lossDanger(): boolean {
    const m = this.metrics();
    if (!m) return false;
    return m.hasTruncationRisk || m.cropLossPercentage > CROP_LOSS_WARN_PERCENT;
  }

  foreheadLossHint(): number {
    const m = this.metrics();
    const loss = m?.cropLossPercentage ?? 18;
    return Math.max(12, Math.min(28, Math.round(loss * 0.75)));
  }

  badWarnText(): string {
    return this.i18n.t('smartcrop.compare.badWarn').replace('{n}', String(this.foreheadLossHint()));
  }

  detectionLabel(): string {
    const type = this.metrics()?.detectedType;
    if (!type) return '';
    return this.i18n.t(`smartcrop.metrics.type.${type}`);
  }

  resolvedBlindUrl(): string {
    return this.blindUrl || this.localBlindUrl() || this.photo.original_url;
  }

  private async ensureBlindPreview(): Promise<void> {
    if (this.blindUrl) {
      this.revokeOwned();
      this.localBlindUrl.set(null);
      return;
    }
    if (!this.photo?.original_url) return;
    this.blindBusy.set(true);
    try {
      const blob = await blindCenterCropFromUrl(this.photo.original_url, this.aspectRatio);
      this.revokeOwned();
      const url = URL.createObjectURL(blob);
      this.ownedBlind = url;
      this.localBlindUrl.set(url);
    } catch {
      this.localBlindUrl.set(null);
    } finally {
      this.blindBusy.set(false);
    }
  }

  private revokeOwned(): void {
    if (this.ownedBlind) {
      URL.revokeObjectURL(this.ownedBlind);
      this.ownedBlind = null;
    }
  }
}
