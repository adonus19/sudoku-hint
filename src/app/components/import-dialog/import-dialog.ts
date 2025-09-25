import { Component, inject, signal, computed } from '@angular/core';
import { MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatButtonModule } from '@angular/material/button';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { SudokuStore } from '../../data/sudoku.store';

@Component({
  selector: 'app-import-dialog',
  imports: [MatDialogModule, MatFormFieldModule, MatInputModule, MatButtonModule, ReactiveFormsModule],
  templateUrl: './import-dialog.html',
  styleUrl: './import-dialog.scss'
})
export class ImportDialog {
  #ref = inject(MatDialogRef<ImportDialog>);
  #store = inject(SudokuStore);

  input = new FormControl<string>('', { nonNullable: true });

  length = computed(() => (this.input.value || '').replace(/\s+/g, '').length);
  error = computed(() => this.validateString(this.input.value || ''));

  doImport() {
    const str = (this.input.value || '').replace(/\s+/g, '');
    const err = this.validateString(str);
    if (err) return;
    this.#store.loadFromString(str);
    this.#ref.close();
  }

  validateString(s: string): string | null {
    const trimmed = s.replace(/\s+/g, '');
    if (trimmed.length !== 81) return 'Must be exactly 81 characters (ignoring whitespace).';
    if (!/^[0-9.]+$/.test(trimmed)) return 'Only digits and "." are allowed.';
    if (!/[1-9]/.test(trimmed)) return 'At least one given (1–9) is required.';
    return null;
  }
}
