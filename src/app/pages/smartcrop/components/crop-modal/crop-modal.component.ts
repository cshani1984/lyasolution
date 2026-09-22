import {
  Component,
  ElementRef,
  EventEmitter,
  HostListener,
  Input,
  OnChanges,
  Output,
  SimpleChanges,
  ViewChild,
  inject,
  signal,
} from '@angular/core';
import { DecimalPipe } from '@angular/common';
import type { CropData, SmartcropPhoto } from '../../../../core/models/smartcrop.model';
import { I18nService } from '../../../../core/services/i18n.service';

@Component({
  selector: 'app-smartcrop-crop-modal',
  standalone: true,
  imports: [DecimalPipe],
  templateUrl: './crop-modal.component.html',
  styleUrl: './crop-modal.component.scss',
})
export class SmartcropCropModalComponent implements OnChanges {
  readonly i18n = inject(I18nService);

  @Input() photo: SmartcropPhoto | null = null;
  @Input() aspectRatio = 2 / 3;
  @Input() open = false;

  @Output() readonly closed = new EventEmitter<void>();
  @Output() readonly saved = new EventEmitter<CropData>();
  @Output() readonly resetAi = new EventEmitter<void>();

  @ViewChild('stage') stageRef?: ElementRef<HTMLDivElement>;

  readonly zoom = signal(1);
  readonly offsetX = signal(0);
  readonly offsetY = signal(0);
  readonly dragging = signal(false);

  private dragStartX = 0;
  private dragStartY = 0;
  private originX = 0;
  private originY = 0;
  private naturalW = 0;
  private naturalH = 0;

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['photo'] || changes['open']) {
      this.zoom.set(this.photo?.crop_data?.zoom ?? 1);
      this.offsetX.set(0);
      this.offsetY.set(0);
    }
  }

  onImageLoad(event: Event): void {
    const img = event.target as HTMLImageElement;
    this.naturalW = img.naturalWidth;
    this.naturalH = img.naturalHeight;
  }

  onPointerDown(event: PointerEvent): void {
    this.dragging.set(true);
    this.dragStartX = event.clientX;
    this.dragStartY = event.clientY;
    this.originX = this.offsetX();
    this.originY = this.offsetY();
    (event.target as HTMLElement).setPointerCapture?.(event.pointerId);
  }

  onPointerMove(event: PointerEvent): void {
    if (!this.dragging()) return;
    this.offsetX.set(this.originX + (event.clientX - this.dragStartX));
    this.offsetY.set(this.originY + (event.clientY - this.dragStartY));
  }

  onPointerUp(): void {
    this.dragging.set(false);
  }

  onZoomInput(event: Event): void {
    const v = Number((event.target as HTMLInputElement).value);
    this.zoom.set(v);
  }

  @HostListener('document:keydown.escape')
  onEsc(): void {
    if (this.open) this.closed.emit();
  }

  save(): void {
    const stage = this.stageRef?.nativeElement;
    if (!stage || !this.photo || !this.naturalW || !this.naturalH) {
      this.closed.emit();
      return;
    }

    const stageW = stage.clientWidth;
    const stageH = stage.clientHeight;
    const z = this.zoom();

    // Displayed image covers the stage (object-fit cover) then scaled by zoom
    const coverScale = Math.max(stageW / this.naturalW, stageH / this.naturalH) * z;
    const dispW = this.naturalW * coverScale;
    const dispH = this.naturalH * coverScale;
    const imgLeft = (stageW - dispW) / 2 + this.offsetX();
    const imgTop = (stageH - dispH) / 2 + this.offsetY();

    // Crop frame is full stage with aspect CSS — stage itself is aspect-locked
    const cropX = Math.max(0, Math.min(this.naturalW, (-imgLeft) / coverScale));
    const cropY = Math.max(0, Math.min(this.naturalH, (-imgTop) / coverScale));
    const cropW = Math.min(this.naturalW - cropX, stageW / coverScale);
    const cropH = Math.min(this.naturalH - cropY, stageH / coverScale);

    const cropData: CropData = {
      x: Math.round(cropX),
      y: Math.round(cropY),
      width: Math.round(cropW),
      height: Math.round(cropH),
      zoom: z,
      focalPoint: { x: cropX + cropW / 2, y: cropY + cropH * 0.4 },
      isManuallyEdited: true,
    };
    this.saved.emit(cropData);
  }
}
