import { Routes } from '@angular/router';
import { authGuard } from './core/guards/auth.guard';
import { permissionGuard } from './core/guards/permission.guard';
import { MainLayoutComponent } from './core/layout/main-layout.component';

export const routes: Routes = [
  {
    path: 'login',
    loadComponent: () =>
      import('./features/auth/login.component').then((m) => m.LoginComponent),
  },
  {
    path: '',
    component: MainLayoutComponent,
    canActivate: [authGuard],
    children: [
      {
        path: '',
        redirectTo: 'dashboard',
        pathMatch: 'full',
      },
      {
        path: 'dashboard',
        loadComponent: () =>
          import('./features/dashboard/dashboard.component').then(
            (m) => m.DashboardComponent,
          ),
      },
      {
        path: 'pos',
        canActivate: [permissionGuard],
        data: { permission: ['pos.access', 'vente.creer'] },
        loadComponent: () =>
          import('./features/pos/pos.component').then((m) => m.PosComponent),
      },
      {
        path: 'sales',
        canActivate: [permissionGuard],
        data: { permission: 'vente.creer' },
        loadComponent: () =>
          import('./features/sales/sales-history.component').then((m) => m.SalesHistoryComponent),
      },
      {
        path: 'catalog',
        canActivate: [permissionGuard],
        data: { permission: 'catalogue.consulter' },
        loadComponent: () =>
          import('./features/catalog/catalog.component').then(
            (m) => m.CatalogComponent,
          ),
      },
      {
        path: 'catalog/new',
        canActivate: [permissionGuard],
        data: { permission: ['catalogue.creer', 'catalogue.modifier'] },
        loadComponent: () =>
          import('./features/catalog/product-form.component').then(
            (m) => m.ProductFormComponent,
          ),
      },
      {
        path: 'catalog/:id/edit',
        canActivate: [permissionGuard],
        data: { permission: ['catalogue.creer', 'catalogue.modifier'] },
        loadComponent: () =>
          import('./features/catalog/product-form.component').then(
            (m) => m.ProductFormComponent,
          ),
      },
      {
        path: 'stock',
        canActivate: [permissionGuard],
        data: { permission: 'stock.consulter' },
        loadComponent: () =>
          import('./features/stock/stock.component').then(
            (m) => m.StockComponent,
          ),
      },
      {
        path: 'reception',
        canActivate: [permissionGuard],
        data: { permission: 'stock.recevoir' },
        loadComponent: () =>
          import('./features/stock/reception.component').then(
            (m) => m.ReceptionComponent,
          ),
      },
      {
        path: 'customers',
        canActivate: [permissionGuard],
        data: { permission: ['clients.consulter', 'client.consulter'] },
        loadComponent: () =>
          import('./features/customers/customers.component').then(
            (m) => m.CustomersComponent,
          ),
      },
      {
        path: 'suppliers',
        canActivate: [permissionGuard],
        data: { permission: 'stock.consulter' },
        loadComponent: () =>
          import('./features/suppliers/suppliers.component').then(
            (m) => m.SuppliersComponent,
          ),
      },
      {
        path: 'cash',
        canActivate: [permissionGuard],
        data: { permission: ['caisse.ouvrir', 'caisse.cloturer', 'finances.consulter'] },
        loadComponent: () =>
          import('./features/cash/cash.component').then(
            (m) => m.CashComponent,
          ),
      },
      {
        path: 'reports',
        canActivate: [permissionGuard],
        data: { permission: ['rapports.dashboard', 'rapports.consulter'] },
        loadComponent: () =>
          import('./features/reports/reports.component').then(
            (m) => m.ReportsComponent,
          ),
      },
      {
        path: 'reports/:reportKey',
        canActivate: [permissionGuard],
        data: { permission: ['rapports.dashboard', 'rapports.consulter'] },
        loadComponent: () =>
          import('./features/reports/reports.component').then(
            (m) => m.ReportsComponent,
          ),
      },
      {
        path: 'audit',
        canActivate: [permissionGuard],
        data: { permission: 'audit.consulter' },
        loadComponent: () =>
          import('./features/audit/audit.component').then(
            (m) => m.AuditComponent,
          ),
      },
      {
        path: 'settings',
        canActivate: [permissionGuard],
        data: { permission: 'parametres.modifier' },
        loadComponent: () =>
          import('./features/settings/settings.component').then(
            (m) => m.SettingsComponent,
          ),
      },
      {
        path: 'settings/exchange-rates',
        canActivate: [permissionGuard],
        data: { permission: 'taux.modifier' },
        loadComponent: () =>
          import('./features/settings/exchange-rates.component').then(
            (m) => m.ExchangeRatesComponent,
          ),
      },
      {
        path: 'settings/import',
        canActivate: [permissionGuard],
        data: { permission: 'parametres.modifier' },
        loadComponent: () =>
          import('./features/settings/import-wizard.component').then(
            (m) => m.ImportWizardComponent,
          ),
      },
      // ── Module AUT : Gestion des utilisateurs ──
      {
        path: 'users',
        canActivate: [permissionGuard],
        data: { permission: 'admin.utilisateurs' },
        loadComponent: () =>
          import('./features/auth/users-list.component').then(
            (m) => m.UsersListComponent,
          ),
      },
      {
        path: 'users/new',
        canActivate: [permissionGuard],
        data: { permission: 'admin.utilisateurs' },
        loadComponent: () =>
          import('./features/auth/user-form.component').then(
            (m) => m.UserFormComponent,
          ),
      },
      {
        path: 'users/:id/edit',
        canActivate: [permissionGuard],
        data: { permission: 'admin.utilisateurs' },
        loadComponent: () =>
          import('./features/auth/user-form.component').then(
            (m) => m.UserFormComponent,
          ),
      },
      // ── Module AUT : Mon profil ──
      {
        path: 'profile',
        loadComponent: () =>
          import('./features/auth/profile.component').then(
            (m) => m.ProfileComponent,
          ),
      },
      {
        path: 'notifications',
        loadComponent: () =>
          import('./features/notifications/notifications.component').then(
            (m) => m.NotificationsComponent,
          ),
      },
    ],
  },
  {
    path: '**',
    redirectTo: 'dashboard',
  },
];
