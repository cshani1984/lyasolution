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
 * correctionDelta = offset between geometric center and AI focal point.
 */
export interface CropCorrectionDelta {
  /** Horizontal offset in px (AI focal − geometric center). */
  dx: number;
  /** Vertical offset in px (AI focal − geometric center). */
  dy: number;
  /** Euclidean distance in px. */
  distancePx: number;
  /** Distance as % of image diagonal (0–100). */
  distancePercent: number;
}

export interface CropMetrics {
  detectedType: DetectedType;
  confidenceScore: number;
  cropLossPercentage: number;
  headPaddingApplied: boolean;
  hasTruncationRisk: boolean;
  correctionDelta?: CropCorrectionDelta;
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
  /** End-customer WhatsApp / phone (not the shop). */
  sender_phone: string;
  customer_name?: string | null;
  copies?: number | null;
  paper_type?: string | null;
  caption_text?: string | null;
  parsed_summary?: string | null;
  /** Combined NLP + AI confidence 0–100. */
  parse_confidence?: number | null;
  /** Lab hotfolder path e.g. C:\Hotfolder\Dani_Klein_10x15 */
  hotfolder_path?: string | null;
  original_url: string;
  cropped_url: string | null;
  size_id: string | null;
  target_size_name: string;
  crop_data: CropData | null;
  status: PhotoStatus;
  created_at: string;
}

/** Shop CRM customer row (grouped by phone under shop account). */
export interface ShopCustomer {
  id?: string;
  phone: string;
  full_name: string | null;
  photo_count: number;
  pending_count: number;
  last_order_at?: string;
}
