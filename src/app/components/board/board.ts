import { Component, effect, HostListener, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { SudokuStore } from '../../data/sudoku.store';

@Component({
  selector: 'app-board',
  imports: [CommonModule],
  templateUrl: './board.html',
  styleUrl: './board.scss'
})
export class Board {
  store = inject(SudokuStore);
  rows = Array.from({ length: 9 }, (_, i) => i);
  cols = Array.from({ length: 9 }, (_, i) => i);

  // Keep a local focus state to aid keyboard nav
  private hasFocus = signal<boolean>(false);

  constructor() {
    // ensure a default selection for keyboard input
    effect(() => {
      const sel = this.store.selected();
      if (!sel) this.store.select(0, 0);
    });
  }

  focusBoard() {
    this.hasFocus.set(true);
  }

  isSelected(r: number, c: number) {
    const s = this.store.selected();
    return !!s && s.r === r && s.c === c;
  }

  isGiven(r: number, c: number) {
    return this.store.board()[r][c].given;
  }

  cellValue(r: number, c: number) {
    const v = this.store.board()[r][c].value;
    return v ? v : '';
  }

  cellClasses(r: number, c: number) {
    const cell = this.store.board()[r][c];
    const selected = this.isSelected(r, c);
    const isUser = !!cell.value && !cell.given;
    return {
      given: !!cell.value && cell.given,
      user: isUser,
      selected
    };
  }

  onCellClick(r: number, c: number) {
    this.store.select(r, c);
    this.hasFocus.set(true);
  }

  @HostListener('keydown', ['$event'])
  onKeydown(ev: KeyboardEvent) {
    if (!this.hasFocus()) return;

    const sel = this.store.selected();
    if (!sel) return;

    const { r, c } = sel;

    // movement
    if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Tab'].includes(ev.key)) {
      ev.preventDefault();
      const next = this.moveSelection(r, c, ev.key, ev.shiftKey);
      this.store.select(next.r, next.c);
      return;
    }

    // input digits
    if (/^[1-9]$/.test(ev.key)) {
      ev.preventDefault();
      if (!this.isGiven(r, c) || this.store.editingGivenMode()) {
        this.store.setCellValue(r, c, Number(ev.key) as any);
      }
      return;
    }

    // clear
    if (ev.key === 'Backspace' || ev.key === 'Delete' || ev.key === '0') {
      ev.preventDefault();
      if (!this.isGiven(r, c) || this.store.editingGivenMode()) {
        this.store.clearCell(r, c);
      }
      return;
    }
  }

  private moveSelection(r: number, c: number, key: string, shiftTab: boolean) {
    if (key === 'Tab') {
      const idx = r * 9 + c;
      const dir = shiftTab ? -1 : 1;
      const next = (idx + dir + 81) % 81;
      return { r: Math.floor(next / 9), c: next % 9 };
    }
    if (key === 'ArrowUp') return { r: (r + 8) % 9, c };
    if (key === 'ArrowDown') return { r: (r + 1) % 9, c };
    if (key === 'ArrowLeft') return { r, c: (c + 8) % 9 };
    if (key === 'ArrowRight') return { r, c: (c + 1) % 9 };
    return { r, c };
  }
}
