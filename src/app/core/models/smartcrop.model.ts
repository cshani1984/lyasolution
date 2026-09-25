export type SmartcropLang = 'he' | 'en';

export type OrderStatus = 'pending' | 'processing' | 'approved' | 'sent_to_print' | 'completed';
export type PhotoStatus = 'pending' | 'approved' | 'printed';

export interface PrintSize {
  id: string;
  name: string;
  width_cm: number;
  height_cm: number;
  aspect_ratio: number;
  is_default: boolean;
}

export interface CropFocalPoint {
  x: number;
  y: number;
}

export type FocalPoint = CropFocalPoint;

/** Detection cascade outcome from the crop engine. */
export type DetectedType = 'face' | 'object' | 'saliency_landscape';

/** Axis-aligned rectangle in image pixel space. */
export interface BoundingBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * Notes: Persisted AI metrics for admin badges.
 * confidenceScore 0–100; cropLossPercentage = discarded original area %.
 */
export interface CropMetrics {
  detectedType: DetectedType;
  confidenceScore: number;
  cropLossPercentage: number;
  headPaddingApplied: boolean;
  hasTruncationRisk: boolean;
}

export interface CropData {
  x: number;
  y: number;
  width: number;
  height: number;
  zoom: number;
  rotation?: number;
  focalPoint: CropFocalPoint;
  isManuallyEdited: boolean;
  metrics?: CropMetrics;
}

/** Result from the ngx-image-cropper modal. */
export interface CropSaveResult {
  cropData: CropData;
  /** Browser object URL for the cropped JPEG (demo / local preview). */
  objectUrl?: string;
  blob?: Blob;
  sizeId?: string;
  sizeName?: string;
}

export interface SmartcropProfile {
  id: string;
  email: string | null;
  phone: string | null;
  full_name: string | null;
  avatar_url: string | null;
  language: SmartcropLang;
  created_at: string;
}

export interface SmartcropOrder {
  id: string;
  user_id: string;
  status: OrderStatus;
  total_photos: number;
  created_at: string;
}

export interface SmartcropPhoto {
  id: string;
  order_id: string | null;
  user_id: string | null;
  sender_phone: string;
  original_url: string;
  cropped_url: string | null;
  size_id: string | null;
  target_size_name: string;
  crop_data: CropData | null;
  status: PhotoStatus;
  created_at: string;
}
