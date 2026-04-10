import { Routes } from '@angular/router';
import { MainLayoutComponent } from './layout/main-layout/main-layout.component';

export const routes: Routes = [
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
        path: 'contact',
        loadComponent: () => import('./pages/contact/contact.component').then((m) => m.ContactComponent),
      },
    ],
  },
  { path: '**', redirectTo: '' },
];
