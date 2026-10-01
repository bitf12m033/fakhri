'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { FormStatus } from '@/components/FormStatus';
import { fromKarachiInput, toKarachiInput } from '@/components/admin/ops/time';
import { useAction } from '@/components/useAction';
import type { AdminBanner } from '@/lib/api/admin-ops-types';
import { bff } from '@/lib/api/client';
import { safeHref } from '@/lib/format';
import { HOME_HERO } from './links';

const POSITION = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export function BannerForm({ banner }: { banner?: AdminBanner }) {
  const router = useRouter();
  const action = useAction();
  const [title, setTitle] = useState(banner?.title ?? '');
  const [imageUrl, setImageUrl] = useState(banner?.imageUrl ?? '');
  const [linkUrl, setLinkUrl] = useState(banner?.linkUrl ?? '');
  const [position, setPosition] = useState(banner?.position ?? HOME_HERO);
  const [sortOrder, setSortOrder] = useState(String(banner?.sortOrder ?? 0));
  const [isActive, setIsActive] = useState(true);
  const [startsAt, setStartsAt] = useState(toKarachiInput(banner?.startsAt));
  const [endsAt, setEndsAt] = useState(toKarachiInput(banner?.endsAt));

  const validate = (): Record<string, unknown> | string => {
    if (!/^https?:\/\/\S+$/.test(imageUrl.trim())) return 'Image URL must be a full http(s):// address.';
    if (linkUrl.trim() && !safeHref(linkUrl)) {
      return 'Link must be a path on this site (starting with /) or a full http(s):// address.';
    }
    if (!POSITION.test(position)) return 'Position must be lowercase letters, numbers and hyphens, e.g. home-hero.';
    if (!/^\d+$/.test(sortOrder)) return 'Sort order must be a whole number, 0 or more.';
    const starts = startsAt ? fromKarachiInput(startsAt) : undefined;
    const ends = endsAt ? fromKarachiInput(endsAt) : undefined;
    if ((startsAt && !starts) || (endsAt && !ends)) return 'Schedule dates are not valid.';
    if (starts && ends && starts > ends) return 'The banner must start before it ends.';
    if (banner && ((banner.startsAt && !starts) || (banner.endsAt && !ends))) {
      return 'A schedule date cannot be removed once set. Pick a new date, or deactivate the banner.';
    }
    return {
      // Blank title and link are sent as '' on edit so they can be cleared.
      ...(title.trim() || banner ? { title: title.trim() } : {}),
      imageUrl: imageUrl.trim(),
      ...(linkUrl.trim() || banner ? { linkUrl: linkUrl.trim() } : {}),
      position,
      sortOrder: Number(sortOrder),
      ...(banner ? {} : { isActive }),
      ...(starts ? { startsAt: starts } : {}),
      ...(ends ? { endsAt: ends } : {}),
    };
  };

  return (
    <form
      className="panel stack"
      onSubmit={async (e) => {
        e.preventDefault();
        const body = validate();
        if (typeof body === 'string') {
          action.setError(body);
          return;
        }
        if (banner) {
          await action.run(() => bff(`/admin/content/banners/${banner.id}`, { method: 'PATCH', body }), {
            success: 'Banner saved.',
          });
          return;
        }
        const created = await action.run(
          () => bff<AdminBanner>('/admin/content/banners', { method: 'POST', body }),
          { refresh: false },
        );
        if (created) router.push(`/admin/content/banners/${created.data.id}?created=1`);
      }}
    >
      <FormStatus error={action.error} message={action.message} />
      <div className="form-grid">
        <div className="field wide">
          <label htmlFor="banner-image">Image URL</label>
          <input
            id="banner-image"
            type="url"
            value={imageUrl}
            onChange={(e) => setImageUrl(e.target.value)}
            maxLength={500}
            required
            aria-describedby="banner-image-hint"
          />
          <span className="hint" id="banner-image-hint">
            A wide image (about 16:6). Upload it to media storage first and paste its address.
          </span>
        </div>
        <div className="field">
          <label htmlFor="banner-title">Headline (optional)</label>
          <input
            id="banner-title"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            maxLength={160}
            aria-describedby="banner-title-hint"
          />
          <span className="hint" id="banner-title-hint">
            Shown over the image, and used as its alt text.
          </span>
        </div>
        <div className="field">
          <label htmlFor="banner-link">Link (optional)</label>
          <input
            id="banner-link"
            value={linkUrl}
            onChange={(e) => setLinkUrl(e.target.value)}
            maxLength={500}
            placeholder="/category/led-tvs"
          />
        </div>
        <div className="field">
          <label htmlFor="banner-position">Position</label>
          <input
            id="banner-position"
            list="banner-positions"
            value={position}
            onChange={(e) => setPosition(e.target.value.toLowerCase())}
            maxLength={40}
            required
            aria-describedby="banner-position-hint"
          />
          <datalist id="banner-positions">
            <option value={HOME_HERO} />
          </datalist>
          <span className="hint" id="banner-position-hint">
            The storefront shows banners in <code>{HOME_HERO}</code> on the home page. Other positions are stored but
            not displayed yet.
          </span>
        </div>
        <div className="field">
          <label htmlFor="banner-sort">Sort order</label>
          <input
            id="banner-sort"
            type="number"
            min={0}
            step={1}
            value={sortOrder}
            onChange={(e) => setSortOrder(e.target.value)}
            aria-describedby="banner-sort-hint"
          />
          <span className="hint" id="banner-sort-hint">
            Lower numbers come first.
          </span>
        </div>
        <div className="field">
          <label htmlFor="banner-starts">Starts (Pakistan time, optional)</label>
          <input id="banner-starts" type="datetime-local" value={startsAt} onChange={(e) => setStartsAt(e.target.value)} />
        </div>
        <div className="field">
          <label htmlFor="banner-ends">Ends (optional)</label>
          <input id="banner-ends" type="datetime-local" value={endsAt} onChange={(e) => setEndsAt(e.target.value)} />
        </div>
        {banner ? null : (
          <label className="check wide" htmlFor="banner-active">
            <input id="banner-active" type="checkbox" checked={isActive} onChange={(e) => setIsActive(e.target.checked)} />
            Active (shown during its schedule)
          </label>
        )}
      </div>
      <div className="row">
        <button type="submit" disabled={action.pending}>
          {banner ? 'Save banner' : 'Create banner'}
        </button>
      </div>
    </form>
  );
}
