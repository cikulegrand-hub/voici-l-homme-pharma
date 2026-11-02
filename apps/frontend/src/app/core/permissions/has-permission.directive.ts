import {
  Directive,
  Input,
  TemplateRef,
  ViewContainerRef,
  inject,
  effect,
} from '@angular/core';
import { PermissionService } from './permission.service';

/**
 * Directive structurelle *hasPermission
 *
 * Usage :
 *   <button *hasPermission="'vente.annuler'">Annuler</button>
 *   <div *hasPermission="['stock.ajuster', 'stock.entree']; requireAll: false">...</div>
 */
@Directive({
  selector: '[hasPermission]',
  standalone: true,
})
export class HasPermissionDirective {
  private readonly permissionService = inject(PermissionService);
  private readonly templateRef = inject(TemplateRef<any>);
  private readonly viewContainer = inject(ViewContainerRef);

  private requiredPermissions: string | string[] = '';
  private requireAll = false;
  private hasView = false;

  constructor() {
    // Re-évaluation réactive dans le contexte d'injection du constructeur
    effect(() => {
      this.permissionService.getAllPermissions();
      this.updateView();
    });
  }

  @Input()
  set hasPermission(value: string | string[]) {
    this.requiredPermissions = value;
    this.updateView();
  }

  @Input()
  set hasPermissionRequireAll(value: boolean) {
    this.requireAll = value;
    this.updateView();
  }

  private updateView(): void {
    const allowed = this.permissionService.hasPermission(
      this.requiredPermissions,
      this.requireAll,
    );

    if (allowed && !this.hasView) {
      this.viewContainer.createEmbeddedView(this.templateRef);
      this.hasView = true;
    } else if (!allowed && this.hasView) {
      this.viewContainer.clear();
      this.hasView = false;
    }
  }
}
