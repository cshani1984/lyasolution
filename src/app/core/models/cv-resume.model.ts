export type CvBuilderMode = 'scratch' | 'upload';

export type CvBuilderStepId =
  | 'upload'
  | 'personal'
  | 'contact'
  | 'experience'
  | 'skills'
  | 'education'
  | 'summary'
  | 'extra';

export interface CvPersonal {
  firstName: string;
  lastName: string;
  desiredRole: string;
  headline: string;
}

export interface CvContact {
  email: string;
  phone: string;
  country: string;
  city: string;
  address: string;
  zip: string;
}

export interface CvWorkExperience {
  id: string;
  jobTitle: string;
  company: string;
  startDate: string;
  endDate: string;
  /** When true, end date is hidden and the role is treated as ongoing. */
  currentJob: boolean;
  location: string;
  description: string;
}

export interface CvEducation {
  id: string;
  institution: string;
  degree: string;
  yearsText: string;
  startDate: string;
  endDate: string;
  description: string;
}

export type CvExtraSectionKind =
  | 'websites'
  | 'portfolios'
  | 'profiles'
  | 'languages'
  | 'software'
  | 'additional'
  | 'hobbies'
  | 'custom';

export interface CvCustomSection {
  id: string;
  kind: CvExtraSectionKind;
  title: string;
  body: string;
}

export interface CvResume {
  personal: CvPersonal;
  contact: CvContact;
  experiences: CvWorkExperience[];
  skills: string[];
  education: CvEducation[];
  summary: string;
  customSections: CvCustomSection[];
}

export type CvEnhanceField = 'headline' | 'experience' | 'summary' | 'education';

export function createEmptyResume(): CvResume {
  return {
    personal: { firstName: '', lastName: '', desiredRole: '', headline: '' },
    contact: { email: '', phone: '', country: '', city: '', address: '', zip: '' },
    experiences: [createWorkExperience()],
    skills: [],
    education: [createEducation()],
    summary: '',
    customSections: [],
  };
}

export function createWorkExperience(): CvWorkExperience {
  return {
    id: crypto.randomUUID(),
    jobTitle: '',
    company: '',
    startDate: '',
    endDate: '',
    currentJob: false,
    location: '',
    description: '',
  };
}

export function createEducation(): CvEducation {
  return {
    id: crypto.randomUUID(),
    institution: '',
    degree: '',
    yearsText: '',
    startDate: '',
    endDate: '',
    description: '',
  };
}

export function createCustomSection(partial?: Partial<Omit<CvCustomSection, 'id'>>): CvCustomSection {
  return {
    id: crypto.randomUUID(),
    kind: 'custom',
    title: '',
    body: '',
    ...partial,
  };
}

export const CV_EXTRA_SECTION_KINDS = [
  'websites',
  'portfolios',
  'profiles',
  'languages',
  'software',
  'additional',
  'hobbies',
] as const satisfies readonly CvExtraSectionKind[];
