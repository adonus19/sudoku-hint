import { Component } from '@angular/core';
import { MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';

@Component({
  selector: 'app-solve-confirm',
  standalone: true,
  imports: [MatDialogModule, MatButtonModule, MatIconModule],
  template: `
  <div class="wrap">
    <div class="icon"><mat-icon>psychology</mat-icon></div>
    <h2>Solve it for you?</h2>
    <p>Auto-solve will fill the entire board step-by-step. Want to learn instead? Try a hint!</p>
    <div class="actions">
      <button mat-stroked-button (click)="ref.close(false)">Cancel</button>
      <button mat-flat-button color="primary" (click)="ref.close(true)">Solve</button>
    </div>
  </div>
  `,
  styles: [`
    .wrap{padding:14px 16px; text-align:center; min-width:280px; max-width:380px;}
    .icon{font-size:0; margin-bottom:6px;}
    .icon mat-icon{font-size:40px; width:40px; height:40px;}
    h2{margin:6px 0 8px; font-weight:700;}
    p{margin:0 0 14px; color:rgba(0,0,0,.72)}
    .actions{display:flex; gap:8px; justify-content:center}
  `]
})
export class SolveConfirmDialog {
  constructor(public ref: MatDialogRef<SolveConfirmDialog>) { }
}
