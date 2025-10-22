import { Routes } from '@angular/router';
import { inject } from '@angular/core';
import { Router } from '@angular/router';
import { SudokuStore } from './data/sudoku.store';

const hasBoardGuard = () => {
  const store = inject(SudokuStore);
  const router = inject(Router);
  const b = store.board();
  const hasAny = b.some(row => row.some(c => c.given || c.value));
  if (!hasAny) { router.navigate(['/home']); return false; }
  return true;
};

export const routes: Routes = [
  { path: '', pathMatch: 'full', redirectTo: 'home' },
  { path: 'home', loadComponent: () => import('./components/dashboard/dashboard').then(m => m.Dashboard) },
  { path: 'play', loadComponent: () => import('./components/play-page/play-page').then(m => m.PlayPage) },
  { path: 'solved', loadComponent: () => import('./components/solved/solved').then(m => m.Solved) },
  { path: '**', redirectTo: 'home' }
];
