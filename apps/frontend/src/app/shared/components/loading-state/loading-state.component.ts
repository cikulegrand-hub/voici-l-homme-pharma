import { Component, Input } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';

@Component({
  selector: 'app-loading-state',
  standalone: true,
  imports: [CommonModule, MatProgressSpinnerModule],
  template: `
    <div class="loading-container">
      <mat-spinner [diameter]="diameter" color="primary"></mat-spinner>
      <p class="loading-message">{{ message }}</p>
    </div>
  `,
  styles: [`
    .loading-container {
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      padding: 48px 24px;
      gap: 16px;
    }

    .loading-message {
      color: var(--vhp-text-secondary, #5f6368);
      font-size: 14px;
    }
  `],
})
export class LoadingStateComponent {
  @Input() message = 'Chargement en cours...';
  @Input() diameter = 40;
}

