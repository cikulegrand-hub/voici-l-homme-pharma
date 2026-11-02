import { Injectable, inject } from '@angular/core';
import { MatSnackBar, MatSnackBarConfig } from '@angular/material/snack-bar';

@Injectable({
  providedIn: 'root',
})
export class AlertService {
  private readonly snackBar = inject(MatSnackBar);

  private readonly defaultConfig: MatSnackBarConfig = {
    duration: 5000,
    horizontalPosition: 'end',
    verticalPosition: 'top',
  };

  success(message: string, action = 'OK'): void {
    this.snackBar.open(message, action, {
      ...this.defaultConfig,
      panelClass: ['snack-success'],
    });
  }

  error(message: string, action = 'Fermer'): void {
    this.snackBar.open(message, action, {
      ...this.defaultConfig,
      duration: 7000,
      panelClass: ['snack-error'],
    });
  }

  warning(message: string, action = 'Compris'): void {
    this.snackBar.open(message, action, {
      ...this.defaultConfig,
      panelClass: ['snack-warning'],
    });
  }

  info(message: string, action = 'OK'): void {
    this.snackBar.open(message, action, {
      ...this.defaultConfig,
      panelClass: ['snack-info'],
    });
  }
}

