'use client';

import { useState } from 'react';
import type { ProductImage } from '@/lib/api/types';

export function Gallery({ images, name }: { images: ProductImage[]; name: string }) {
  const [index, setIndex] = useState(0);
  const current = images[index] ?? images[0];
  return (
    <div className="gallery">
      <div className="main">
        {current ? (
          // The first image is the LCP element on a PDP (REQ-36): load it eagerly and early.
          <img src={current.url} alt={current.alt ?? name} width={600} height={600} fetchPriority="high" />
        ) : (
          <span className="muted">No image</span>
        )}
      </div>
      {images.length > 1 ? (
        <div className="thumbs" role="group" aria-label="Product images">
          {images.map((image, i) => (
            <button
              key={image.url + i}
              type="button"
              aria-pressed={i === index}
              aria-label={`Show image ${i + 1} of ${images.length}`}
              onClick={() => setIndex(i)}
            >
              <img src={image.url} alt="" width={56} height={56} loading="lazy" />
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
