import { Component, effect, HostListener, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { SudokuStore } from '../../data/sudoku.store';

type Coord = { r: number; c: number };
const ROW_LETTERS = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I'];

@Component({
  selector: 'app-board',
  imports: [CommonModule, MatProgressSpinnerModule],
  templateUrl: './board.html',
  styleUrl: './board.scss'
})
export class Board {
  store = inject(SudokuStore);

  rows = Array.from({ length: 9 }, (_, i) => i);
  cols = Array.from({ length: 9 }, (_, i) => i);
  digits = [1, 2, 3, 4, 5, 6, 7, 8, 9];
  confetti = Array.from({ length: 18 }, (_, i) => i);
  Number = Number;

  private hasFocus = signal<boolean>(false);
  private hovered = signal<Coord | null>(null);

  constructor() {
    effect(() => {
      if (!this.store.selected()) this.store.select(0, 0);
    });
  }

  @HostListener('document:visibilitychange')
  onVisChange() {
    if (document.hidden) this.store.pauseTimer();
    else this.store.resumeTimer();
  }

  floatersAt(r: number, c: number) {
    return this.store.floaters().filter(f => f.r === r && f.c === c);
  }

  rowLetter(r: number) {
    return ROW_LETTERS[r];
  }

  focusBoard() {
    this.hasFocus.set(true);

  }

  hasValue(r: number, c: number) {
    return !!this.store.board()[r][c].value;
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

  hasCand(r: number, c: number, d: number) {
    return this.store.board()[r][c].candidates?.has(d) ?? false;
  }

  ariaLabel(r: number, c: number) {
    const cell = this.store.board()[r][c];
    const base = `Row ${r + 1} Column ${c + 1}`;
    if (cell.value) return `${base}, value ${cell.value}${cell.given ? ', given' : ''}`;
    const cands = Array.from(cell.candidates).sort().join(',');
    return `${base}, empty${cands ? ', candidates ' + cands : ''}`;
  }

  private activeContext() {
    const sel = this.store.selected();
    const hov = this.hovered();
    const b = this.store.board();
    if (sel) {
      const v = b[sel.r][sel.c].value || null;
      const box = b[sel.r][sel.c].box;
      return { coord: sel, value: v, box };
    }
    if (hov) {
      const v = b[hov.r][hov.c].value || null;
      const box = b[hov.r][hov.c].box;
      return { coord: hov, value: v, box };
    }
    return { coord: null as Coord | null, value: null as number | null, box: null as number | null };
  }

  candMatchesActive(r: number, c: number, d: number) {
    const ctx = this.activeContext();
    if (!ctx.value) return false;
    const cell = this.store.board()[r][c];
    return cell.value === 0 && cell.candidates?.has(d) && d === ctx.value;
  }

  candInHint(r: number, c: number, d: number) {
    const h = this.store.highlight();
    if (!h?.candTargets) return false;
    return h.candTargets.some(x => x.r === r && x.c === c && x.d === d);
  }

  cellClasses(r: number, c: number) {
    const b = this.store.board();
    const cell = b[r][c];
    const selected = this.isSelected(r, c);
    const isUser = !!cell.value && !cell.given;
    const ctx = this.activeContext();
    const hlRow = !!ctx.coord && ctx.coord.r === r;
    const hlCol = !!ctx.coord && ctx.coord.c === c;
    const hlBox = !!ctx.coord && ctx.box === cell.box;
    const match = !!ctx.value && cell.value === ctx.value;
    const conflict = this.store.conflicts().cells.has(`${r},${c}`);
    const solutionError = this.store.isErrorCell(r, c);
    const h = this.store.highlight();
    const hintRow = h?.rows?.includes(r) ?? false;
    const hintCol = h?.cols?.includes(c) ?? false;
    const hintBox = h?.boxes?.includes(cell.box) ?? false;
    const hintTarget = (h?.cells || []).some(cc => cc.r === r && cc.c === c);
    return {
      given: !!cell.value && cell.given,
      user: isUser,
      selected,
      'hl-row': hlRow,
      'hl-col': hlCol,
      'hl-box': hlBox,
      match,
      conflict,
      error: solutionError,
      'hint-row': hintRow,
      'hint-col': hintCol,
      'hint-box': hintBox,
      'hint-target': hintTarget
    };
  }

  onCellClick(r: number, c: number) {
    this.store.select(r, c);
    this.hasFocus.set(true);
  }

  onHover(r: number, c: number, enter: boolean) {
    this.hovered.set(enter ? { r, c } : null);
  }

  @HostListener('document:keydown', ['$event'])
  onGlobalKey(ev: KeyboardEvent) {
    if (ev.key === '.') { ev.preventDefault(); this.store.togglePencilMode(); }
  }

  @HostListener('keydown', ['$event'])
  onKeydown(ev: KeyboardEvent) {
    if (!this.hasFocus()) return;
    const sel = this.store.selected();
    if (!sel) return;

    const { r, c } = sel;
    if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Tab'].includes(ev.key)) {
      ev.preventDefault();
      const next = this.moveSelection(r, c, ev.key, ev.shiftKey);
      this.store.select(next.r, next.c);
      return;
    }

    // Shift+Backspace clears pencils in cell
    if ((ev.key === 'Backspace' || ev.key === 'Delete') && ev.shiftKey) {
      ev.preventDefault();
      this.store.clearPencils(r, c);
      return;
    }

    // Value vs Pencil entry
    if (/^[1-9]$/.test(ev.key)) {
      ev.preventDefault();
      if (this.store.pencilMode()) {
        this.store.togglePencilDigitIfEnabled(r, c, Number(ev.key), true);

      } else {
        if (!this.isGiven(r, c) || this.store.editingGivenMode()) this.store.setCellValue(r, c, Number(ev.key) as any);
      }
      return;
    }

    if (ev.key === 'Backspace' || ev.key === 'Delete' || ev.key === '0') {
      ev.preventDefault();
      if (!this.isGiven(r, c) || this.store.editingGivenMode()) this.store.clearCell(r, c);
      return;
    }
  }

  hasFlashAt(r: number, c: number): boolean {
    const fs = this.store.flashes();
    if (!fs.length) return false;
    for (const f of fs) {
      if (f.kind === 'row' && f.index === r) return true;
      if (f.kind === 'col' && f.index === c) return true;
      if (f.kind === 'box') {
        const b = Math.floor(r / 3) * 3 + Math.floor(c / 3);
        if (b === f.index) return true;
      }
    }
    return false;
  }

  flashDelay(r: number, c: number): string | null {
    const fs = this.store.flashes();
    if (!fs.length) return null;
    let best = 0;
    for (const f of fs) {
      const o = f.origin;
      let steps = 0;
      if (f.kind === 'row') steps = Math.abs(c - o.c);
      else if (f.kind === 'col') steps = Math.abs(r - o.r);
      else steps = Math.abs(r - o.r) + Math.abs(c - o.c); // box
      if (steps > best) best = steps; // choose max for a clearer wave
    }
    return `${best * 60}ms`;
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
