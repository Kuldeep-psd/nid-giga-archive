import { useOutletContext, useParams } from 'react-router';
import App, { ArchiveError, InitialLoading, NotFound, PageError } from './App.jsx';
import CollectionPage from './components/CollectionPage.jsx';
import { loadArchive, shouldRevalidate } from './lib/archive.js';

export const routes = [{
  id: 'archive', path: '/', loader: loadArchive, shouldRevalidate,
  Component: App, ErrorBoundary: ArchiveError, HydrateFallback: InitialLoading,
  children: [
    { index: true, Component: CollectionPage, ErrorBoundary: PageError },
    { path: 'maps/:projectId', ErrorBoundary: PageError, lazy: async () => {
      const { default: ProjectPage } = await import('./components/ProjectPage.jsx');
      return { Component: function ProjectRoute() {
        const { projectId } = useParams();
        const { projects } = useOutletContext();
        const project = projects.find(item => item.id === projectId);
        return project ? <ProjectPage key={project.id} project={project} /> : <NotFound />;
      } };
    } },
    { path: 'about', ErrorBoundary: PageError, lazy: async () => ({ Component: (await import('./components/AboutPage.jsx')).default }) },
    { path: '*', Component: NotFound },
  ],
}];
