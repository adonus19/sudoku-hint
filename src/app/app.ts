import { Component, inject } from '@angular/core';
import { MatToolbarModule } from '@angular/material/toolbar';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatSlideToggleModule } from '@angular/material/slide-toggle';
import { MatDialog } from '@angular/material/dialog';

import { Board } from './components/board/board';
import { SudokuStore } from './data/sudoku.store';
import { ImportDialog } from './components/import-dialog/import-dialog';
import { HintService } from './hint/hint.service';
import { HintDialog } from './components/hint-dialog/hint-dialog';

@Component({
  selector: 'app-root',
  imports: [MatToolbarModule, MatButtonModule, MatIconModule, MatSlideToggleModule, Board],
  templateUrl: './app.html',
  styleUrl: './app.scss'
})
export class App {
  store = inject(SudokuStore);
  #dialog = inject(MatDialog);
  #hints = inject(HintService);

  openImport() {
    this.#dialog.open(ImportDialog, { width: '520px' });
  }

  openHint() {
    const hint = this.#hints.findNextHint(this.store.board());
    if (!hint) { alert('No hints available.'); return; }
    this.#dialog.open(HintDialog, {
      width: '420px',
      hasBackdrop: false,           // non-blocking
      autoFocus: false,             // keep keyboard on board
      disableClose: false,
      position: { right: '24px', bottom: '24px' },
      panelClass: ['hint-dialog-floating'],
      data: hint
    });
  }
}
