import { Injectable, NgZone, inject } from '@angular/core';
import { fromEvent, merge, Subscription, timer } from 'rxjs';
import { switchMap, tap, throttleTime } from 'rxjs/operators';
import { AuthService } from './auth.service';

@Injectable({
  providedIn: 'root',
})
export class InactivityService {
  private readonly authService = inject(AuthService);
  private readonly ngZone = inject(NgZone);

  private timeoutMinutes = 15; // Défaut : 15 min selon AUT-03
  private activitySubscription?: Subscription;

  /**
   * Configure le délai d'inactivité avant déconnexion automatique
   * @param minutes Délai en minutes
   */
  setTimeoutMinutes(minutes: number): void {
    if (minutes > 0) {
      this.timeoutMinutes = minutes;
      if (this.activitySubscription) {
        this.restartWatcher();
      }
    }
  }

  getTimeoutMinutes(): number {
    return this.timeoutMinutes;
  }

  startWatcher(): void {
    this.stopWatcher();

    const timeoutMs = this.timeoutMinutes * 60 * 1000;

    this.ngZone.runOutsideAngular(() => {
      const activityEvents$ = merge(
        fromEvent(document, 'mousemove'),
        fromEvent(document, 'keydown'),
        fromEvent(document, 'click'),
        fromEvent(document, 'touchstart'),
        fromEvent(document, 'scroll'),
      ).pipe(
        throttleTime(1000),
        switchMap(() => timer(timeoutMs)),
      );

      this.activitySubscription = activityEvents$.subscribe(() => {
        this.ngZone.run(() => {
          if (this.authService.isAuthenticated()) {
            this.authService.logout('inactivity');
          }
        });
      });
    });
  }

  stopWatcher(): void {
    if (this.activitySubscription) {
      this.activitySubscription.unsubscribe();
      this.activitySubscription = undefined;
    }
  }

  private restartWatcher(): void {
    this.startWatcher();
  }
}

