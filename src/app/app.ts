import { Component, inject, signal } from '@angular/core';
import { MatToolbarModule } from '@angular/material/toolbar';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatSlideToggleModule } from '@angular/material/slide-toggle';
import { MatDialog, MatDialogModule } from '@angular/material/dialog';

import { Board } from './components/board/board';
import { SudokuStore } from './data/sudoku.store';
import { ImportDialog } from './components/import-dialog/import-dialog';

@Component({
  selector: 'app-root',
  imports: [MatToolbarModule, MatButtonModule, MatIconModule, MatSlideToggleModule, Board],
  providers: [SudokuStore],
  templateUrl: './app.html',
  styleUrl: './app.scss'
})
export class App {
  protected readonly title = signal('sudoku-hint');
  store = inject(SudokuStore);
  #dialog = inject(MatDialog);

  openImport() {
    this.#dialog.open(ImportDialog, { width: '520px' });
  }
}
