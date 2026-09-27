import { Routes } from '@angular/router';
import { MainLayoutComponent } from './layout/main-layout/main-layout.component';
import { SmartcropShellComponent } from './pages/smartcrop/smartcrop-shell.component';
import { smartcropAuthGuard } from './core/guards/smartcrop-auth.guard';

export const routes: Routes = [
  { path: 'demo', redirectTo: 'smartcrop/demo', pathMatch: 'full' },
  {
    path: 'smartcrop',
    component: SmartcropShellComponent,
    children: [
      {
        path: '',
        loadComponent: () => import('./pages/smartcrop/smartcrop.component').then((m) => m.SmartcropComponent),
      },
      {
        path: 'demo',
        loadComponent: () =>
          import('./pages/smartcrop/demo/smartcrop-demo.component').then((m) => m.SmartcropDemoComponent),
      },
      {
        path: 'login',
        redirectTo: '',
        pathMatch: 'full',
      },
      {
        path: 'auth/callback',
        loadComponent: () =>
          import('./pages/smartcrop/auth/smartcrop-auth-callback.component').then(
            (m) => m.SmartcropAuthCallbackComponent,
          ),
      },
      {
        path: 'upload/:storeCode',
        loadComponent: () =>
          import('./pages/smartcrop/upload/smartcrop-web-upload.component').then(
            (m) => m.SmartcropWebUploadComponent,
          ),
      },
      {
        path: 'dashboard',
        canActivate: [smartcropAuthGuard],
        loadComponent: () =>
          import('./pages/smartcrop/dashboard/smartcrop-dashboard.component').then(
            (m) => m.SmartcropDashboardComponent,
          ),
      },
    ],
  },
  {
    path: '',
    component: MainLayoutComponent,
    children: [
      {
        path: '',
        loadComponent: () => import('./pages/home/home.component').then((m) => m.HomeComponent),
      },
      {
        path: 'about',
        loadComponent: () => import('./pages/about/about.component').then((m) => m.AboutComponent),
      },
      {
        path: 'projects',
        loadComponent: () => import('./pages/projects/projects.component').then((m) => m.ProjectsComponent),
      },
      {
        path: 'services',
        loadComponent: () => import('./pages/services/services.component').then((m) => m.ServicesComponent),
      },
      {
        path: 'cv',
        loadComponent: () => import('./pages/cv-builder/cv-builder.component').then((m) => m.CvBuilderComponent),
      },
      {
        path: 'cv/builder',
        loadComponent: () =>
          import('./pages/cv-builder/edit/cv-builder-edit.component').then((m) => m.CvBuilderEditComponent),
      },
      {
        path: 'contact',
        loadComponent: () => import('./pages/contact/contact.component').then((m) => m.ContactComponent),
      },
    ],
  },
  { path: '**', redirectTo: '' },
];
