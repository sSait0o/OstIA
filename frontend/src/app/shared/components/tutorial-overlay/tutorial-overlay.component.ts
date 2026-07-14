import { Component, ElementRef, HostListener, ViewChild, computed, effect, inject, signal } from '@angular/core';
import { TutorialService } from '@core/services/tutorial.service';

interface HighlightRect {
  top: number;
  left: number;
  width: number;
  height: number;
}

const MEASURE_DELAY_MS = 260;
const MEASURE_MAX_RETRIES = 15;
const MEASURE_RETRY_DELAY_MS = 150;
const TOOLTIP_WIDTH = 320;
const TOOLTIP_HEIGHT = 170;
const MARGIN = 16;

@Component({
  selector: 'app-tutorial-overlay',
  standalone: true,
  templateUrl: './tutorial-overlay.component.html',
  styleUrl: './tutorial-overlay.component.scss',
})
export class TutorialOverlayComponent {
  readonly tutorial = inject(TutorialService);

  @ViewChild('tooltipEl') tooltipEl?: ElementRef<HTMLDivElement>;

  readonly highlightRect = signal<HighlightRect | null>(null);
  readonly tooltipTop = signal(0);
  readonly tooltipLeft = signal(0);

  readonly blockerClipPath = computed(() => {
    const step = this.tutorial.currentStep();
    const rect = this.highlightRect();
    if (!rect || !step?.requiresClick) {
      return 'none';
    }
    const w = window.innerWidth;
    const h = window.innerHeight;
    const x1 = rect.left;
    const y1 = rect.top;
    const x2 = rect.left + rect.width;
    const y2 = rect.top + rect.height;
    return `polygon(evenodd, 0px 0px, ${w}px 0px, ${w}px ${h}px, 0px ${h}px, 0px 0px, ` +
      `${x1}px ${y1}px, ${x1}px ${y2}px, ${x2}px ${y2}px, ${x2}px ${y1}px, ${x1}px ${y1}px)`;
  });

  constructor() {
    effect(() => {
      const step = this.tutorial.currentStep();
      const active = this.tutorial.active();
      if (active && step) {
        const target = step.target;
        setTimeout(() => this.measure(target, MEASURE_MAX_RETRIES), MEASURE_DELAY_MS);
      } else {
        this.highlightRect.set(null);
      }
    });
  }

  @HostListener('window:resize')
  onResize() {
    const step = this.tutorial.currentStep();
    if (this.tutorial.active() && step) {
      this.measure(step.target);
    }
  }

  @HostListener('document:click', ['$event'])
  onDocumentClick(event: MouseEvent) {
    const step = this.tutorial.currentStep();
    if (!this.tutorial.active() || !step?.requiresClick) {
      return;
    }
    const target = document.querySelector(step.target);
    if (target && event.target instanceof Node && (target === event.target || target.contains(event.target))) {
      this.tutorial.next();
    }
  }

  next() {
    this.tutorial.next();
  }

  prev() {
    this.tutorial.prev();
  }

  skip() {
    this.tutorial.skip();
  }

  private measure(selector: string, retriesLeft = 0) {
    const el = document.querySelector(selector);
    if (!el) {
      if (retriesLeft > 0) {
        setTimeout(() => this.measure(selector, retriesLeft - 1), MEASURE_RETRY_DELAY_MS);
        return;
      }
      this.tutorial.next();
      return;
    }

    const rect = el.getBoundingClientRect();
    const padding = 8;
    const highlight: HighlightRect = {
      top: rect.top - padding,
      left: rect.left - padding,
      width: rect.width + padding * 2,
      height: rect.height + padding * 2,
    };
    this.highlightRect.set(highlight);

    setTimeout(() => this.positionTooltip(highlight), 0);
  }

  private positionTooltip(highlight: HighlightRect) {
    const tooltipHeight = this.tooltipEl?.nativeElement.offsetHeight || TOOLTIP_HEIGHT;
    const tooltipWidth = this.tooltipEl?.nativeElement.offsetWidth || TOOLTIP_WIDTH;

    const spaceBelow = window.innerHeight - (highlight.top + highlight.height);
    const placeBelow = spaceBelow > tooltipHeight + MARGIN || highlight.top < tooltipHeight + MARGIN;

    const rawTooltipTop = placeBelow
      ? highlight.top + highlight.height + 14
      : highlight.top - tooltipHeight - 14;
    this.tooltipTop.set(
      Math.min(Math.max(rawTooltipTop, MARGIN), Math.max(window.innerHeight - tooltipHeight - MARGIN, MARGIN)),
    );
    this.tooltipLeft.set(
      Math.min(Math.max(highlight.left, MARGIN), Math.max(window.innerWidth - tooltipWidth - MARGIN, MARGIN)),
    );
  }
}
