// Add the public Google Form URL here when submissions open.
export const siteConfig = Object.freeze({
  repositoryUrl: 'https://github.com/Kuldeep-psd/nid-giga-archive',
  submissionFormUrl: null,
});

export function validateSiteConfig(config) {
  const errors = [];
  if (!/^https:\/\/github\.com\/[\w-]+\/[\w.-]+$/.test(config?.repositoryUrl || '')) {
    errors.push('repositoryUrl must be a public GitHub repository URL.');
  }
  if (config?.submissionFormUrl !== null) {
    try {
      const url = new URL(config?.submissionFormUrl);
      const googleForm = url.hostname === 'forms.gle' || url.hostname === 'forms.google.com' ||
        (url.hostname === 'docs.google.com' && url.pathname.startsWith('/forms/'));
      if (url.protocol !== 'https:' || url.username || url.password || url.port || !googleForm) throw new Error();
    } catch { errors.push('submissionFormUrl must be null or an HTTPS Google Form URL.'); }
  }
  return errors;
}
