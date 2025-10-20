import { Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';

import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatDialog, MatDialogModule } from '@angular/material/dialog';
import { MatBottomSheet, MatBottomSheetModule } from '@angular/material/bottom-sheet';
import { BreakpointObserver, Breakpoints } from '@angular/cdk/layout';

import { SudokuStore } from '../../data/sudoku.store';
import { Board } from '../board/board';
import { NumberPad } from '../../controls/number-pad/number-pad';
import { HintService } from '../../hint/hint.service';
import { HintDialog } from '../hint-dialog/hint-dialog';
import { HintSheet } from '../hint-sheet/hint-sheet';

@Component({
  selector: 'app-play-page',
  imports: [CommonModule, MatButtonModule, MatIconModule, MatDialogModule, MatBottomSheetModule, Board, NumberPad],
  templateUrl: './play-page.html',
  styleUrl: './play-page.scss'
})
export class PlayPage {
  store = inject(SudokuStore);
  #hints = inject(HintService);
  #dialog = inject(MatDialog);
  #sheet = inject(MatBottomSheet);
  #bp = inject(BreakpointObserver);

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

  erase() {
    const sel = this.store.selected();
    if (!sel) return;
    this.store.eraseAt(sel.r, sel.c);
  }

  undo() {
    this.store.undo();
  }

  togglePencil() {
    this.store.togglePencilMode();
  }
}
