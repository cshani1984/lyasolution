import { Injectable } from '@angular/core';
import * as mammoth from 'mammoth';
import {
  createEmptyResume,
  createEducation,
  createWorkExperience,
  type CvResume,
} from '../models/cv-resume.model';

@Injectable({ providedIn: 'root' })
export class CvParseService {
  async parseFile(file: File): Promise<CvResume> {
    const ext = file.name.split('.').pop()?.toLowerCase() ?? '';
    let text = '';
    if (ext === 'pdf') {
      text = await this.extractPdfText(file);
    } else if (ext === 'docx' || ext === 'doc') {
      text = await this.extractDocxText(file);
    } else {
      throw new Error('unsupported');
    }
    return this.mapTextToResume(text);
  }

  private async extractPdfText(file: File): Promise<string> {
    const pdfjs = await import('pdfjs-dist');
    pdfjs.GlobalWorkerOptions.workerSrc = `https://cdn.jsdelivr.net/npm/pdfjs-dist@${pdfjs.version}/build/pdf.worker.min.mjs`;

    const buffer = await file.arrayBuffer();
    const doc = await pdfjs.getDocument({ data: buffer }).promise;
    const parts: string[] = [];
    for (let i = 1; i <= doc.numPages; i++) {
      const page = await doc.getPage(i);
      const content = await page.getTextContent();
      const line = content.items
        .map((item) => ('str' in item ? item.str : ''))
        .join(' ');
      parts.push(line);
    }
    return parts.join('\n');
  }

  private async extractDocxText(file: File): Promise<string> {
    const buffer = await file.arrayBuffer();
    const result = await mammoth.extractRawText({ arrayBuffer: buffer });
    return result.value;
  }

  mapTextToResume(raw: string): CvResume {
    const resume = createEmptyResume();
    const text = raw.replace(/\r/g, '');
    const lines = text
      .split('\n')
      .map((l) => l.trim())
      .filter(Boolean);

    const email = text.match(/[\w.+-]+@[\w.-]+\.[a-z]{2,}/i)?.[0] ?? '';
    const phone = text.match(/(?:\+?\d[\d\s\-()]{8,}\d)/)?.[0]?.trim() ?? '';
    resume.contact.email = email;
    resume.contact.phone = phone;

    if (lines.length > 0) {
      const nameParts = lines[0].split(/\s+/).filter(Boolean);
      resume.personal.firstName = nameParts[0] ?? '';
      resume.personal.lastName = nameParts.slice(1).join(' ');
    }

    const sections = this.splitSections(text);
    const summary = sections.get('summary') ?? sections.get('profile') ?? '';
    if (summary) {
      resume.personal.headline = summary.slice(0, 280);
      resume.summary = summary;
    }

    const skillsBlock = sections.get('skills') ?? '';
    if (skillsBlock) {
      resume.skills = skillsBlock
        .split(/[,;|•\n]/)
        .map((s) => s.trim())
        .filter((s) => s.length > 1 && s.length < 48)
        .slice(0, 24);
    }

    const expBlock = sections.get('experience') ?? sections.get('work') ?? '';
    if (expBlock) {
      resume.experiences = this.parseExperienceBlocks(expBlock);
    }

    const eduBlock = sections.get('education') ?? '';
    if (eduBlock) {
      resume.education = this.parseEducationBlocks(eduBlock);
    }

    return resume;
  }

  private splitSections(text: string): Map<string, string> {
    const headers =
      /^(experience|work experience|employment|education|skills|summary|profile|professional summary|ניסיון|השכלה|כישורים|תמצית|סיכום)/im;
    const lines = text.split('\n');
    const map = new Map<string, string>();
    let current = 'body';
    let buf: string[] = [];

    const flush = () => {
      if (buf.length) {
        map.set(current, buf.join('\n').trim());
      }
      buf = [];
    };

    for (const line of lines) {
      const t = line.trim();
      if (headers.test(t) && t.length < 60) {
        flush();
        current = this.normalizeSectionKey(t);
        continue;
      }
      buf.push(line);
    }
    flush();
    return map;
  }

  private normalizeSectionKey(header: string): string {
    const h = header.toLowerCase();
    if (h.includes('skill') || h.includes('כישור')) return 'skills';
    if (h.includes('edu') || h.includes('השכלה')) return 'education';
    if (h.includes('exp') || h.includes('work') || h.includes('ניסיון')) return 'experience';
    if (h.includes('summary') || h.includes('profile') || h.includes('תמצית')) return 'summary';
    return 'body';
  }

  private parseExperienceBlocks(block: string): CvResume['experiences'] {
    const chunks = block.split(/\n{2,}/).filter(Boolean);
    return chunks.slice(0, 6).map((chunk) => {
      const lines = chunk.split('\n').map((l) => l.trim()).filter(Boolean);
      const exp = createWorkExperience();
      exp.jobTitle = lines[0] ?? '';
      exp.company = lines[1] ?? '';
      exp.description = lines.slice(2).join('\n');
      const dates = chunk.match(/(\d{4})(?:[./-](\d{1,2}))?/g);
      if (dates?.[0]) exp.startDate = dates[0].slice(0, 7);
      if (dates?.[1]) exp.endDate = dates[1].slice(0, 7);
      return exp;
    });
  }

  private parseEducationBlocks(block: string): CvResume['education'] {
    const chunks = block.split(/\n{2,}/).filter(Boolean);
    return chunks.slice(0, 4).map((chunk) => {
      const lines = chunk.split('\n').map((l) => l.trim()).filter(Boolean);
      const edu = createEducation();
      edu.institution = lines[0] ?? '';
      edu.degree = lines[1] ?? '';
      edu.description = lines.slice(2).join('\n');
      const years = chunk.match(/\d{4}/g);
      if (years?.length) edu.yearsText = years.join(' – ');
      return edu;
    });
  }
}
