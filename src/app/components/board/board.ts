import { Component, effect, HostListener, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { SudokuStore } from '../../data/sudoku.store';

type Coord = { r: number; c: number };

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
  private hovered: ReturnType<typeof signal<Coord | null>> = signal<Coord | null>(null);

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

  ariaLabel(r: number, c: number) {
    const cell = this.store.board()[r][c];
    const base = `Row ${r + 1} Column ${c + 1}`;
    if (cell.value) return `${base}, value ${cell.value}${cell.given ? ', given' : ''}`;
    return `${base}, empty`;
  }

  private activeContext() {
    // why: selection dominates; else hover if hovering a non-empty cell for quick glance
    const sel = this.store.selected();
    const hov = this.hovered();
    const board = this.store.board();
    if (sel) {
      const v = board[sel.r][sel.c].value || null;
      const box = board[sel.r][sel.c].box;
      return { coord: sel, value: v, box };
    }
    if (hov) {
      const v = board[hov.r][hov.c].value || null;
      const box = board[hov.r][hov.c].box;
      return { coord: hov, value: v, box };
    }
    return { coord: null as Coord | null, value: null as number | null, box: null as number | null };
  }

  cellClasses(r: number, c: number) {
    const board = this.store.board();
    const cell = board[r][c];
    const selected = this.isSelected(r, c);
    const isUser = !!cell.value && !cell.given;

    const ctx = this.activeContext();
    const hlRow = !!ctx.coord && ctx.coord.r === r;
    const hlCol = !!ctx.coord && ctx.coord.c === c;
    const hlBox = !!ctx.coord && ctx.box === cell.box;

    // matches (value)
    let match = false;
    let matchCand = false;
    if (ctx.value) {
      match = cell.value === ctx.value;
      // future: candidates contain the digit
      if (!match && cell.value === 0 && cell.candidates && cell.candidates.has(ctx.value)) {
        matchCand = true;
      }
    }

    // conflicts
    const key = `${r},${c}`;
    const conflict = this.store.conflicts().cells.has(key);

    return {
      given: !!cell.value && cell.given,
      user: isUser,
      selected,
      'hl-row': hlRow,
      'hl-col': hlCol,
      'hl-box': hlBox,
      match,
      'match-cand': matchCand,
      conflict
    };
  }

  onCellClick(r: number, c: number) {
    this.store.select(r, c);
    this.hasFocus.set(true);
  }

  onHover(r: number, c: number, enter: boolean) {
    this.hovered.set(enter ? { r, c } : null);
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
