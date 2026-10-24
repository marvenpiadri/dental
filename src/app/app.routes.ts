import { Routes } from '@angular/router';
import { permissionGuard } from './core/auth/permission.guard';

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
    path: 'practice',
    data: { titleKey: 'nav.practice' },
    loadComponent: () => import('./denteus/practice/practice.component').then((m) => m.PracticeComponent),
  },
  {
    path: 'reports',
    canActivate: [permissionGuard],
    data: { permission: 'reports', titleKey: 'nav.reports' },
    loadComponent: () => import('./denteus/reports/reports.component').then((m) => m.ReportsComponent),
  },
  {
    path: 'setup',
    canActivate: [permissionGuard],
    data: { permission: 'setup', titleKey: 'nav.setup' },
    loadComponent: () => import('./denteus/setup/clinic-setup.component').then((m) => m.ClinicSetupComponent),
  },
  {
    path: '**',
    data: { titleKey: 'notFound.title' },
    loadComponent: () => import('./not-found.component').then((m) => m.NotFoundComponent),
  },
];
