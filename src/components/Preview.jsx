import { useEffect, useRef, useState } from 'react';

export default function Preview({ as: Frame = 'div', className = '', src, width, height, alt, children, loading = 'lazy', fetchPriority, ...props }) {
  const image = useRef(null);
  const [settled, setSettled] = useState(null);
  const status = settled?.src === src ? settled.status : 'is-loading';
  const settle = node => setSettled({ src, status: node.naturalWidth > 0 ? 'is-loaded' : 'preview-unavailable' });
  useEffect(() => {
    if (image.current?.complete) settle(image.current);
  }, [src]);

  return <Frame data-preview className={`${className} ${status}${height > width ? ' is-portrait' : ''}`} {...props}>
    <img ref={image} src={src} width={width} height={height} alt={alt} loading={loading} decoding="async" fetchPriority={fetchPriority}
      onLoad={event => settle(event.currentTarget)} onError={event => settle(event.currentTarget)} />
    {children}
    {status === 'preview-unavailable' && <span className="preview-fallback" aria-hidden="true">Preview unavailable</span>}
  </Frame>;
}
