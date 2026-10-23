import { Routes } from '@angular/router';

/** Every page is lazy: the first load carries the shell only. `titleKey` is translated by PageTitle. */
export const routes: Routes = [
  { path: '', pathMatch: 'full', redirectTo: 'today' },
  {
    path: 'today',
    data: { titleKey: 'nav.today' },
    loadComponent: () => import('./denteus/today/today.component').then((m) => m.TodayComponent),
  },
  {
    path: 'calendar',
    data: { titleKey: 'nav.calendar' },
    loadComponent: () => import('./denteus/calendar-page.component').then((m) => m.CalendarPageComponent),
  },
  {
    path: 'patients',
    data: { titleKey: 'nav.patients' },
    children: [
      { path: '', loadComponent: () => import('./denteus/patients/patient-list.component').then((m) => m.PatientListComponent) },
      { path: 'new', loadComponent: () => import('./denteus/patients/patient-form.component').then((m) => m.PatientFormComponent) },
      { path: ':id', loadComponent: () => import('./denteus/patients/patient-profile.component').then((m) => m.PatientProfileComponent) },
      { path: ':id/edit', loadComponent: () => import('./denteus/patients/patient-form.component').then((m) => m.PatientFormComponent) },
    ],
  },
  {
    path: '**',
    data: { titleKey: 'notFound.title' },
    loadComponent: () => import('./not-found.component').then((m) => m.NotFoundComponent),
  },
];
