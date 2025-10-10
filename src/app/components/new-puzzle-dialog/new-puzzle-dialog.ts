import { Component, inject, signal } from '@angular/core';
import { MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { MatSelectModule } from '@angular/material/select';
import { MatRadioModule } from '@angular/material/radio';
import { FormsModule } from '@angular/forms';

export type Difficulty = 'easy' | 'medium' | 'hard' | 'expert';
export type Symmetry = 'none' | 'central' | 'diagonal';

@Component({
  selector: 'app-new-puzzle-dialog',
  imports: [MatDialogModule, MatButtonModule, MatSelectModule, MatRadioModule, FormsModule],
  templateUrl: './new-puzzle-dialog.html',
  styleUrl: './new-puzzle-dialog.scss'
})
export class NewPuzzleDialog {
  ref = inject(MatDialogRef<NewPuzzleDialog, { difficulty: Difficulty; symmetry: Symmetry }>);
  difficulty = signal<Difficulty>('medium');
  symmetry = signal<Symmetry>('central');

  create() { this.ref.close({ difficulty: this.difficulty(), symmetry: this.symmetry() }); }
}
