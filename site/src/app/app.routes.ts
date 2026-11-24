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
      { path: 'software', loadComponent: () => import('./pages/software').then((m) => m.Software) },
      { path: 'services', loadComponent: () => import('./pages/services').then((m) => m.Services) },
      { path: 'partnership', loadComponent: () => import('./pages/partnership').then((m) => m.Partnership) },
      { path: 'franchise', loadComponent: () => import('./pages/franchise').then((m) => m.Franchise) },
      { path: 'about', loadComponent: () => import('./pages/about').then((m) => m.About) },
    ],
  },
  { path: '**', redirectTo: '' },
];
