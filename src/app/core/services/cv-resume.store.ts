import { Injectable, computed, signal } from '@angular/core';
import {
  createCustomSection,
  createEducation,
  createEmptyResume,
  createWorkExperience,
  type CvBuilderMode,
  type CvBuilderStepId,
  type CvCustomSection,
  type CvResume,
} from '../models/cv-resume.model';
import { pickRandomSkills, suggestSkillsForRole } from '../data/cv-skills.data';
import type { Lang } from './i18n.service';

const STORAGE_KEY = 'lya-cv-draft';

const SCRATCH_STEPS: CvBuilderStepId[] = [
  'personal',
  'contact',
  'experience',
  'skills',
  'education',
  'summary',
  'extra',
];

const UPLOAD_STEPS: CvBuilderStepId[] = ['upload', ...SCRATCH_STEPS];

@Injectable({ providedIn: 'root' })
export class CvResumeStore {
  readonly mode = signal<CvBuilderMode>('scratch');
  readonly resume = signal<CvResume>(this.loadDraft() ?? createEmptyResume());
  readonly currentStep = signal<CvBuilderStepId>('personal');
  readonly suggestedSkills = signal<string[]>([]);
  readonly parsing = signal(false);
  readonly parseError = signal<string | null>(null);

  readonly steps = computed(() => (this.mode() === 'upload' ? UPLOAD_STEPS : SCRATCH_STEPS));

  readonly stepIndex = computed(() => {
    const steps = this.steps();
    const idx = steps.indexOf(this.currentStep());
    return idx >= 0 ? idx : 0;
  });

  init(mode: CvBuilderMode, lang: Lang = 'en'): void {
    this.mode.set(mode);
    const draft = this.loadDraft();
    if (draft && mode === 'scratch') {
      this.resume.set(draft);
    } else if (!draft || mode === 'upload') {
      this.resume.set(createEmptyResume());
    }
    this.currentStep.set(mode === 'upload' ? 'upload' : 'personal');
    this.refreshSkillSuggestions(lang);
  }

  persist(): void {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(this.resume()));
    } catch {
      /* ignore */
    }
  }

  private loadDraft(): CvResume | null {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return null;
      return JSON.parse(raw) as CvResume;
    } catch {
      return null;
    }
  }

  patchResume(patch: Partial<CvResume>): void {
    this.resume.update((r) => ({ ...r, ...patch }));
    this.persist();
  }

  updatePersonal(partial: Partial<CvResume['personal']>): void {
    this.resume.update((r) => ({ ...r, personal: { ...r.personal, ...partial } }));
    this.persist();
  }

  updateContact(partial: Partial<CvResume['contact']>): void {
    this.resume.update((r) => ({ ...r, contact: { ...r.contact, ...partial } }));
    this.persist();
  }

  setSummary(summary: string): void {
    this.resume.update((r) => ({ ...r, summary }));
    this.persist();
  }

  addExperience(): void {
    this.resume.update((r) => ({
      ...r,
      experiences: [...r.experiences, createWorkExperience()],
    }));
    this.persist();
  }

  removeExperience(id: string): void {
    this.resume.update((r) => ({
      ...r,
      experiences: r.experiences.filter((e) => e.id !== id),
    }));
    this.persist();
  }

  updateExperience(id: string, partial: Partial<CvResume['experiences'][0]>): void {
    this.resume.update((r) => ({
      ...r,
      experiences: r.experiences.map((e) => (e.id === id ? { ...e, ...partial } : e)),
    }));
    this.persist();
  }

  addEducation(): void {
    this.resume.update((r) => ({
      ...r,
      education: [...r.education, createEducation()],
    }));
    this.persist();
  }

  removeEducation(id: string): void {
    this.resume.update((r) => ({
      ...r,
      education: r.education.filter((e) => e.id !== id),
    }));
    this.persist();
  }

  updateEducation(id: string, partial: Partial<CvResume['education'][0]>): void {
    this.resume.update((r) => ({
      ...r,
      education: r.education.map((e) => (e.id === id ? { ...e, ...partial } : e)),
    }));
    this.persist();
  }

  toggleSkill(skill: string): void {
    this.resume.update((r) => {
      const has = r.skills.includes(skill);
      return {
        ...r,
        skills: has ? r.skills.filter((s) => s !== skill) : [...r.skills, skill],
      };
    });
    this.persist();
  }

  addSkill(skill: string): void {
    const trimmed = skill.trim();
    if (!trimmed) return;
    this.resume.update((r) =>
      r.skills.includes(trimmed) ? r : { ...r, skills: [...r.skills, trimmed] },
    );
    this.persist();
  }

  removeSkill(skill: string): void {
    this.resume.update((r) => ({ ...r, skills: r.skills.filter((s) => s !== skill) }));
    this.persist();
  }

  refreshSkillSuggestions(lang: Lang): void {
    const role = this.resume().personal.desiredRole;
    const pool = suggestSkillsForRole(role, lang);
    const picked = pickRandomSkills(pool, 10, this.resume().skills);
    this.suggestedSkills.set(picked);
  }

  addCustomSection(partial?: Partial<Omit<CvCustomSection, 'id'>>): void {
    this.resume.update((r) => ({
      ...r,
      customSections: [...r.customSections, createCustomSection(partial)],
    }));
    this.persist();
  }

  removeCustomSection(id: string): void {
    this.resume.update((r) => ({
      ...r,
      customSections: r.customSections.filter((s) => s.id !== id),
    }));
    this.persist();
  }

  updateCustomSection(id: string, partial: Partial<CvResume['customSections'][0]>): void {
    this.resume.update((r) => ({
      ...r,
      customSections: r.customSections.map((s) => (s.id === id ? { ...s, ...partial } : s)),
    }));
    this.persist();
  }

  applyParsedResume(resume: CvResume, lang: Lang): void {
    this.resume.set(resume);
    this.persist();
    this.refreshSkillSuggestions(lang);
    this.currentStep.set('personal');
  }

  goToStep(step: CvBuilderStepId): void {
    if (this.steps().includes(step)) {
      this.currentStep.set(step);
    }
  }

  nextStep(): void {
    const steps = this.steps();
    const idx = steps.indexOf(this.currentStep());
    if (idx < steps.length - 1) {
      this.currentStep.set(steps[idx + 1]);
    }
  }

  prevStep(): void {
    const steps = this.steps();
    const idx = steps.indexOf(this.currentStep());
    if (idx > 0) {
      this.currentStep.set(steps[idx - 1]);
    }
  }
}
