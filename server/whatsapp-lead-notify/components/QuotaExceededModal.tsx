/**
 * Next.js reference UI for over-quota Generative Fill.
 * Live Angular twin: `src/app/pages/smartcrop/components/quota-exceeded-modal/`
 */
'use client';

import type { CSSProperties } from 'react';

export interface QuotaExceededModalProps {
  open: boolean;
  supportUrl: string;
  onClose: () => void;
}

export function QuotaExceededModal({ open, supportUrl, onClose }: QuotaExceededModalProps) {
  if (!open) return null;

  return (
    <div role="dialog" aria-modal="true" style={overlay}>
      <div style={panel}>
        <h2 style={{ margin: 0 }}>🛑 הגעת למכסת ה-AI החודשית</h2>
        <p style={{ color: '#455a64', lineHeight: 1.5 }}>
          החיתוך והמרכוז האוטומטי הרגיל ממשיכים לעבוד בחינם ללא הגבלה! לשדרוג מכסת ה-Generative
          Fill צור קשר עם התמיכה.
        </p>
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', flexWrap: 'wrap' }}>
          <button type="button" onClick={onClose} style={ghostBtn}>
            סגור
          </button>
          <a href={supportUrl} target="_blank" rel="noopener noreferrer" style={primaryBtn}>
            💬 פנה לתמיכה בוואטסאפ לשדרוג החבילה
          </a>
        </div>
      </div>
    </div>
  );
}

const overlay: CSSProperties = {
  position: 'fixed',
  inset: 0,
  zIndex: 100,
  display: 'grid',
  placeItems: 'center',
  padding: 16,
  background: 'rgba(15,23,42,0.5)',
};

const panel: CSSProperties = {
  width: 'min(440px, 100%)',
  background: '#fff',
  borderRadius: 18,
  padding: 20,
  display: 'grid',
  gap: 12,
  boxShadow: '0 12px 40px rgba(0,0,0,0.18)',
};

const ghostBtn: CSSProperties = {
  padding: '10px 14px',
  borderRadius: 12,
  border: '1px solid #cfd8dc',
  background: '#fff',
  cursor: 'pointer',
};

const primaryBtn: CSSProperties = {
  padding: '10px 14px',
  borderRadius: 12,
  background: '#25d366',
  color: '#fff',
  fontWeight: 700,
  textDecoration: 'none',
};
