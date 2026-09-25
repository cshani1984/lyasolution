/**
 * Next.js / React reference — AI vs blind center crop (landing-style dual card).
 * Angular live twin: `src/app/pages/smartcrop/components/photo-comparison-card/`
 */
'use client';

export interface ComparisonMetrics {
  detectedType?: 'face' | 'object' | 'saliency_landscape';
  confidenceScore: number;
  cropLossPercentage: number;
  headPaddingApplied?: boolean;
  hasTruncationRisk?: boolean;
  correctionDelta?: { distancePercent: number; dx: number; dy: number };
}

export interface PhotoComparisonCardProps {
  lang?: 'he' | 'en';
  sizeLabel: string;
  originalUrl: string;
  aiCroppedUrl: string;
  /** Blind geometric-center crop (lab waste preview). */
  blindCropUrl?: string | null;
  metrics?: ComparisonMetrics | null;
  onEdit?: () => void;
  onResetAi?: () => void;
}

function confidenceTone(score: number): 'green' | 'yellow' | 'red' {
  if (score > 80) return 'green';
  if (score >= 60) return 'yellow';
  return 'red';
}

export function PhotoComparisonCard({
  lang = 'he',
  sizeLabel,
  originalUrl,
  aiCroppedUrl,
  blindCropUrl,
  metrics,
  onEdit,
  onResetAi,
}: PhotoComparisonCardProps) {
  const he = lang === 'he';
  const conf = metrics?.confidenceScore ?? 0;
  const loss = metrics?.cropLossPercentage ?? 0;
  const tone = confidenceTone(conf);

  return (
    <div className="sc-compare-card" dir={he ? 'rtl' : 'ltr'}>
      <header className="sc-compare-card__head">
        <div>
          <h3>{he ? 'מנוע חיתוך AI מול חיתוך מרכזי טיפש' : 'AI Smart Crop vs Blind Center Crop'}</h3>
          <p>{he ? `סימולציית הדפסה ${sizeLabel}` : `Print simulation ${sizeLabel}`}</p>
        </div>
        {metrics && (
          <span className={`sc-compare-card__face is-${tone}`}>
            {he ? `זיהוי ${conf.toFixed(0)}%` : `${conf.toFixed(0)}% detected`}
          </span>
        )}
      </header>

      <div className="sc-compare-card__badges">
        {metrics && (
          <>
            <span className={`badge is-${tone}`}>
              🎯 {conf.toFixed(0)}% {he ? 'זיהוי פנים' : 'confidence'}
            </span>
            <span className={`badge${loss > 25 ? ' is-danger' : ''}`}>
              ✂️ {loss.toFixed(0)}% {he ? 'נחתך מהמקור' : 'cropped out'}
            </span>
            <span className="badge is-ratio">📐 {sizeLabel}</span>
            {metrics.correctionDelta && (
              <span className="badge">
                Δ {metrics.correctionDelta.distancePercent.toFixed(1)}%
              </span>
            )}
          </>
        )}
      </div>

      <div className="sc-compare-card__dual">
        <article className="crop-panel">
          <div className="crop-panel__title is-bad">
            <span>{he ? 'חיתוך מרכזי רגיל (עיוור)' : 'Regular center crop (blind)'}</span>
            <em>{he ? 'פסולת דפוס' : 'Print waste'}</em>
          </div>
          <div className="crop-panel__frame is-bad">
            <img src={blindCropUrl || originalUrl} alt="" />
            <div className="crop-panel__warn">
              <span>
                {he
                  ? `חיתוך ראש קריטי: נחתך ${Math.max(12, Math.round(loss * 0.7))}% מהפדחת`
                  : `Critical head crop: ~${Math.max(12, Math.round(loss * 0.7))}% forehead lost`}
              </span>
            </div>
          </div>
          <p>
            {he
              ? 'חיתוך אוטומטי למרכז גאומטרי במעבדות קלאסיות — ראשים נחתכים, תלונות ונייר מבוזבז.'
              : 'Classic lab geometric center crop often chops heads — complaints and wasted paper.'}
          </p>
        </article>

        <article className="crop-panel">
          <div className="crop-panel__title is-good">
            <span>{he ? 'מנוע חיתוך SmartCrop AI' : 'SmartCrop AI engine'}</span>
            <em>{he ? '100% הדפסה מושלמת' : '100% perfect print'}</em>
          </div>
          <div className="crop-panel__frame">
            <img src={aiCroppedUrl} alt="" />
            <div className="crop-panel__safe">
              <span>{he ? '+15% מרווח ביטחון לשיער' : '+15% hair headroom'}</span>
              <span>{he ? 'מרכז עין חכם' : 'Smart eye center'}</span>
            </div>
          </div>
          <p>
            {he
              ? 'המנוע מזהה קודקוד, פנים ומרכז כובד — ושומר על מרווח נשימה מקצועי להדפסה.'
              : 'Detects crown, face, and center of mass — keeps professional breathing room for print.'}
          </p>
        </article>
      </div>

      <footer className="sc-compare-card__actions">
        {onEdit && (
          <button type="button" onClick={onEdit}>
            {he ? 'עריכה / מרכוז מחדש' : 'Edit / Re-Center'}
          </button>
        )}
        {onResetAi && (
          <button type="button" onClick={onResetAi}>
            {he ? 'איפוס ל־AI אוטומטי' : 'Reset to AI Auto-Center'}
          </button>
        )}
      </footer>
    </div>
  );
}

export default PhotoComparisonCard;
