import { CanMatchFn, Routes } from '@angular/router';
import { isLang } from './core/site';

const lang: CanMatchFn = (_r, segs) => isLang(segs[0]?.path);

export const routes: Routes = [
  { path: '', pathMatch: 'full', loadComponent: () => import('./pages/choose-language').then((m) => m.ChooseLanguage), title: 'Dontalist' },
  {
    path: ':lang',
    canMatch: [lang],
    loadComponent: () => import('./layout/shell').then((m) => m.Shell),
    children: [
      { path: '', pathMatch: 'full', loadComponent: () => import('./pages/home').then((m) => m.Home) },
      { path: 'clinics', loadComponent: () => import('./pages/clinics').then((m) => m.Clinics) },
      { path: 'partnership', loadComponent: () => import('./pages/partnership').then((m) => m.Partnership) },
      { path: 'about', loadComponent: () => import('./pages/about').then((m) => m.About) },
    ],
  },
  { path: '**', redirectTo: '' },
];
