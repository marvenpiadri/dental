import { Routes } from '@angular/router';
import { permissionGuard } from './core/auth/permission.guard';
import { publicClinic } from './denteus/public/public-route';

/** Every page is lazy: the first load carries the shell only. `titleKey` is translated by PageTitle. */
export const routes: Routes = [
  { path: '', pathMatch: 'full', loadComponent: () => import('./landing/landing.component').then((m) => m.LandingComponent) },
  { path: 'partnerships', loadComponent: () => import('./partnerships/partnerships.component').then((m) => m.PartnershipsComponent) },
  {
    path: 'today',
    canActivate: [permissionGuard],
    data: { permission: 'appointments.view', titleKey: 'nav.today' },
    loadComponent: () => import('./denteus/today/today.component').then((m) => m.TodayComponent),
  },
  {
    path: 'calendar',
    canActivate: [permissionGuard],
    data: { permission: 'appointments.view', titleKey: 'nav.calendar' },
    loadComponent: () => import('./denteus/calendar-page.component').then((m) => m.CalendarPageComponent),
  },
  {
    path: 'patients',
    canActivate: [permissionGuard],
    data: { permission: 'patients.view', titleKey: 'nav.patients' },
    children: [
      { path: '', loadComponent: () => import('./denteus/patients/patient-list.component').then((m) => m.PatientListComponent) },
      { path: 'new', canActivate: [permissionGuard], data: { permission: 'patients.create' }, loadComponent: () => import('./denteus/patients/patient-form.component').then((m) => m.PatientFormComponent) },
      { path: ':id', loadComponent: () => import('./denteus/patients/patient-profile.component').then((m) => m.PatientProfileComponent) },
      { path: ':id/edit', canActivate: [permissionGuard], data: { permission: 'patients.edit' }, loadComponent: () => import('./denteus/patients/patient-form.component').then((m) => m.PatientFormComponent) },
      { path: ':id/:page', loadComponent: () => import('./denteus/patients/patient-profile.component').then((m) => m.PatientProfileComponent) },
    ],
  },
  {
    path: 'doctors/:id',
    canActivate: [permissionGuard],
    data: { permission: 'appointments.view', titleKey: 'dr.title' },
    loadComponent: () => import('./denteus/doctors/doctor-profile.component').then((m) => m.DoctorProfileComponent),
  },
  {
    path: 'practice',
    canActivate: [permissionGuard],
    data: { permission: 'practice.view', titleKey: 'nav.practice' },
    loadComponent: () => import('./denteus/practice/practice.component').then((m) => m.PracticeComponent),
  },
  {
    path: 'reports',
    canActivate: [permissionGuard],
    data: { permission: 'reports.view', titleKey: 'nav.reports' },
    loadComponent: () => import('./denteus/reports/reports.component').then((m) => m.ReportsComponent),
  },
  {
    path: 'setup',
    canActivate: [permissionGuard],
    data: { anyOf: ['settings.view', 'profile.view', 'team.view', 'clinical.view'], titleKey: 'nav.setup' },
    children: [
      { path: '', loadComponent: () => import('./denteus/setup/clinic-setup.component').then((m) => m.ClinicSetupComponent) },
      { path: ':section', loadComponent: () => import('./denteus/setup/clinic-setup.component').then((m) => m.ClinicSetupComponent) },
    ],
  },
  {
    path: 'clinics/:country/:city/:slug',
    resolve: { lookup: publicClinic },
    loadComponent: () => import('./denteus/public/public-clinic.component').then((m) => m.PublicClinicComponent),
  },
  {
    path: 'preview',
    canActivate: [permissionGuard],
    data: { permission: 'profile.view', titleKey: 'prof.preview' },
    loadComponent: () => import('./denteus/public/clinic-preview.component').then((m) => m.ClinicPreviewComponent),
  },
  {
    path: '**',
    data: { titleKey: 'notFound.title' },
    loadComponent: () => import('./not-found.component').then((m) => m.NotFoundComponent),
  },
];
