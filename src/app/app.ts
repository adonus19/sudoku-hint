import { Component, inject } from '@angular/core';
import { RouterModule } from '@angular/router';
import { MatToolbarModule } from '@angular/material/toolbar';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatSlideToggleModule } from '@angular/material/slide-toggle';
import { MatDialog, MatDialogModule } from '@angular/material/dialog';
import { MatMenuModule } from '@angular/material/menu';
import { MatTooltipModule } from '@angular/material/tooltip';
import { BreakpointObserver, Breakpoints } from '@angular/cdk/layout';
import { MatBottomSheet, MatBottomSheetModule } from '@angular/material/bottom-sheet';

import { SudokuStore } from './data/sudoku.store';
import { ImportDialog } from './components/import-dialog/import-dialog';
import { HintService } from './hint/hint.service';
import { HintDialog } from './components/hint-dialog/hint-dialog';
import { HintSheet } from './components/hint-sheet/hint-sheet';
import { ImageImport } from './components/image-import/image-import';
import { Difficulty, NewPuzzleDialog, Symmetry } from './components/new-puzzle-dialog/new-puzzle-dialog';

@Component({
  selector: 'app-root',
  imports: [RouterModule, MatToolbarModule, MatButtonModule, MatIconModule, MatSlideToggleModule, MatDialogModule,
    MatMenuModule, MatTooltipModule, MatBottomSheetModule],
  templateUrl: './app.html',
  styleUrl: './app.scss'
})
export class App {
  store = inject(SudokuStore);
  #dialog = inject(MatDialog);
  #sheet = inject(MatBottomSheet);
  #hints = inject(HintService);
  #bp = inject(BreakpointObserver);

  openImport() {
    this.#dialog.open(ImportDialog, { width: '520px' });
  }

  openHint() {
    const hint = this.#hints.findNextHint(this.store.board());
    if (!hint) { alert('No available hint at the current difficulty.'); return; }

    const isHandset = this.#bp.isMatched(Breakpoints.Handset);

    if (isHandset) {
      this.#sheet.open(HintSheet, { data: hint, disableClose: false, hasBackdrop: false });
    } else {
      this.#dialog.open(HintDialog, {
        width: '420px', hasBackdrop: false, autoFocus: false, disableClose: false,
        position: { right: '16px', bottom: '16px' }, panelClass: ['hint-dialog-floating'], data: hint
      });
    }
  }

  openImportImage() {
    this.#dialog.open(ImageImport, { width: '960px', maxWidth: '96vw', height: 'min(92vh, 1100px)', maxHeight: '92vh', autoFocus: false, panelClass: ['photo-dialog'] });
  }

  openNewPuzzle() {
    const ref = this.#dialog.open(NewPuzzleDialog, { width: '480px' });
    ref.afterClosed().subscribe((res?: { difficulty: Difficulty; symmetry: Symmetry }) => {
      if (!res) return;
      this.store.newPuzzle(res.difficulty, res.symmetry);
    });
  }
}
