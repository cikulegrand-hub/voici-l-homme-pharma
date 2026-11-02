import { Component, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MatCardModule } from '@angular/material/card';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatStepperModule } from '@angular/material/stepper';
import { MatTableModule } from '@angular/material/table';
import { MatChipsModule } from '@angular/material/chips';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatDialog, MatDialogModule } from '@angular/material/dialog';

import { SettingsApiService } from '../../core/api/services/settings-api.service';
import { AlertService } from '../../core/services/alert.service';
import { ConfirmDialogComponent } from '../../shared/components/confirm-dialog/confirm-dialog.component';
import { I18N_FR } from '../../core/i18n/translations.fr';
import { ImportType, ImportSimulationResult, ImportRejectedRow } from '@vhp/shared';

@Component({
  selector: 'app-import-wizard',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    MatCardModule,
    MatButtonModule,
    MatIconModule,
    MatStepperModule,
    MatTableModule,
    MatChipsModule,
    MatProgressSpinnerModule,
    MatTooltipModule,
    MatDialogModule,
  ],
  template: `
    <div class="import-page">
      <header class="page-header">
        <div>
          <h2>{{ i18n.importWizard.title }}</h2>
          <p class="subtitle">{{ i18n.importWizard.subtitle }}</p>
        </div>
      </header>

      <mat-card class="wizard-card">
        <!-- Étape 1 : Choix du type de données -->
        @if (currentStep() === 1) {
          <div class="step-container">
            <h3 class="step-title">{{ i18n.importWizard.step1Title }}</h3>
            <p class="step-desc">Sélectionnez la catégorie de données que vous souhaitez initialiser dans le système.</p>

            <div class="type-cards-grid">
              <div
                class="type-card"
                [class.selected]="selectedType() === 'PRODUITS'"
                (click)="selectType('PRODUITS')"
              >
                <mat-icon class="type-icon">medication</mat-icon>
                <h4>{{ i18n.importWizard.typeProducts }}</h4>
                <p>Noms, DCI, formes galéniques, prix de vente CDF/USD, TVA et codes-barres.</p>
                <button
                  mat-stroked-button
                  color="primary"
                  type="button"
                  (click)="downloadTemplate('PRODUITS', $event)"
                  class="template-btn"
                >
                  <mat-icon>file_download</mat-icon> Modèle CSV
                </button>
              </div>

              <div
                class="type-card"
                [class.selected]="selectedType() === 'STOCK'"
                (click)="selectType('STOCK')"
              >
                <mat-icon class="type-icon">inventory_2</mat-icon>
                <h4>{{ i18n.importWizard.typeStock }}</h4>
                <p>Numéros de lots, dates de péremption, quantités initiales et prix d'achat.</p>
                <button
                  mat-stroked-button
                  color="primary"
                  type="button"
                  (click)="downloadTemplate('STOCK', $event)"
                  class="template-btn"
                >
                  <mat-icon>file_download</mat-icon> Modèle CSV
                </button>
              </div>

              <div
                class="type-card"
                [class.selected]="selectedType() === 'FOURNISSEURS'"
                (click)="selectType('FOURNISSEURS')"
              >
                <mat-icon class="type-icon">local_shipping</mat-icon>
                <h4>{{ i18n.importWizard.typeSuppliers }}</h4>
                <p>Raison sociale, contact, téléphone, adresse et conditions de paiement.</p>
                <button
                  mat-stroked-button
                  color="primary"
                  type="button"
                  (click)="downloadTemplate('FOURNISSEURS', $event)"
                  class="template-btn"
                >
                  <mat-icon>file_download</mat-icon> Modèle CSV
                </button>
              </div>

              <div
                class="type-card"
                [class.selected]="selectedType() === 'CLIENTS'"
                (click)="selectType('CLIENTS')"
              >
                <mat-icon class="type-icon">groups</mat-icon>
                <h4>{{ i18n.importWizard.typeCustomers }}</h4>
                <p>Fiches clients, entreprises partenaires, plafonds de crédit et coordonnées.</p>
                <button
                  mat-stroked-button
                  color="primary"
                  type="button"
                  (click)="downloadTemplate('CLIENTS', $event)"
                  class="template-btn"
                >
                  <mat-icon>file_download</mat-icon> Modèle CSV
                </button>
              </div>
            </div>

            <div class="step-nav">
              <span class="spacer"></span>
              <button
                mat-flat-button
                color="primary"
                [disabled]="!selectedType()"
                (click)="goToStep(2)"
              >
                Continuer vers l'upload <mat-icon>arrow_forward</mat-icon>
              </button>
            </div>
          </div>
        }

        <!-- Étape 2 : Chargement du fichier -->
        @if (currentStep() === 2) {
          <div class="step-container">
            <h3 class="step-title">{{ i18n.importWizard.step2Title }} - {{ getSelectedTypeLabel() }}</h3>
            <p class="step-desc">{{ i18n.importWizard.uploadInstruction }}</p>

            <div class="upload-dropzone" (click)="fileInput.click()">
              <input
                #fileInput
                type="file"
                accept=".csv,.txt"
                (change)="onFileSelected($event)"
                style="display: none;"
              />
              <mat-icon class="upload-icon">cloud_upload</mat-icon>
              <div class="upload-text">
                <strong>Cliquez ici pour choisir un fichier CSV</strong>
                <span>Format attendu : délimiteur virgule (,) ou point-virgule (;) encodage UTF-8</span>
              </div>
            </div>

            @if (parsedRows().length > 0) {
              <div class="file-loaded-info">
                <mat-icon color="primary">check_circle</mat-icon>
                <span>Fichier sélectionné : <strong>{{ fileName() }}</strong> ({{ parsedRows().length }} lignes détectées)</span>
              </div>
            }

            <div class="step-nav">
              <button mat-button (click)="goToStep(1)">
                <mat-icon>arrow_back</mat-icon> Retour
              </button>
              <span class="spacer"></span>
              <button
                mat-flat-button
                color="primary"
                [disabled]="parsedRows().length === 0 || isSimulating()"
                (click)="startSimulation()"
              >
                @if (isSimulating()) {
                  <mat-spinner diameter="18" class="btn-spinner"></mat-spinner>
                }
                {{ i18n.importWizard.simulateButton }}
              </button>
            </div>
          </div>
        }

        <!-- Étape 3 : Rapport de simulation -->
        @if (currentStep() === 3 && simulationResult()) {
          <div class="step-container">
            <h3 class="step-title">{{ i18n.importWizard.step3Title }}</h3>
            <p class="step-desc">Rapport de vérification avant écriture en base. Aucune donnée n'a été modifiée.</p>

            <!-- Statistiques de simulation -->
            <div class="stats-cards-grid">
              <div class="stat-card">
                <div class="stat-number">{{ simulationResult()!.totalRows }}</div>
                <div class="stat-label">{{ i18n.importWizard.totalRows }}</div>
              </div>
              <div class="stat-card success">
                <div class="stat-number">{{ simulationResult()!.validCount }}</div>
                <div class="stat-label">{{ i18n.importWizard.validRows }}</div>
              </div>
              <div class="stat-card danger">
                <div class="stat-number">{{ simulationResult()!.rejectedCount }}</div>
                <div class="stat-label">{{ i18n.importWizard.rejectedRows }}</div>
              </div>
            </div>

            <!-- Liste des lignes rejetées si présentes -->
            @if (simulationResult()!.rejectedCount > 0) {
              <div class="rejected-section">
                <div class="rejected-header">
                  <div class="rejected-title">
                    <mat-icon color="warn">warning</mat-icon>
                    <strong>Détail des lignes rejetées (à corriger avant import)</strong>
                  </div>
                  <button mat-stroked-button color="warn" (click)="exportRejections()">
                    <mat-icon>download</mat-icon> {{ i18n.importWizard.exportRejected }}
                  </button>
                </div>

                <div class="table-scroll">
                  <table mat-table [dataSource]="simulationResult()!.rejectedRows" class="rejections-table">
                    <ng-container matColumnDef="row">
                      <th mat-header-cell *matHeaderCellDef>{{ i18n.importWizard.rowNumber }}</th>
                      <td mat-cell *matCellDef="let r"><strong>#{{ r.row }}</strong></td>
                    </ng-container>

                    <ng-container matColumnDef="data">
                      <th mat-header-cell *matHeaderCellDef>Données brutes</th>
                      <td mat-cell *matCellDef="let r" class="raw-data-cell">
                        {{ formatRowData(r.data) }}
                      </td>
                    </ng-container>

                    <ng-container matColumnDef="reason">
                      <th mat-header-cell *matHeaderCellDef>{{ i18n.importWizard.rejectionReason }}</th>
                      <td mat-cell *matCellDef="let r" class="reason-cell">
                        <span class="error-pill">{{ r.reason }}</span>
                      </td>
                    </ng-container>

                    <tr mat-header-row *matHeaderRowDef="rejectedColumns"></tr>
                    <tr mat-row *matRowDef="let row; columns: rejectedColumns;"></tr>
                  </table>
                </div>
              </div>
            }

            <!-- Aperçu des lignes valides -->
            @if (simulationResult()!.validCount > 0 && simulationResult()!.sampleValid?.length) {
              <div class="sample-section">
                <h4>Aperçu des lignes valides (échantillon prêt à l'insertion) :</h4>
                <div class="sample-box">
                  @for (sample of simulationResult()!.sampleValid; track $index) {
                    <div class="sample-item">
                      <mat-icon color="primary">check</mat-icon>
                      <span>{{ formatRowData(sample) }}</span>
                    </div>
                  }
                </div>
              </div>
            }

            <div class="step-nav">
              <button mat-button (click)="goToStep(2)">
                <mat-icon>arrow_back</mat-icon> Recharger un fichier
              </button>
              <span class="spacer"></span>
              <button
                mat-flat-button
                color="primary"
                [disabled]="simulationResult()!.validCount === 0 || isExecuting()"
                (click)="confirmExecution()"
              >
                @if (isExecuting()) {
                  <mat-spinner diameter="18" class="btn-spinner"></mat-spinner>
                }
                {{ i18n.importWizard.executeButton }} ({{ simulationResult()!.validCount }})
              </button>
            </div>
          </div>
        }

        <!-- Étape 4 : Succès définitif -->
        @if (currentStep() === 4) {
          <div class="success-container">
            <mat-icon class="success-icon">check_circle</mat-icon>
            <h3>{{ i18n.importWizard.importSuccess }}</h3>
            <p><strong>{{ insertedCount() }}</strong> enregistrements ont été insérés avec succès dans la base de données.</p>

            <div class="success-actions">
              <button mat-flat-button color="primary" (click)="resetWizard()">
                Effectuer un autre import
              </button>
            </div>
          </div>
        }
      </mat-card>
    </div>
  `,
  styles: [`
    .import-page {
      display: flex;
      flex-direction: column;
      gap: 20px;
      font-family: var(--vhp-font);
    }
    .page-header h2 {
      font-size: 20px;
      font-weight: 700;
      color: #1e3a2f;
      margin: 0;
    }
    .subtitle {
      color: #5f6368;
      font-size: 13px;
      margin-top: 4px;
    }
    .wizard-card {
      border-radius: 12px;
      padding: 24px;
      box-shadow: 0 1px 3px rgba(0,0,0,0.08);
    }
    .step-container {
      display: flex;
      flex-direction: column;
      gap: 20px;
    }
    .step-title {
      font-size: 16px;
      font-weight: 700;
      color: #1e3a2f;
      margin: 0;
    }
    .step-desc {
      color: #5f6368;
      font-size: 13px;
      margin: -10px 0 10px;
    }
    .type-cards-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
      gap: 16px;
    }
    .type-card {
      border: 2px solid #e0e0e0;
      border-radius: 12px;
      padding: 20px;
      cursor: pointer;
      display: flex;
      flex-direction: column;
      align-items: flex-start;
      gap: 10px;
      transition: all 0.2s ease;
    }
    .type-card:hover {
      border-color: #0f9d58;
      background: #f6fcf8;
    }
    .type-card.selected {
      border-color: #0f9d58;
      background: #e8f5e9;
      box-shadow: 0 2px 6px rgba(15, 157, 88, 0.2);
    }
    .type-icon {
      font-size: 32px;
      width: 32px;
      height: 32px;
      color: #0f9d58;
    }
    .type-card h4 {
      margin: 0;
      font-size: 15px;
      color: #202124;
    }
    .type-card p {
      margin: 0;
      font-size: 12px;
      color: #5f6368;
      flex: 1;
    }
    .template-btn {
      font-size: 11px;
      margin-top: 8px;
    }
    .upload-dropzone {
      border: 2px dashed #0f9d58;
      border-radius: 12px;
      background: #f8faf9;
      padding: 40px;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      cursor: pointer;
      gap: 12px;
      text-align: center;
      transition: background 0.2s;
    }
    .upload-dropzone:hover {
      background: #f0fdf4;
    }
    .upload-icon {
      font-size: 48px;
      width: 48px;
      height: 48px;
      color: #0f9d58;
    }
    .upload-text {
      display: flex;
      flex-direction: column;
      gap: 4px;
    }
    .upload-text span {
      font-size: 12px;
      color: #5f6368;
    }
    .file-loaded-info {
      display: flex;
      align-items: center;
      gap: 8px;
      background: #e8f5e9;
      padding: 12px 16px;
      border-radius: 8px;
      color: #1b5e20;
      font-size: 13px;
    }
    .stats-cards-grid {
      display: grid;
      grid-template-columns: repeat(3, 1fr);
      gap: 16px;
    }
    .stat-card {
      border-radius: 8px;
      background: #f1f3f4;
      padding: 16px;
      text-align: center;
    }
    .stat-card.success {
      background: #e6f4ea;
      color: #137333;
    }
    .stat-card.danger {
      background: #fce8e6;
      color: #c5221f;
    }
    .stat-number {
      font-size: 28px;
      font-weight: 700;
    }
    .stat-label {
      font-size: 12px;
      margin-top: 4px;
      text-transform: uppercase;
      font-weight: 600;
    }
    .rejected-section {
      border: 1px solid #fad2cf;
      border-radius: 8px;
      background: #fff8f7;
      padding: 16px;
    }
    .rejected-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 12px;
    }
    .rejected-title {
      display: flex;
      align-items: center;
      gap: 8px;
      color: #c5221f;
    }
    .table-scroll {
      max-height: 250px;
      overflow-y: auto;
    }
    .rejections-table {
      width: 100%;
      background: transparent;
    }
    .error-pill {
      background: #fce8e6;
      color: #c5221f;
      padding: 2px 8px;
      border-radius: 12px;
      font-size: 11px;
      font-weight: 600;
    }
    .raw-data-cell {
      font-size: 12px;
      color: #3c4043;
      max-width: 300px;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    .sample-section {
      background: #f8f9fa;
      padding: 16px;
      border-radius: 8px;
    }
    .sample-section h4 {
      margin: 0 0 10px;
      font-size: 13px;
      color: #3c4043;
    }
    .sample-box {
      display: flex;
      flex-direction: column;
      gap: 6px;
    }
    .sample-item {
      display: flex;
      align-items: center;
      gap: 8px;
      font-size: 12px;
      color: #202124;
    }
    .step-nav {
      display: flex;
      align-items: center;
      margin-top: 16px;
    }
    .spacer {
      flex: 1;
    }
    .btn-spinner {
      margin-right: 6px;
    }
    .success-container {
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      padding: 40px;
      text-align: center;
      gap: 12px;
    }
    .success-icon {
      font-size: 64px;
      width: 64px;
      height: 64px;
      color: #0f9d58;
    }
    .success-actions {
      margin-top: 20px;
    }
  `],
})
export class ImportWizardComponent {
  private readonly settingsApi = inject(SettingsApiService);
  private readonly alert = inject(AlertService);
  private readonly dialog = inject(MatDialog);

  readonly i18n = I18N_FR;

  currentStep = signal<number>(1);
  selectedType = signal<ImportType | null>(null);
  fileName = signal<string>('');
  parsedRows = signal<Record<string, any>[]>([]);

  simulationResult = signal<ImportSimulationResult | null>(null);
  insertedCount = signal<number>(0);

  isSimulating = signal<boolean>(false);
  isExecuting = signal<boolean>(false);

  readonly rejectedColumns: string[] = ['row', 'data', 'reason'];

  selectType(type: ImportType): void {
    this.selectedType.set(type);
  }

  getSelectedTypeLabel(): string {
    switch (this.selectedType()) {
      case 'PRODUITS': return this.i18n.importWizard.typeProducts;
      case 'STOCK': return this.i18n.importWizard.typeStock;
      case 'FOURNISSEURS': return this.i18n.importWizard.typeSuppliers;
      case 'CLIENTS': return this.i18n.importWizard.typeCustomers;
      default: return '';
    }
  }

  goToStep(step: number): void {
    this.currentStep.set(step);
  }

  downloadTemplate(type: ImportType, event: Event): void {
    event.stopPropagation();
    let csvHeader = '';
    let sampleData = '';

    if (type === 'PRODUITS') {
      csvHeader = 'nom;dci;forme;dosage;unite_vente;prix_vente_cdf;prix_vente_usd;tva;code_barre';
      sampleData = 'Paracétamol 500mg;Paracétamol;Comprimé;500mg;Boîte de 20;3000;1.05;0;370001234567\nAmoxicilline 500mg;Amoxicilline;Gélule;500mg;Boîte de 12;6000;2.10;0;370001234568';
    } else if (type === 'STOCK') {
      csvHeader = 'produit_nom;numero_lot;date_peremption;quantite;prix_achat_cdf;prix_achat_usd';
      sampleData = 'Paracétamol 500mg;LOT-2026-A;2027-12-31;100;1800;0.63\nAmoxicilline 500mg;LOT-2026-B;2026-08-15;50;4000;1.40';
    } else if (type === 'FOURNISSEURS') {
      csvHeader = 'nom;contact;telephone;email;adresse';
      sampleData = 'MEDIPHARM RDC;Dr Mukendi;+243810000001;contact@medipharm.cd;Avenue Tombalbaye, Gombe, Kinshasa\nPHARMAKINA;Service Commercial;+243820000002;sales@pharmakina.cd;Bukavu / Kinshasa';
    } else if (type === 'CLIENTS') {
      csvHeader = 'code;nom;type;telephone;plafond_credit_cdf';
      sampleData = 'CLI-001;Jean Kabamba;PARTICULIER;+243812345678;0\nCLI-002;BRASIMBA;ENTREPRISE;+243819876543;5000000';
    }

    const blob = new Blob([`${csvHeader}\n${sampleData}`], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.setAttribute('download', `modele_import_${type.toLowerCase()}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }

  onFileSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    if (!input.files || input.files.length === 0) return;

    const file = input.files[0];
    this.fileName.set(file.name);

    const reader = new FileReader();
    reader.onload = (e) => {
      const text = e.target?.result as string;
      this.parseCsvContent(text);
    };
    reader.readAsText(file, 'UTF-8');
  }

  private parseCsvContent(content: string): void {
    const lines = content.split(/\r?\n/).filter((l) => l.trim().length > 0);
    if (lines.length < 2) {
      this.alert.error('Le fichier CSV est vide ou ne contient aucun en-tête.');
      return;
    }

    const separator = lines[0].includes(';') ? ';' : ',';
    const headers = lines[0].split(separator).map((h) => h.trim().replace(/^["']|["']$/g, ''));

    const rows: Record<string, any>[] = [];
    for (let i = 1; i < lines.length; i++) {
      const cells = lines[i].split(separator).map((c) => c.trim().replace(/^["']|["']$/g, ''));
      if (cells.length === 0 || (cells.length === 1 && !cells[0])) continue;

      const row: Record<string, any> = {};
      headers.forEach((header, idx) => {
        row[header] = cells[idx] !== undefined ? cells[idx] : '';
      });
      rows.push(row);
    }

    this.parsedRows.set(rows);
  }

  startSimulation(): void {
    if (!this.selectedType() || this.parsedRows().length === 0) return;

    this.isSimulating.set(true);
    this.settingsApi
      .simulateImport({
        importType: this.selectedType()!,
        rows: this.parsedRows(),
      })
      .subscribe({
        next: (result) => {
          this.simulationResult.set(result);
          this.isSimulating.set(false);
          this.goToStep(3);
        },
        error: (err) => {
          this.isSimulating.set(false);
          this.alert.error(err?.error?.message || 'Erreur lors de la simulation de l’import.');
        },
      });
  }

  confirmExecution(): void {
    const sim = this.simulationResult();
    if (!sim || sim.validCount === 0) return;

    const ref = this.dialog.open(ConfirmDialogComponent, {
      width: '450px',
      data: {
        title: this.i18n.importWizard.executeConfirmTitle,
        message: `${this.i18n.importWizard.executeConfirmMessage} (${sim.validCount} enregistrements)`,
        confirmText: this.i18n.actions.confirm,
        cancelText: this.i18n.actions.cancel,
      },
    });

    ref.afterClosed().subscribe((confirmed) => {
      if (confirmed) {
        this.executeImport();
      }
    });
  }

  private executeImport(): void {
    this.isExecuting.set(true);
    this.settingsApi
      .executeImport({
        importType: this.selectedType()!,
        rows: this.parsedRows(),
      })
      .subscribe({
        next: (res) => {
          this.isExecuting.set(false);
          this.insertedCount.set(res.insertedCount);
          this.goToStep(4);
          this.alert.success(`${res.insertedCount} enregistrements importés avec succès.`);
        },
        error: (err) => {
          this.isExecuting.set(false);
          this.alert.error(err?.error?.message || 'Erreur lors de l’exécution définitive.');
        },
      });
  }

  formatRowData(data: Record<string, any>): string {
    if (!data) return '';
    return Object.entries(data)
      .filter(([k]) => k !== 'row')
      .slice(0, 3)
      .map(([k, v]) => `${k}: ${v}`)
      .join(' | ');
  }

  exportRejections(): void {
    const res = this.simulationResult();
    if (!res || res.rejectedRows.length === 0) return;

    const headers = ['Ligne', 'Motif_Rejet', 'Donnees_Brutes'];
    const rows = res.rejectedRows.map((r) => [
      r.row,
      `"${r.reason.replace(/"/g, '""')}"`,
      `"${JSON.stringify(r.data).replace(/"/g, '""')}"`,
    ]);

    const csvContent = [headers.join(';'), ...rows.map((r) => r.join(';'))].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.setAttribute('download', `rejets_import_${this.selectedType()?.toLowerCase() || 'data'}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }

  resetWizard(): void {
    this.currentStep.set(1);
    this.selectedType.set(null);
    this.fileName.set('');
    this.parsedRows.set([]);
    this.simulationResult.set(null);
    this.insertedCount.set(0);
  }
}
