/**
 * OpenAI Responses API — CV text enhancement (official openai SDK).
 * Set OPENAI_API_KEY in .env (never commit the key).
 */
import OpenAI from 'openai';

const OPENAI_API_KEY = (process.env.OPENAI_API_KEY ?? '').trim();
const OPENAI_MODEL = (process.env.OPENAI_MODEL ?? 'gpt-5.4-mini').trim();

/** @type {OpenAI | null} */
let client = null;

function getClient() {
  if (!OPENAI_API_KEY) {
    return null;
  }
  if (!client) {
    client = new OpenAI({ apiKey: OPENAI_API_KEY });
  }
  return client;
}

export function isOpenAiConfigured() {
  return Boolean(OPENAI_API_KEY);
}

const FIELD_HINTS = {
  headline: {
    en: 'professional headline / short career summary (2–4 sentences)',
    he: 'תמצית מקצועית קצרה (2–4 משפטים)',
  },
  summary: {
    en: 'professional summary — often the first thing recruiters read',
    he: 'סיכום מקצועי — לרוב הדבר הראשון שמגייסים קוראים',
  },
  experience: {
    en: 'work experience description with strong action verbs and measurable impact',
    he: 'תיאור ניסיון תעסוקתי עם פעלים חזקים והשפעה מדידה',
  },
  education: {
    en: 'education entry — degree highlights, projects, honors',
    he: 'השכלה — הדגשת תואר, פרויקטים והישגים',
  },
};

function buildInstructions(field, lang, desiredRole) {
  const isHe = lang === 'he';
  const hint = FIELD_HINTS[field]?.[lang] ?? FIELD_HINTS.summary[lang];
  const roleLine = desiredRole
    ? isHe
      ? `תפקיד מבוקש: ${desiredRole}.`
      : `Target role: ${desiredRole}.`
    : '';

  if (isHe) {
    return `אתה מגייס מומחה וכותב קורות חיים מקצועי.
שכתב את הטקסט הבא עבור: ${hint}.
${roleLine}
כללים: שמור על עובדות ומשמעות מקורית; אל תמציא נתונים; שפר ניסוח, בהירות ומשיכה למגייסים; השתמש בנקודות (•) כשמתאים.
החזר רק את הטקסט המשופר, בלי הקדמות או הסברים.`;
  }

  return `You are an expert recruiter and professional CV writer.
Rewrite the following text for: ${hint}.
${roleLine}
Rules: preserve facts and original meaning; do not invent data; improve clarity, impact, and recruiter appeal; use bullet points (•) where appropriate.
Return only the improved text, with no preamble or explanation.`;
}

/**
 * @param {{ text: string; field: string; lang: string; desiredRole?: string }} opts
 */
export async function enhanceCvText(opts) {
  const openai = getClient();
  if (!openai) {
    throw new Error('OPENAI_API_KEY not configured');
  }

  const { text, field, lang, desiredRole = '' } = opts;
  const instructions = buildInstructions(field, lang === 'he' ? 'he' : 'en', desiredRole.trim());

  try {
    const response = await openai.responses.create({
      model: OPENAI_MODEL,
      instructions,
      input: text,
      store: false,
    });

    const out = typeof response.output_text === 'string' ? response.output_text.trim() : '';
    if (!out) {
      throw new Error('OpenAI returned empty output');
    }
    return out;
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    throw new Error(msg);
  }
}
