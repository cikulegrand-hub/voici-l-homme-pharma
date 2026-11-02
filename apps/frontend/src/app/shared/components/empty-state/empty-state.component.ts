import { Component, Input } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';

@Component({
  selector: 'app-empty-state',
  standalone: true,
  imports: [CommonModule, MatIconModule, MatButtonModule],
  template: `
    <div class="empty-container">
      <mat-icon class="empty-icon">{{ icon }}</mat-icon>
      <h3 class="empty-title">{{ title }}</h3>
      <p class="empty-description" *ngIf="description">{{ description }}</p>
      <button
        mat-flat-button
        color="primary"
        *ngIf="actionLabel"
        (click)="onAction()"
        class="empty-action"
      >
        {{ actionLabel }}
      </button>
    </div>
  `,
  styles: [`
    .empty-container {
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      padding: 64px 24px;
      text-align: center;
    }

    .empty-icon {
      font-size: 64px;
      width: 64px;
      height: 64px;
      color: #dadce0;
      margin-bottom: 16px;
    }

    .empty-title {
      font-size: 18px;
      font-weight: 600;
      color: var(--vhp-text-primary, #202124);
      margin-bottom: 8px;
    }

    .empty-description {
      font-size: 14px;
      color: var(--vhp-text-secondary, #5f6368);
      max-width: 400px;
      margin-bottom: 24px;
    }
  `],
})
export class EmptyStateComponent {
  @Input() icon = 'inbox';
  @Input() title = 'Aucune donnée';
  @Input() description?: string;
  @Input() actionLabel?: string;
  @Input() actionCallback?: () => void;

  onAction(): void {
    if (this.actionCallback) {
      this.actionCallback();
    }
  }
}

