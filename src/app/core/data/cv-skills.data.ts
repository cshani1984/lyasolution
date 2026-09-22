import type { Lang } from '../services/i18n.service';

type SkillBucket = 'developer' | 'fullstack' | 'director' | 'designer' | 'product' | 'default';

const SKILLS_BY_ROLE: Record<SkillBucket, Record<Lang, string[]>> = {
  developer: {
    en: [
      'TypeScript',
      'JavaScript',
      'Angular',
      'React',
      'Node.js',
      'REST APIs',
      'SQL',
      'Git',
      'CI/CD',
      'Unit testing',
      'System design',
      'Agile',
    ],
    he: [
      'TypeScript',
      'JavaScript',
      'Angular',
      'React',
      'Node.js',
      'ממשקי REST',
      'SQL',
      'Git',
      'CI/CD',
      'בדיקות יחידה',
      'תכנון מערכות',
      'Agile',
    ],
  },
  fullstack: {
    en: [
      'Full Stack development',
      'TypeScript',
      'Angular',
      'Node.js',
      'PostgreSQL',
      'Cloud (AWS)',
      'Docker',
      'API design',
      'Code review',
      'Team leadership',
    ],
    he: [
      'פיתוח Full Stack',
      'TypeScript',
      'Angular',
      'Node.js',
      'PostgreSQL',
      'ענן (AWS)',
      'Docker',
      'עיצוב API',
      'Code review',
      'מנהיגות צוות',
    ],
  },
  director: {
    en: [
      'R&D leadership',
      'Engineering strategy',
      'Hiring & mentoring',
      'Roadmap planning',
      'Stakeholder management',
      'Budget ownership',
      'Cross-functional collaboration',
      'Delivery excellence',
    ],
    he: [
      'הובלת מו״פ',
      'אסטרטגיה הנדסית',
      'גיוס והכשרה',
      'תכנון Roadmap',
      'ניהול בעלי עניין',
      'אחריות תקציבית',
      'שיתוף פעולה בין-מחלקתי',
      'מצוינות באספקה',
    ],
  },
  designer: {
    en: [
      'UI/UX design',
      'Figma',
      'Design systems',
      'User research',
      'Prototyping',
      'Accessibility',
      'Visual design',
      'Usability testing',
    ],
    he: [
      'עיצוב UI/UX',
      'Figma',
      'מערכות עיצוב',
      'מחקר משתמשים',
      'אב טיפוס',
      'נגישות',
      'עיצוב ויזואלי',
      'בדיקות שימושיות',
    ],
  },
  product: {
    en: [
      'Product management',
      'Roadmapping',
      'User stories',
      'Analytics',
      'A/B testing',
      'Stakeholder alignment',
      'Go-to-market',
      'Prioritization',
    ],
    he: [
      'ניהול מוצר',
      'תכנון Roadmap',
      'User stories',
      'אנליטיקה',
      'A/B testing',
      'יישור בעלי עניין',
      'Go-to-market',
      'תעדוף',
    ],
  },
  default: {
    en: [
      'Communication',
      'Problem solving',
      'Teamwork',
      'Time management',
      'Leadership',
      'Microsoft Office',
      'Project management',
      'Customer focus',
      'Adaptability',
      'Attention to detail',
    ],
    he: [
      'תקשורת',
      'פתרון בעיות',
      'עבודת צוות',
      'ניהול זמן',
      'מנהיגות',
      'Microsoft Office',
      'ניהול פרויקטים',
      'מיקוד לקוח',
      'יכולת הסתגלות',
      'תשומת לב לפרטים',
    ],
  },
};

function resolveBucket(role: string): SkillBucket {
  const key = role.toLowerCase();

  if (key.includes('full') || key.includes('stack') || key.includes('פול')) {
    return 'fullstack';
  }
  if (
    key.includes('director') ||
    key.includes('rd') ||
    key.includes('r&d') ||
    key.includes('מנהל') ||
    key.includes('ראש')
  ) {
    return 'director';
  }
  if (key.includes('design') || key.includes('ux') || key.includes('ui') || key.includes('עיצוב')) {
    return 'designer';
  }
  if (key.includes('product') || key.includes('מוצר')) {
    return 'product';
  }
  if (
    key.includes('dev') ||
    key.includes('engineer') ||
    key.includes('מתכנת') ||
    key.includes('מפתח')
  ) {
    return 'developer';
  }
  return 'default';
}

export function suggestSkillsForRole(role: string, lang: Lang): string[] {
  const bucket = resolveBucket(role);
  return [...SKILLS_BY_ROLE[bucket][lang]];
}

export function pickRandomSkills(pool: string[], count: number, exclude: string[]): string[] {
  const available = pool.filter((s) => !exclude.includes(s));
  const shuffled = [...available].sort(() => Math.random() - 0.5);
  return shuffled.slice(0, count);
}
