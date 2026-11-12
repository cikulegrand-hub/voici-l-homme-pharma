import { Component, OnInit, OnDestroy, inject, effect } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterOutlet } from '@angular/router';
import { AuthService } from './core/auth/auth.service';
import { InactivityService } from './core/auth/inactivity.service';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [CommonModule, RouterOutlet],
  template: `<router-outlet></router-outlet>`,
  styles: [`
    :host {
      display: block;
      height: 100vh;
      width: 100vw;
    }
  `],
})
export class AppComponent implements OnInit, OnDestroy {
  private readonly authService = inject(AuthService);
  private readonly inactivityService = inject(InactivityService);

  constructor() {
    // Démarre ou stoppe automatiquement le watcher d'inactivité et la synchronisation temps réel des habilitations
    effect(() => {
      if (this.authService.isAuthenticated()) {
        this.inactivityService.startWatcher();
        this.authService.startPermissionSync();
      } else {
        this.inactivityService.stopWatcher();
        this.authService.stopPermissionSync();
      }
    });
  }

  ngOnInit(): void {
    if (this.authService.isAuthenticated()) {
      this.inactivityService.startWatcher();
      this.authService.startPermissionSync();
    }
  }

  ngOnDestroy(): void {
    this.inactivityService.stopWatcher();
    this.authService.stopPermissionSync();
  }
}
