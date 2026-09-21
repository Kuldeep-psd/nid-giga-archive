import { useLayoutEffect } from 'react';

// Scrolling belongs to the document. This only measures the pinned frame.
export function usePinnedLayout(active) {
  useLayoutEffect(() => {
    if (!active) return;
    const header = document.querySelector('.site-header');
    const sidebar = document.querySelector('.sidebar');
    const controls = document.querySelector('.collection-controls');
    if (!header || !sidebar) return;
    const compact = matchMedia('(max-width: 960px)');
    const setSize = (element, property, height) => {
      const value = `${height}px`;
      if (element.style.getPropertyValue(property) !== value) element.style.setProperty(property, value);
    };
    const measure = () => {
      const headerHeight = header.offsetHeight;
      const navHeight = compact.matches ? sidebar.offsetHeight : 0;
      setSize(document.body, '--archive-header-height', headerHeight);
      setSize(document.body, '--archive-nav-height', navHeight);
      setSize(document.documentElement, '--archive-sticky-offset', headerHeight + navHeight + (controls?.offsetHeight || 0));
    };
    const observer = new ResizeObserver(measure);
    [header, controls].filter(Boolean).forEach(node => observer.observe(node));
    const observeNavigation = () => {
      if (compact.matches) observer.observe(sidebar);
      else observer.unobserve(sidebar);
      measure();
    };
    // Browser chrome cannot grow the stable CSS cap; a keyboard can reduce it.
    const visibleHeight = () => setSize(document.body, '--archive-visible-height', window.visualViewport?.height || innerHeight);
    window.visualViewport?.addEventListener('resize', visibleHeight);
    compact.addEventListener('change', observeNavigation);
    visibleHeight();
    observeNavigation();
    return () => {
      observer.disconnect();
      compact.removeEventListener('change', observeNavigation);
      window.visualViewport?.removeEventListener('resize', visibleHeight);
      ['--archive-header-height', '--archive-nav-height', '--archive-visible-height'].forEach(property => document.body.style.removeProperty(property));
      document.documentElement.style.removeProperty('--archive-sticky-offset');
    };
  }, [active]);
}
