import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterModule } from '@angular/router';
import { MatCardModule } from '@angular/material/card';
import { MatButtonModule } from '@angular/material/button';
import { CashApiService } from '../../core/api/services/cash-api.service';
import { CurrencyFormatPipe } from '../../shared/pipes/currency-format.pipe';
import { AuthService } from '../../core/auth/auth.service';
import { DocumentHeaderService } from '../../core/services/document-header.service';

@Component({ selector: 'app-cash', standalone: true, imports: [CommonModule, FormsModule, RouterModule, MatCardModule, MatButtonModule, CurrencyFormatPipe], template: `
<div class="page"><header><h2>Caisse et finances</h2><p>Sessions, dépenses, mouvements et résultat estimé.</p></header>
@if (!session()) { <mat-card><h3>Ouvrir ma caisse</h3><div class="grid"><label>Fonds CDF <input type="number" [(ngModel)]="opening.cdf" min="0"></label><label>Fonds USD <input type="number" [(ngModel)]="opening.usd" min="0"></label></div><button mat-flat-button color="primary" [disabled]="!canOpen()" (click)="open()">Ouvrir la session</button></mat-card> }
@if (session(); as s) { <mat-card><div class="head"><h3>Session ouverte</h3><button mat-stroked-button color="warn" [disabled]="!canClose()" (click)="closing.set(!closing())">Clôturer</button></div><p>Attendu : <b>{{s.expectedAmountCdf | currencyFormat:'CDF'}}</b> · <b>{{s.expectedAmountUsd | currencyFormat:'USD'}}</b></p>@if(closing()) { <section><h4>Arrêté de caisse / Ticket Z</h4><div class="grid"><label>Compté CDF <input type="number" [(ngModel)]="closeCdf" min="0"></label><label>Compté USD <input type="number" [(ngModel)]="closeUsd" min="0"></label></div><p [class.variance]="hasVariance()">Écart : {{varianceCdf() | currencyFormat:'CDF'}} · {{varianceUsd() | currencyFormat:'USD'}}</p>@if(hasVariance()) {<label>Motif obligatoire <input [(ngModel)]="closeReason"></label>}<button mat-flat-button color="primary" [disabled]="hasVariance() && !closeReason.trim()" (click)="closeSession()">Confirmer et imprimer</button></section> }</mat-card>
<mat-card><h3>Billetage</h3><div class="grid">@for(d of denominations; track d){<label>{{d}} CDF <input type="number" min="0" [(ngModel)]="bills[d]"></label>}</div><b>Total : {{billTotal() | currencyFormat:'CDF'}}</b></mat-card>
<mat-card><h3>Apport / retrait</h3><div class="grid"><label>Type <select [(ngModel)]="movement.type"><option value="APPORT">Apport</option><option value="RETRAIT">Retrait</option></select></label><label>CDF <input type="number" min="0" [(ngModel)]="movement.amountCdf"></label><label>USD <input type="number" min="0" [(ngModel)]="movement.amountUsd"></label><label>Motif <input [(ngModel)]="movement.reason"></label></div><button mat-stroked-button [disabled]="!movement.reason.trim() || (!movement.amountCdf && !movement.amountUsd)" (click)="addMovement()">Enregistrer</button>@for(m of movements(); track m.id){<p>{{m.type}} · {{m.amountCdf | currencyFormat:'CDF'}} / {{m.amountUsd | currencyFormat:'USD'}} · {{m.reason}}</p>}</mat-card> }
@if (canWrite()) { <mat-card><h3>Dépense</h3><div class="grid"><label>Libellé <input [(ngModel)]="expense.description"></label><label>Catégorie <input [(ngModel)]="expense.category"></label><label>Montant CDF <input type="number" [(ngModel)]="expense.amountCdf" min="0"></label><label>Pièce jointe <input type="file" accept=".pdf,.jpg,.jpeg,.png,.webp" (change)="selectReceipt($event)"></label></div><button mat-stroked-button (click)="saveExpense()">Ajouter</button></mat-card> } 
<div class="cards"><mat-card><h3>Encaissements</h3>@for(p of payments();track p.paymentMethod + p.currency){<p>{{p.paymentMethod}} · {{p.currency}} : <b>{{p.amount | currencyFormat:p.currency}}</b></p>}</mat-card><mat-card><h3>Créances âgées</h3><p>0–30 j : {{aging()?.bracket0To30Cdf | currencyFormat:'CDF'}}</p><p>31–60 j : {{aging()?.bracket31To60Cdf | currencyFormat:'CDF'}}</p><p>+60 j : {{aging()?.bracketOver60Cdf | currencyFormat:'CDF'}}</p></mat-card><mat-card><h3>Résultat estimé</h3><p>Marge brute : {{profitability()?.grossMarginCdf | currencyFormat:'CDF'}}</p><p>Charges : {{profitability()?.totalExpensesCdf | currencyFormat:'CDF'}}</p><b>{{profitability()?.estimatedResultCdf | currencyFormat:'CDF'}}</b></mat-card></div></div>`, styles: [`.page{display:grid;gap:16px}.grid,.cards{display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:12px}.cards{grid-template-columns:repeat(auto-fit,minmax(240px,1fr))}mat-card{padding:18px;display:grid;gap:10px}label{display:grid;gap:4px}input,select{padding:8px;border:1px solid #c7c7c7;border-radius:5px;width:100%;box-sizing:border-box}.head{display:flex;justify-content:space-between;align-items:center;gap:10px}.variance{color:#c62828;font-weight:bold}section{border-top:1px solid #ddd;padding-top:10px}@media(max-width:600px){.page{padding:4px}.grid,.cards{grid-template-columns:1fr}.head{flex-direction:column;align-items:stretch}mat-card{padding:12px}button{width:100%}}`] })
export class CashComponent implements OnInit {
  private api = inject(CashApiService); private auth = inject(AuthService); private docHeader = inject(DocumentHeaderService);
  session = signal<any>(null); closing = signal(false); categories = signal<any[]>([]); payments = signal<any[]>([]); aging = signal<any>(null); profitability = signal<any>(null); movements = signal<any[]>([]); receipt?: File;
  opening = { cdf: 0, usd: 0 }; closeCdf = 0; closeUsd = 0; closeReason = ''; expense = { description: '', category: '', amountCdf: 0 };
  movement: { type: 'APPORT'|'RETRAIT'; amountCdf: number; amountUsd: number; reason: string } = { type: 'APPORT', amountCdf: 0, amountUsd: 0, reason: '' };
  denominations = [10000, 5000, 2000, 1000, 500, 200, 100]; bills: Record<number, number> = { 10000: 0, 5000: 0, 2000: 0, 1000: 0, 500: 0, 200: 0, 100: 0 };
  canWrite = computed(() => this.auth.hasPermission('depense.creer')); canOpen = computed(() => this.auth.hasPermission('caisse.ouvrir')); canClose = computed(() => this.auth.hasPermission('caisse.cloturer'));
  varianceCdf = computed(() => this.closeCdf - (this.session()?.expectedAmountCdf ?? 0)); varianceUsd = computed(() => this.closeUsd - (this.session()?.expectedAmountUsd ?? 0)); hasVariance = computed(() => this.varianceCdf() !== 0 || this.varianceUsd() !== 0); billTotal = () => this.denominations.reduce((sum, d) => sum + d * (this.bills[d] || 0), 0);
  ngOnInit() { this.refresh(); }
  refresh() { this.api.getActiveSession().subscribe(s => { this.session.set(s); if (s) { this.closeCdf = s.expectedAmountCdf; this.closeUsd = s.expectedAmountUsd; this.api.getMovements(s.id).subscribe(m => this.movements.set(m)); } }); this.api.getCategories().subscribe(x => this.categories.set(x)); this.api.getPaymentSummary().subscribe(x => this.payments.set(x)); this.api.getReceivablesAging().subscribe(x => this.aging.set(x)); this.api.getProfitability().subscribe(x => this.profitability.set(x)); }
  open() { this.api.openSession({ initialFloatCdf: this.opening.cdf, initialFloatUsd: this.opening.usd }).subscribe(() => this.refresh()); }
  closeSession() {
    const s = this.session();
    if (!s) return;
    const countedCdf = this.closeCdf;
    const countedUsd = this.closeUsd;
    const varianceCdf = this.varianceCdf();
    const varianceUsd = this.varianceUsd();
    const reason = this.closeReason;
    const closeDate = new Date().toLocaleString('fr-FR');

    this.api.closeSession(s.id, {
      countedAmountCdf: countedCdf,
      countedAmountUsd: countedUsd,
      varianceReason: reason || undefined
    }).subscribe(() => {
      this.closing.set(false);
      this.refresh();

      const headerHtml = this.docHeader.renderHtmlHeader({
        format: 'ticket',
        documentTitle: 'ARRÊTÉ DE CAISSE (TICKET Z)',
        documentSubtitle: `Date de clôture : ${closeDate}`,
      });
      const footerHtml = this.docHeader.renderHtmlFooter({
        format: 'ticket',
        customFooter: 'Arrêté de caisse certifié conforme.',
      });

      const ticketHtml = `
        <!DOCTYPE html>
        <html lang="fr">
          <head>
            <meta charset="utf-8" />
            <title>Clôture de Caisse</title>
            <style>
              @page { size: 80mm auto; margin: 3mm 4mm; }
              body { font-family: monospace, sans-serif; font-size: 11px; line-height: 1.35; color: #000; margin: 0; padding: 4px; }
              .row { display: flex; justify-content: space-between; margin-bottom: 2px; }
              .bold { font-weight: bold; }
              .section { border-bottom: 1px dashed #000; padding: 4px 0; margin-bottom: 4px; }
            </style>
          </head>
          <body>
            ${headerHtml}
            <div class="section">
              <div class="row"><span>SESSION N° :</span><span class="bold">${s.id ? s.id.slice(0, 8) : 'N/A'}</span></div>
              <div class="row"><span>OUVERTURE :</span><span>${s.openedAt ? new Date(s.openedAt).toLocaleString('fr-FR') : '-'}</span></div>
              <div class="row"><span>CLÔTURE :</span><span>${closeDate}</span></div>
            </div>
            <div class="section">
              <div class="row"><span>FONDS INITIAL CDF :</span><span>${Number(s.initialFloatCdf || 0).toLocaleString('fr-FR')} CDF</span></div>
              <div class="row"><span>FONDS INITIAL USD :</span><span>${Number(s.initialFloatUsd || 0).toLocaleString('fr-FR')} USD</span></div>
              <div class="row"><span>ATTENDU CDF :</span><span class="bold">${Number(s.expectedAmountCdf || 0).toLocaleString('fr-FR')} CDF</span></div>
              <div class="row"><span>ATTENDU USD :</span><span class="bold">${Number(s.expectedAmountUsd || 0).toLocaleString('fr-FR')} USD</span></div>
            </div>
            <div class="section">
              <div class="row"><span>COMPTÉ CDF :</span><span class="bold">${Number(countedCdf || 0).toLocaleString('fr-FR')} CDF</span></div>
              <div class="row"><span>COMPTÉ USD :</span><span class="bold">${Number(countedUsd || 0).toLocaleString('fr-FR')} USD</span></div>
              <div class="row"><span>ÉCART CDF :</span><span class="bold" style="color: ${varianceCdf !== 0 ? '#b91c1c' : '#000'}">${Number(varianceCdf || 0).toLocaleString('fr-FR')} CDF</span></div>
              <div class="row"><span>ÉCART USD :</span><span class="bold" style="color: ${varianceUsd !== 0 ? '#b91c1c' : '#000'}">${Number(varianceUsd || 0).toLocaleString('fr-FR')} USD</span></div>
              ${reason ? `<div class="row" style="margin-top: 4px;"><span>MOTIF ÉCART :</span><span>${reason}</span></div>` : ''}
            </div>
            ${footerHtml}
          </body>
        </html>
      `;
      this.docHeader.printHtml(ticketHtml, 'Cloture-Caisse');
    });
  }
  addMovement() { const s = this.session(); if (!s) return; this.api.addMovement(s.id, this.movement).subscribe(() => { this.movement = { type: 'APPORT', amountCdf: 0, amountUsd: 0, reason: '' }; this.refresh(); }); }
  selectReceipt(event: Event) { this.receipt = ((event.target as HTMLInputElement).files || [])[0]; }
  saveExpense() { this.api.createExpense(this.expense).subscribe(expense => { const upload = this.receipt ? this.api.uploadReceipt(expense.id, this.receipt) : null; if (upload) upload.subscribe(() => this.finishExpense()); else this.finishExpense(); }); }
  private finishExpense() { this.expense = { description: '', category: '', amountCdf: 0 }; this.receipt = undefined; this.refresh(); }
}
