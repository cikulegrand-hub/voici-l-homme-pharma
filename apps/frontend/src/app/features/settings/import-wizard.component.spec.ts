import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ImportWizardComponent } from './import-wizard.component';
import { SettingsApiService } from '../../core/api/services/settings-api.service';
import { AlertService } from '../../core/services/alert.service';
import { MatDialog } from '@angular/material/dialog';
import { of } from 'rxjs';
import { NoopAnimationsModule } from '@angular/platform-browser/animations';
import { ImportSimulationResult } from '@vhp/shared';

describe('ImportWizardComponent', () => {
  let component: ImportWizardComponent;
  let fixture: ComponentFixture<ImportWizardComponent>;
  let settingsApiSpy: jasmine.SpyObj<SettingsApiService>;
  let alertServiceSpy: jasmine.SpyObj<AlertService>;
  let dialog: MatDialog;

  beforeEach(async () => {
    settingsApiSpy = jasmine.createSpyObj('SettingsApiService', ['simulateImport', 'executeImport']);
    alertServiceSpy = jasmine.createSpyObj('AlertService', ['success', 'error', 'warning', 'info']);

    await TestBed.configureTestingModule({
      imports: [ImportWizardComponent, NoopAnimationsModule],
      providers: [
        { provide: SettingsApiService, useValue: settingsApiSpy },
        { provide: AlertService, useValue: alertServiceSpy },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(ImportWizardComponent);
    component = fixture.componentInstance;
    dialog = TestBed.inject(MatDialog);
    fixture.detectChanges();
  });

  it('devrait initialiser l’assistant à l’étape 1 sans type sélectionné', () => {
    expect(component).toBeTruthy();
    expect(component.currentStep()).toBe(1);
    expect(component.selectedType()).toBeNull();
  });

  it('devrait permettre de sélectionner un type de données et passer à l’étape 2', () => {
    component.selectType('PRODUITS');
    expect(component.selectedType()).toBe('PRODUITS');
    component.goToStep(2);
    expect(component.currentStep()).toBe(2);
  });

  it('devrait gérer l’état de simulation avec rejet (lignes invalides)', () => {
    component.selectType('PRODUITS');
    component.parsedRows.set([
      { nom: 'Paracétamol', prix_vente_cdf: '3000' },
      { nom: '', prix_vente_cdf: '1500' }, // Ligne invalide sans nom
      { nom: 'Produit Invalide', prix_vente_cdf: '-10' }, // Ligne invalide prix négatif
    ]);

    const mockSimResult: ImportSimulationResult = {
      importType: 'PRODUITS',
      totalRows: 3,
      validCount: 1,
      rejectedCount: 2,
      rejectedRows: [
        { row: 2, data: { nom: '', prix_vente_cdf: '1500' }, reason: 'Le nom du produit est obligatoire' },
        { row: 3, data: { nom: 'Produit Invalide', prix_vente_cdf: '-10' }, reason: 'Le prix de vente doit être positif' },
      ],
      sampleValid: [{ nom: 'Paracétamol', prix_vente_cdf: '3000' }],
    };

    settingsApiSpy.simulateImport.and.returnValue(of(mockSimResult));

    component.startSimulation();

    expect(settingsApiSpy.simulateImport).toHaveBeenCalledWith({
      importType: 'PRODUITS',
      rows: component.parsedRows(),
    });
    expect(component.currentStep()).toBe(3);
    expect(component.simulationResult()).toEqual(mockSimResult);
    expect(component.simulationResult()?.rejectedCount).toBe(2);
    expect(component.simulationResult()?.validCount).toBe(1);
  });

  it('devrait gérer l’état de simulation avec 100% de succès', () => {
    component.selectType('PRODUITS');
    component.parsedRows.set([
      { nom: 'Paracétamol 500mg', prix_vente_cdf: '3000' },
      { nom: 'Amoxicilline 500mg', prix_vente_cdf: '6000' },
    ]);

    const mockSimResult: ImportSimulationResult = {
      importType: 'PRODUITS',
      totalRows: 2,
      validCount: 2,
      rejectedCount: 0,
      rejectedRows: [],
      sampleValid: [
        { nom: 'Paracétamol 500mg', prix_vente_cdf: '3000' },
        { nom: 'Amoxicilline 500mg', prix_vente_cdf: '6000' },
      ],
    };

    settingsApiSpy.simulateImport.and.returnValue(of(mockSimResult));

    component.startSimulation();

    expect(component.currentStep()).toBe(3);
    expect(component.simulationResult()?.rejectedCount).toBe(0);
    expect(component.simulationResult()?.validCount).toBe(2);
  });

  it('devrait exécuter l’import définitif après confirmation et passer à l’étape 4', () => {
    component.selectType('PRODUITS');
    component.parsedRows.set([{ nom: 'Paracétamol', prix_vente_cdf: '3000' }]);
    component.simulationResult.set({
      importType: 'PRODUITS',
      totalRows: 1,
      validCount: 1,
      rejectedCount: 0,
      rejectedRows: [],
    });

    const mockDialogRef: any = {
      afterClosed: () => of(true),
    };
    spyOn((component as any).dialog, 'open').and.returnValue(mockDialogRef);

    settingsApiSpy.executeImport.and.returnValue(of({ success: true, insertedCount: 1 }));

    component.confirmExecution();

    expect((component as any).dialog.open).toHaveBeenCalled();
    expect(settingsApiSpy.executeImport).toHaveBeenCalledWith({
      importType: 'PRODUITS',
      rows: component.parsedRows(),
    });
    expect(component.currentStep()).toBe(4);
    expect(component.insertedCount()).toBe(1);
    expect(alertServiceSpy.success).toHaveBeenCalledWith('1 enregistrements importés avec succès.');
  });
});
