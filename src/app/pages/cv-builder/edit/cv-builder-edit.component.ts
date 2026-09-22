import { Component, DestroyRef, effect, inject, OnInit, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { CvParseService } from '../../../core/services/cv-parse.service';
import { CvResumeStore } from '../../../core/services/cv-resume.store';
import {
  CV_EXTRA_SECTION_KINDS,
  type CvBuilderMode,
  type CvBuilderStepId,
  type CvCustomSection,
  type CvExtraSectionKind,
} from '../../../core/models/cv-resume.model';
import { I18nService } from '../../../core/services/i18n.service';
import { CvEnhanceFieldComponent } from '../components/cv-enhance-field/cv-enhance-field.component';

@Component({
  selector: 'app-cv-builder-edit',
  standalone: true,
  imports: [FormsModule, RouterLink, CvEnhanceFieldComponent],
  templateUrl: './cv-builder-edit.component.html',
  styleUrl: './cv-builder-edit.component.scss',
})
export class CvBuilderEditComponent implements OnInit {
  readonly i18n = inject(I18nService);
  readonly store = inject(CvResumeStore);
  private readonly route = inject(ActivatedRoute);
  private readonly parseService = inject(CvParseService);
  private readonly destroyRef = inject(DestroyRef);

  readonly newSkill = signal('');
  readonly summaryMode = signal<'text' | 'voice'>('text');
  readonly listening = signal(false);
  readonly uploadDrag = signal(false);
  readonly extraSectionKinds = CV_EXTRA_SECTION_KINDS;

  /** Summary text before the current voice utterance (avoids duplicate appends). */
  private voiceBaseSummary = '';

  private recognition: SpeechRecognitionLike | null = null;

  constructor() {
    effect(() => {
      this.store.refreshSkillSuggestions(this.i18n.lang());
    });

    this.destroyRef.onDestroy(() => this.stopVoice());
  }

  ngOnInit(): void {
    const mode = (this.route.snapshot.queryParamMap.get('mode') === 'upload'
      ? 'upload'
      : 'scratch') as CvBuilderMode;
    this.store.init(mode, this.i18n.lang());

    this.route.queryParamMap.pipe(takeUntilDestroyed(this.destroyRef)).subscribe((params) => {
      const m = params.get('mode') === 'upload' ? 'upload' : 'scratch';
      if (m !== this.store.mode()) {
        this.store.init(m, this.i18n.lang());
      }
    });
  }

  stepLabel(step: CvBuilderStepId): string {
    return this.i18n.t(`cv.edit.step.${step}`);
  }

  isStepDone(step: CvBuilderStepId): boolean {
    return this.store.steps().indexOf(step) < this.store.stepIndex();
  }

  isStepActive(step: CvBuilderStepId): boolean {
    return this.store.currentStep() === step;
  }

  onFileSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (file) {
      void this.handleUpload(file);
    }
    input.value = '';
  }

  onDrop(event: DragEvent): void {
    event.preventDefault();
    this.uploadDrag.set(false);
    const file = event.dataTransfer?.files?.[0];
    if (file) {
      void this.handleUpload(file);
    }
  }

  async handleUpload(file: File): Promise<void> {
    const ext = file.name.split('.').pop()?.toLowerCase();
    if (!ext || !['pdf', 'docx', 'doc'].includes(ext)) {
      this.store.parseError.set(this.i18n.t('cv.edit.upload.errorType'));
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      this.store.parseError.set(this.i18n.t('cv.edit.upload.errorSize'));
      return;
    }

    this.store.parsing.set(true);
    this.store.parseError.set(null);
    try {
      const resume = await this.parseService.parseFile(file);
      this.store.applyParsedResume(resume, this.i18n.lang());
    } catch {
      this.store.parseError.set(this.i18n.t('cv.edit.upload.errorParse'));
    } finally {
      this.store.parsing.set(false);
    }
  }

  addSkillFromInput(): void {
    this.store.addSkill(this.newSkill());
    this.newSkill.set('');
    this.store.refreshSkillSuggestions(this.i18n.lang());
  }

  refreshSuggestions(): void {
    this.store.refreshSkillSuggestions(this.i18n.lang());
  }

  addExtraSection(kind: CvExtraSectionKind): void {
    this.store.addCustomSection({
      kind,
      title: this.i18n.t(`cv.edit.extra.kind.${kind}`),
      body: '',
    });
  }

  sectionPlaceholder(sec: CvCustomSection): string {
    const kind = sec.kind ?? 'custom';
    if (kind !== 'custom') {
      return this.i18n.t(`cv.edit.extra.placeholder.${kind}`);
    }
    return this.i18n.t('cv.edit.extra.sectionBody');
  }

  toggleVoice(): void {
    if (this.listening()) {
      this.stopVoice();
      return;
    }
    this.summaryMode.set('voice');
    this.startVoice();
  }

  startVoice(): void {
    const SR = getSpeechRecognitionCtor();
    if (!SR) {
      return;
    }

    this.voiceBaseSummary = this.store.resume().summary.trim();

    this.recognition = new SR();
    this.recognition.lang = this.i18n.lang() === 'he' ? 'he-IL' : 'en-US';
    // Stop automatically after the user pauses (end of utterance).
    this.recognition.continuous = false;
    this.recognition.interimResults = true;

    this.recognition.onresult = (ev) => {
      let sessionFinal = '';
      let interim = '';
      for (let i = 0; i < ev.results.length; i++) {
        const result = ev.results[i];
        const text = result[0]?.transcript ?? '';
        if (!text) {
          continue;
        }
        if (result.isFinal) {
          sessionFinal += text;
        } else {
          interim += text;
        }
      }
      this.applyVoiceTranscript(sessionFinal, interim);
    };

    this.recognition.onend = () => {
      this.listening.set(false);
      this.recognition = null;
    };

    this.recognition.onerror = () => {
      this.listening.set(false);
      this.recognition = null;
    };

    try {
      this.recognition.start();
      this.listening.set(true);
    } catch {
      this.listening.set(false);
      this.recognition = null;
    }
  }

  stopVoice(): void {
    if (this.recognition) {
      try {
        this.recognition.stop();
      } catch {
        /* already stopped */
      }
      this.recognition = null;
    }
    this.listening.set(false);
  }

  private applyVoiceTranscript(sessionFinal: string, interim: string): void {
    const parts = [this.voiceBaseSummary, sessionFinal.trim(), interim.trim()].filter(Boolean);
    this.store.setSummary(parts.join(' '));
  }

  formatMonth(value: string): string {
    if (!value) return '';
    const [y, m] = value.split('-');
    return m && y ? `${m}/${y}` : value;
  }

  setExperienceCurrent(id: string, current: boolean): void {
    const exp = this.store.resume().experiences.find((e) => e.id === id);
    if (!exp) {
      return;
    }
    this.store.updateExperience(id, {
      currentJob: current,
      endDate: current ? '' : exp.endDate,
    });
  }

  formatExperienceEnd(exp: { currentJob?: boolean; endDate: string }): string {
    if (exp.currentJob) {
      return this.i18n.t('cv.edit.experience.present');
    }
    return this.formatMonth(exp.endDate);
  }

  hasExperiencePreview(): boolean {
    return this.store.resume().experiences.some((e) => e.jobTitle || e.company);
  }

  hasEducationPreview(): boolean {
    return this.store.resume().education.some((e) => e.institution || e.degree);
  }
}

interface SpeechRecognitionResultLike {
  0: { transcript: string };
  isFinal: boolean;
}

interface SpeechRecognitionEventLike {
  resultIndex: number;
  results: ArrayLike<SpeechRecognitionResultLike>;
}

interface SpeechRecognitionLike {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  onresult: ((ev: SpeechRecognitionEventLike) => void) | null;
  onend: (() => void) | null;
  onerror: (() => void) | null;
  start(): void;
  stop(): void;
}

function getSpeechRecognitionCtor(): (new () => SpeechRecognitionLike) | null {
  const win = window as unknown as {
    SpeechRecognition?: new () => SpeechRecognitionLike;
    webkitSpeechRecognition?: new () => SpeechRecognitionLike;
  };
  return win.SpeechRecognition ?? win.webkitSpeechRecognition ?? null;
}
